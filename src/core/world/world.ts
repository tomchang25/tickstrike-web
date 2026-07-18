import type { CombatEvent } from "../events/combat-events";
import { RandomStreams } from "../random/random-streams";
import {
  cellKey,
  manhattanDistance,
  sameCell,
  type ArenaState,
  type BasicEnemyActionDefinition,
  type BasicHitResult,
  type Cell,
  type CommittedAttack,
  type DamageResult,
  type DirectionalHitResult,
  type EnemyDecision,
  type EntityId,
  type EntityState,
  type EncounterOutcome,
  type GuardRuntime,
  isTerminalPhase,
  type Reservation,
  type ReservationPurpose,
  type Seed,
  type Telegraph,
  type TelegraphPhase,
  type TileKind,
  type WorldSnapshot,
} from "../model/types";
import { Arena } from "./arena";

export interface SpawnEntityInput {
  readonly id: EntityId;
  readonly kind: EntityState["kind"];
  readonly archetype: string;
  readonly cell: Cell;
  readonly footprint?: readonly Cell[];
  readonly hp: number;
  readonly defense?: number;
  readonly guardDefinition?: import("../content/actor-schema").GuardDefinition;
  readonly normalAttackDamage?: number;
  readonly mobilityAttackDamage?: number;
  readonly enemyAction?: BasicEnemyActionDefinition;
  readonly facing?: Cell;
}

export interface ReservationRequest {
  readonly ownerId: string;
  readonly purpose: ReservationPurpose;
  readonly cells: readonly Cell[];
  readonly activeStep?: boolean;
}

export interface ReservationDecision {
  readonly accepted: boolean;
  readonly granted: boolean;
  readonly reservation?: Reservation;
  readonly lostOwners: readonly string[];
  readonly reason?: string;
}

export interface TelegraphInput {
  readonly sourceId: string;
  readonly phase: TelegraphPhase;
  readonly cells: readonly Cell[];
}

export interface EnemyAttackResolution {
  readonly attack: CommittedAttack;
  readonly target: Cell;
  readonly damage?: DamageResult;
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneReservation(reservation: Reservation): Reservation {
  return { ...reservation, cells: reservation.cells.map(cloneCell) };
}

function cloneTelegraph(telegraph: Telegraph): Telegraph {
  return { ...telegraph, cells: telegraph.cells.map(cloneCell) };
}

function cloneEnemyAction(action: BasicEnemyActionDefinition): BasicEnemyActionDefinition {
  return { ...action, offsets: action.offsets.map(cloneCell) };
}

function cloneCommittedAttack(attack: CommittedAttack): CommittedAttack {
  return { ...attack, cells: attack.cells.map(cloneCell) };
}

function cloneGuard(guard: GuardRuntime): GuardRuntime {
  return { ...guard };
}

function cloneEntity(entity: EntityState): EntityState {
  return {
    ...entity,
    cell: cloneCell(entity.cell),
    footprint: entity.footprint.map(cloneCell),
    ...(entity.guard ? { guard: cloneGuard(entity.guard) } : {}),
    ...(entity.enemyAction ? { enemyAction: cloneEnemyAction(entity.enemyAction) } : {}),
    ...(entity.facing ? { facing: cloneCell(entity.facing) } : {}),
    ...(entity.committedAttack ? { committedAttack: cloneCommittedAttack(entity.committedAttack) } : {}),
  };
}

function hasDuplicateCells(cells: readonly Cell[]): boolean {
  const keys = new Set(cells.map(cellKey));
  return keys.size !== cells.length;
}

function purposePriority(purpose: ReservationPurpose, activeStep: boolean): number {
  if (activeStep && (purpose === "movement" || purpose === "movement_step")) return 0;
  if (purpose === "attack" || purpose === "attack_intent") return 1;
  return 2;
}

export class World {
  readonly arena: ArenaState;
  readonly seed: number;
  readonly rootSeed: number;
  readonly random: RandomStreams;
  readonly streams: RandomStreams;

  private readonly geometry: Arena;
  private readonly entities = new Map<EntityId, EntityState>();
  private readonly occupancy = new Map<string, EntityId>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly telegraphs = new Map<string, Telegraph>();
  private currentPlayerCell: Cell | undefined;
  private currentArmedSmashTarget: Cell | undefined;
  private currentTick = 0;
  private currentOutcome: EncounterOutcome = "running";
  private nextRegistrationIndex = 0;
  private lastEvents: readonly CombatEvent[] = [];

  constructor(arena: Arena, seed?: Seed);
  constructor(width: number, height: number, tiles: readonly TileKind[], seed?: Seed);
  constructor(
    arenaOrWidth: Arena | number,
    heightOrSeed?: number | Seed,
    tiles?: readonly TileKind[],
    seed?: Seed,
  ) {
    const isArena = arenaOrWidth instanceof Arena;
    this.geometry = isArena
      ? arenaOrWidth
      : Arena.fromTiles(arenaOrWidth, typeof heightOrSeed === "number" ? heightOrSeed : 0, tiles ?? []);
    const rootSeed = isArena ? heightOrSeed : seed;
    this.seed = new RandomStreams(rootSeed ?? 0).rootSeed;
    this.rootSeed = this.seed;
    this.random = new RandomStreams(this.seed);
    this.streams = this.random;
    this.arena = this.geometry.toState();
  }

  spawn(input: SpawnEntityInput): EntityState {
    if (this.entities.has(input.id)) throw new Error(`Entity already exists: ${input.id}`);
    if (input.kind === "player" && this.currentPlayerCell) {
      throw new Error("Only one player can exist in the world.");
    }

    const footprint = input.footprint ? input.footprint.map(cloneCell) : [cloneCell(input.cell)];
    this.validateNewFootprint(input.id, input.cell, footprint);
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
      if (this.reservationAt(cell)) throw new Error(`Cell ${cellKey(cell)} is reserved.`);
    }

    const entity: EntityState = {
      id: input.id,
      kind: input.kind,
      archetype: input.archetype,
      cell: cloneCell(input.cell),
      footprint,
      hp: input.hp,
      maxHp: input.hp,
      defense: input.defense ?? 0,
      ...(input.guardDefinition
        ? {
            guard: {
              id: input.guardDefinition.id,
              current: input.guardDefinition.base,
              max: input.guardDefinition.base,
              staggerDuration: input.guardDefinition.stagger,
              protectionDuration: input.guardDefinition.protection,
              protectionMultiplier: input.guardDefinition.protectionMultiplier,
            },
          }
        : {}),
      normalAttackDamage: input.normalAttackDamage,
      mobilityAttackDamage: input.mobilityAttackDamage,
      ...(input.enemyAction
        ? {
            enemyAction: cloneEnemyAction(input.enemyAction),
            activity: "ready" as const,
            facing: cloneCell(input.facing ?? { x: 1, y: 0 }),
          }
        : {}),
      phase: "alive",
    };
    this.entities.set(entity.id, entity);
    this.claimFootprint(entity.id, entity.footprint);
    if (entity.kind === "player") this.currentPlayerCell = cloneCell(entity.cell);
    return cloneEntity(entity);
  }

  getEntity(id: EntityId): EntityState | undefined {
    const entity = this.entities.get(id);
    return entity ? cloneEntity(entity) : undefined;
  }

  requireEntity(id: EntityId): EntityState {
    const entity = this.getEntity(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    return entity;
  }

  listEntities(): readonly EntityState[] {
    return [...this.entities.values()].map(cloneEntity);
  }

  listActiveEntities(): readonly EntityState[] {
    return [...this.entities.values()]
      .filter((entity) => !isTerminalPhase(entity.phase))
      .map(cloneEntity);
  }

  get playerCell(): Cell | undefined {
    return this.currentPlayerCell ? cloneCell(this.currentPlayerCell) : undefined;
  }

  get tick(): number {
    return this.currentTick;
  }

  get outcome(): EncounterOutcome {
    return this.currentOutcome;
  }

  updateEncounterOutcome(): EncounterOutcome | undefined {
    if (this.currentOutcome !== "running") return undefined;

    const player = [...this.entities.values()].find((entity) => entity.kind === "player");
    if (player && player.phase !== "alive") {
      this.currentOutcome = "defeat";
      return this.currentOutcome;
    }

    const enabledEnemies = [...this.entities.values()].filter(
      (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
    );
    if (enabledEnemies.length > 0 && enabledEnemies.every((enemy) => isTerminalPhase(enemy.phase))) {
      this.currentOutcome = "victory";
      return this.currentOutcome;
    }

    return undefined;
  }

  get armedSmashTarget(): Cell | undefined {
    return this.currentArmedSmashTarget ? cloneCell(this.currentArmedSmashTarget) : undefined;
  }

  armSmash(target: Cell): void {
    if (this.currentArmedSmashTarget) throw new Error("Smash is already armed.");
    this.currentArmedSmashTarget = cloneCell(target);
  }

  clearArmedSmash(): void {
    this.currentArmedSmashTarget = undefined;
  }

  getOccupantAt(cell: Cell): EntityState | undefined {
    const id = this.occupancy.get(cellKey(cell));
    return id ? this.getEntity(id) : undefined;
  }

  isOccupied(cell: Cell): boolean {
    return this.occupancy.has(cellKey(cell));
  }

  findAliveAt(cell: Cell, kind?: EntityState["kind"]): EntityState | undefined {
    const entity = this.getOccupantAt(cell);
    if (!entity || (kind && entity.kind !== kind)) return undefined;
    return sameCell(entity.cell, cell) || entity.footprint.some((occupied) => sameCell(occupied, cell))
      ? entity
      : undefined;
  }

  listAliveEnemiesAround(center: Cell, radius: number): readonly EntityState[] {
    return [...this.entities.values()]
      .filter((entity) => {
        if (entity.kind !== "enemy" || entity.phase !== "alive") return false;
        const dx = Math.abs(entity.cell.x - center.x);
        const dy = Math.abs(entity.cell.y - center.y);
        return dx <= radius && dy <= radius;
      })
      .map(cloneEntity);
  }

  moveEntity(id: EntityId, to: Cell): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (isTerminalPhase(entity.phase)) throw new Error(`Cannot move terminal entity: ${id}`);

    const footprint = this.translateFootprint(entity, to);
    this.validateActiveFootprint(id, footprint);
    this.replaceEntityPlacement(entity, { ...entity, cell: cloneCell(to), footprint });
  }

  setPhase(id: EntityId, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (entity.phase === phase) return;

    if (isTerminalPhase(phase)) {
      this.releaseFootprint(entity.id, entity.footprint);
      this.releaseReservation(entity.id);
      this.clearTelegraph(entity.id);
      if (entity.kind === "player") this.clearArmedSmash();
      this.entities.set(id, {
        ...entity,
        phase,
        activity: undefined,
        recoveryTicks: undefined,
        committedAttack: undefined,
        lastDecision: undefined,
        guard: entity.guard ? { ...entity.guard, current: 0 } : undefined,
        staggerTicks: undefined,
        protectionTicks: undefined,
      });
      return;
    }

    this.validateActiveFootprint(id, entity.footprint);
    this.claimFootprint(id, entity.footprint);
    this.entities.set(id, { ...entity, phase });
  }

  applyDamage(targetId: EntityId, damage: number): DamageResult | undefined {
    if (!Number.isFinite(damage) || damage <= 0) throw new Error("Damage must be a positive finite number.");

    const entity = this.entities.get(targetId);
    if (!entity || isTerminalPhase(entity.phase)) return undefined;

    const hpAfter = Math.max(0, entity.hp - damage);
    const killed = hpAfter === 0;
    if (killed) this.setPhase(targetId, "dead");

    this.entities.set(targetId, { ...this.entities.get(targetId)!, hp: hpAfter });
    return {
      targetId,
      damage,
      hpBefore: entity.hp,
      hpAfter,
      killed,
    };
  }

  applyBasicHit(hit: BasicHitResult): BasicHitResult | undefined {
    const damage = this.applyDamage(hit.targetId, hit.damage);
    if (!damage) return undefined;
    return { ...damage, attackerId: hit.attackerId };
  }

  applyDirectionalHit(hit: DirectionalHitResult): DirectionalHitResult | undefined {
    const entity = this.entities.get(hit.targetId);
    if (!entity || isTerminalPhase(entity.phase)) return undefined;

    this.entities.set(hit.targetId, {
      ...entity,
      hp: hit.hpAfter,
      ...(entity.guard ? { guard: { ...entity.guard, current: hit.guardAfter } } : {}),
    });

    if (hit.guardBroken && !hit.killed && entity.enemyAction && entity.activity !== "staggered") {
      this.releaseReservation(entity.id);
      this.clearTelegraph(entity.id);
      const current = this.entities.get(entity.id)!;
      const staggerTicks = current.guard?.staggerDuration ?? 0;
      this.entities.set(entity.id, {
        ...current,
        activity: "staggered",
        recoveryTicks: undefined,
        committedAttack: undefined,
        staggerTicks,
        protectionTicks: undefined,
      });
    }

    if (hit.killed) this.setPhase(hit.targetId, "dead");
    return { ...hit };
  }

  setEnemyFacing(id: EntityId, facing: Cell): void {
    const entity = this.entities.get(id);
    if (!entity?.enemyAction) throw new Error(`Entity is not an enabled basic enemy: ${id}`);
    if (entity.phase !== "alive") throw new Error(`Cannot turn terminal entity: ${id}`);
    if (!Number.isInteger(facing.x) || !Number.isInteger(facing.y) || Math.abs(facing.x) + Math.abs(facing.y) !== 1) {
      throw new Error("Enemy facing must be cardinal.");
    }
    this.entities.set(id, { ...entity, facing: cloneCell(facing) });
  }

  setEnemyDecision(id: EntityId, decision: EnemyDecision): void {
    const entity = this.entities.get(id);
    if (!entity?.enemyAction) throw new Error(`Entity is not an enabled basic enemy: ${id}`);
    this.entities.set(id, { ...entity, lastDecision: decision });
  }

  setEnemyActivity(id: EntityId, activity: EntityState["activity"], recoveryTicks?: number): void {
    const entity = this.entities.get(id);
    if (!entity?.enemyAction) throw new Error(`Entity is not an enabled basic enemy: ${id}`);
    if (entity.phase !== "alive") return;
    this.entities.set(id, {
      ...entity,
      activity,
      recoveryTicks: recoveryTicks === undefined ? undefined : recoveryTicks,
      ...(activity !== "staggered" ? { staggerTicks: undefined } : {}),
    });
  }

  resetEnemyCombatState(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity?.enemyAction || entity.phase !== "alive") return;
    this.releaseReservation(id);
    this.clearTelegraph(id);
    this.entities.set(id, {
      ...entity,
      activity: "ready",
      lastDecision: undefined,
      recoveryTicks: undefined,
      committedAttack: undefined,
      staggerTicks: undefined,
      protectionTicks: undefined,
      ...(entity.guard ? { guard: { ...entity.guard, current: entity.guard.max } } : {}),
    });
  }

  advanceEnemyStatuses(): readonly CombatEvent[] {
    const events: CombatEvent[] = [];
    for (const entity of this.entities.values()) {
      if (entity.phase !== "alive" || !entity.enemyAction || !entity.guard) continue;
      if (entity.activity === "staggered") {
        const ticks = entity.staggerTicks ?? 0;
        if (ticks > 1) {
          this.entities.set(entity.id, { ...entity, staggerTicks: ticks - 1 });
          continue;
        }

        const guard = { ...entity.guard, current: entity.guard.max };
        this.entities.set(entity.id, {
          ...entity,
          guard,
          activity: "ready",
          staggerTicks: undefined,
          protectionTicks: guard.protectionDuration,
        });
        events.push({
          type: "enemy_stagger_ended",
          enemyId: entity.id,
          guard: guard.current,
          maxGuard: guard.max,
        });
        events.push({
          type: "enemy_protection_started",
          enemyId: entity.id,
          ticks: guard.protectionDuration,
        });
        continue;
      }

      const protectionTicks = entity.protectionTicks ?? 0;
      if (protectionTicks <= 0) continue;
      if (protectionTicks === 1) {
        this.entities.set(entity.id, { ...entity, protectionTicks: undefined });
        events.push({ type: "enemy_protection_ended", enemyId: entity.id });
      } else {
        this.entities.set(entity.id, { ...entity, protectionTicks: protectionTicks - 1 });
      }
    }
    return events;
  }

  commitEnemyAttack(id: EntityId, attack: CommittedAttack): CommittedAttack {
    const entity = this.entities.get(id);
    if (!entity?.enemyAction || entity.phase !== "alive" || entity.activity !== "ready") {
      throw new Error(`Enemy cannot commit an attack: ${id}`);
    }
    const committed = cloneCommittedAttack(attack);
    this.setTelegraph({ sourceId: id, phase: "warning", cells: committed.cells });
    this.entities.set(id, {
      ...entity,
      activity: "telegraphing",
      recoveryTicks: undefined,
      committedAttack: committed,
    });
    return cloneCommittedAttack(committed);
  }

  decrementEnemyAttackWarning(id: EntityId): CommittedAttack | undefined {
    const entity = this.entities.get(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") return undefined;
    const next = { ...attack, warningTicks: Math.max(0, attack.warningTicks - 1) };
    this.entities.set(id, { ...entity, committedAttack: next });
    return cloneCommittedAttack(next);
  }

  resolveCommittedEnemyAttack(id: EntityId): EnemyAttackResolution | undefined {
    const entity = this.entities.get(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") return undefined;
    const playerCell = this.playerCell;
    const target = playerCell ?? attack.cells[0] ?? { x: 0, y: 0 };
    this.clearTelegraph(id);
    this.entities.set(id, {
      ...entity,
      activity: "recovering",
      recoveryTicks: attack.recoveryTicks,
      committedAttack: undefined,
    });
    const damage = playerCell && attack.cells.some((cell) => sameCell(cell, playerCell))
      ? this.applyDamage("player", attack.damage)
      : undefined;
    return { attack: cloneCommittedAttack(attack), target: cloneCell(target), damage };
  }

  advanceEnemyRecovery(id: EntityId): boolean {
    const entity = this.entities.get(id);
    if (!entity || entity.activity !== "recovering") return false;
    const ticks = entity.recoveryTicks ?? 0;
    if (ticks > 1) {
      this.entities.set(id, { ...entity, recoveryTicks: ticks - 1 });
      return false;
    }
    this.entities.set(id, { ...entity, activity: "ready", recoveryTicks: undefined });
    return true;
  }

  moveEntityToPhase(id: EntityId, to: Cell, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (!isTerminalPhase(phase)) {
      this.moveEntity(id, to);
      this.setPhase(id, phase);
      return;
    }

    const footprint = this.translateFootprint(entity, to);
    this.validateTerminalFootprint(id, footprint);
    this.releaseFootprint(entity.id, entity.footprint);
    this.releaseReservation(entity.id);
    this.clearTelegraph(entity.id);
    this.entities.set(id, {
      ...entity,
      cell: cloneCell(to),
      footprint,
      phase,
      activity: undefined,
      recoveryTicks: undefined,
      committedAttack: undefined,
      lastDecision: undefined,
      staggerTicks: undefined,
      protectionTicks: undefined,
      guard: entity.guard ? { ...entity.guard, current: 0 } : undefined,
    });
  }

  removeEntity(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.releaseFootprint(entity.id, entity.footprint);
    this.releaseReservation(id);
    this.clearTelegraph(id);
    this.entities.delete(id);
    if (entity.kind === "player") {
      this.currentPlayerCell = undefined;
      this.clearArmedSmash();
    }
  }

  tileAt(cell: Cell): TileKind {
    return this.geometry.tileAt(cell);
  }

  isInside(cell: Cell): boolean {
    return this.geometry.isInBounds(cell);
  }

  isLegalCell(cell: Cell): boolean {
    return this.geometry.isLegalCell(cell);
  }

  isWalkable(cell: Cell): boolean {
    const reservation = this.reservationAt(cell);
    return this.geometry.isLegalCell(cell) && !this.isOccupied(cell) && !reservation;
  }

  getRandomStream(domain: string) {
    return this.random.get(domain);
  }

  previewReservation(request: ReservationRequest): ReservationDecision {
    const cells = request.cells.map(cloneCell);
    if (cells.length === 0 || hasDuplicateCells(cells)) {
      return { accepted: false, granted: false, lostOwners: [], reason: "Reservation cells must be unique and non-empty." };
    }
    if (!cells.every((cell) => this.geometry.isLegalCell(cell))) {
      return { accepted: false, granted: false, lostOwners: [], reason: "Reservation cells must be legal land cells." };
    }

    const current = this.reservations.get(request.ownerId);
    const conflicts = [...this.reservations.values()].filter(
      (reservation) =>
        reservation.ownerId !== request.ownerId &&
        reservation.cells.some((reserved) => cells.some((cell) => sameCell(cell, reserved))),
    );
    const registrationIndex = current?.registrationIndex ?? this.nextRegistrationIndex;
    const candidate: Reservation = {
      ownerId: request.ownerId,
      purpose: request.purpose,
      cells,
      activeStep: request.activeStep ?? false,
      registrationIndex,
    };
    const defeated = conflicts.filter((reservation) => this.compareReservations(candidate, reservation) > 0);
    if (defeated.length > 0) {
      return {
        accepted: true,
        granted: false,
        lostOwners: [],
        reason: "Reservation lost arbitration.",
      };
    }
    return {
      accepted: true,
      granted: true,
      reservation: cloneReservation(candidate),
      lostOwners: conflicts.map((reservation) => reservation.ownerId),
    };
  }

  requestReservation(request: ReservationRequest): ReservationDecision {
    const decision = this.previewReservation(request);
    if (!decision.granted || !decision.reservation) return decision;

    this.releaseReservation(request.ownerId);
    for (const ownerId of decision.lostOwners) this.releaseReservation(ownerId);
    if (this.reservations.get(request.ownerId)) {
      throw new Error(`Reservation owner remained after replacement: ${request.ownerId}`);
    }
    const reservation = {
      ...decision.reservation,
      registrationIndex: decision.reservation.registrationIndex === this.nextRegistrationIndex
        ? this.nextRegistrationIndex++
        : decision.reservation.registrationIndex,
    };
    this.reservations.set(request.ownerId, reservation);
    return { ...decision, reservation: cloneReservation(reservation) };
  }

  getReservation(ownerId: string): Reservation | undefined {
    const reservation = this.reservations.get(ownerId);
    return reservation ? cloneReservation(reservation) : undefined;
  }

  listReservations(): readonly Reservation[] {
    return [...this.reservations.values()].map(cloneReservation);
  }

  reservationAt(cell: Cell): Reservation | undefined {
    const reservation = [...this.reservations.values()].find((candidate) =>
      candidate.cells.some((reserved) => sameCell(reserved, cell)),
    );
    return reservation ? cloneReservation(reservation) : undefined;
  }

  isReserved(cell: Cell, excludingOwnerId?: string): boolean {
    const reservation = this.reservationAt(cell);
    return Boolean(reservation && reservation.ownerId !== excludingOwnerId);
  }

  releaseReservation(ownerId: string): boolean {
    return this.reservations.delete(ownerId);
  }

  setTelegraph(input: TelegraphInput): Telegraph {
    if (input.cells.length === 0 || hasDuplicateCells(input.cells)) {
      throw new Error("Telegraph cells must be unique and non-empty.");
    }
    if (!input.cells.every((cell) => this.geometry.isInBounds(cell))) {
      throw new Error("Telegraph cells must be inside the arena.");
    }
    const telegraph: Telegraph = {
      sourceId: input.sourceId,
      phase: input.phase,
      cells: input.cells.map(cloneCell),
    };
    this.telegraphs.set(input.sourceId, telegraph);
    return cloneTelegraph(telegraph);
  }

  addTelegraph(input: TelegraphInput): Telegraph {
    return this.setTelegraph(input);
  }

  getTelegraph(sourceId: string): Telegraph | undefined {
    const telegraph = this.telegraphs.get(sourceId);
    return telegraph ? cloneTelegraph(telegraph) : undefined;
  }

  listTelegraphs(): readonly Telegraph[] {
    return [...this.telegraphs.values()].map(cloneTelegraph);
  }

  getTelegraphsAt(cell: Cell): readonly Telegraph[] {
    return [...this.telegraphs.values()]
      .filter((telegraph) => telegraph.cells.some((candidate) => sameCell(candidate, cell)))
      .map(cloneTelegraph);
  }

  clearTelegraph(sourceId: string): boolean {
    return this.telegraphs.delete(sourceId);
  }

  clearTelegraphs(): void {
    this.telegraphs.clear();
  }

  advancePlayerAction(): CombatEvent {
    this.currentTick += 1;
    return {
      type: "world_advanced",
      tick: this.currentTick,
      phases: ["foundation", "enemy"],
    };
  }

  advanceTick(): void {
    this.currentTick += 1;
  }

  recordEvents(events: readonly CombatEvent[]): void {
    this.lastEvents = events.map((event) => structuredClone(event));
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.currentTick,
      outcome: this.currentOutcome,
      arena: {
        ...this.arena,
        terrain: [...this.arena.terrain],
        tiles: [...this.arena.tiles],
      },
      playerCell: this.playerCell,
      armedSmashTarget: this.armedSmashTarget,
      entities: this.listEntities(),
      reservations: this.listReservations(),
      telegraphs: this.listTelegraphs(),
      seed: this.seed,
      lastEvents: this.lastEvents.map((event) => structuredClone(event)),
    };
  }

  private compareReservations(a: Reservation, b: Reservation): number {
    const priorityA = purposePriority(a.purpose, a.activeStep);
    const priorityB = purposePriority(b.purpose, b.activeStep);
    if (priorityA !== priorityB) return priorityA - priorityB;

    const player = this.currentPlayerCell;
    if (player) {
      const entityA = this.entities.get(a.ownerId);
      const entityB = this.entities.get(b.ownerId);
      const distanceA = manhattanDistance(entityA?.cell ?? a.cells[0]!, player);
      const distanceB = manhattanDistance(entityB?.cell ?? b.cells[0]!, player);
      if (distanceA !== distanceB) return distanceA - distanceB;
    }
    return a.registrationIndex - b.registrationIndex;
  }

  private validateNewFootprint(id: EntityId, anchor: Cell, footprint: readonly Cell[]): void {
    if (!this.isInside(anchor)) throw new Error(`Cannot spawn ${id} outside the arena.`);
    if (footprint.length === 0) throw new Error(`Cannot spawn ${id} with an empty footprint.`);
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot spawn ${id} with duplicate footprint cells.`);
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot spawn ${id} on a non-walkable footprint.`);
    }
  }

  private validateActiveFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot place ${id} on a non-walkable footprint.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
      const reservation = this.reservationAt(cell);
      if (reservation && reservation.ownerId !== id) throw new Error(`Cell ${cellKey(cell)} is reserved.`);
    }
  }

  private validateTerminalFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    if (footprint.some((cell) => !this.isInside(cell))) throw new Error(`Cannot move ${id} outside the arena.`);
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
    }
  }

  private translateFootprint(entity: EntityState, to: Cell): readonly Cell[] {
    const dx = to.x - entity.cell.x;
    const dy = to.y - entity.cell.y;
    return entity.footprint.map((cell) => ({ x: cell.x + dx, y: cell.y + dy }));
  }

  private claimFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) this.occupancy.set(cellKey(cell), id);
  }

  private releaseFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) {
      const key = cellKey(cell);
      if (this.occupancy.get(key) === id) this.occupancy.delete(key);
    }
  }

  private replaceEntityPlacement(entity: EntityState, next: EntityState): void {
    this.releaseFootprint(entity.id, entity.footprint);
    this.claimFootprint(next.id, next.footprint);
    this.entities.set(entity.id, next);
    if (entity.kind === "player") this.currentPlayerCell = cloneCell(next.cell);
  }
}
