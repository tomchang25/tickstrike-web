import type { GuardDefinition } from "../content/actor-schema";
import type { ArtifactTrigger } from "../content/artifact-schema";
import type { CombatEvent } from "../events/combat-events";
import { RandomStreams } from "../random/random-streams";
import {
  cellKey,
  sameCell,
  type ArenaState,
  type EnemyActionDefinition,
  type BasicHitResult,
  type Cell,
  type CommittedAttack,
  type DamageResult,
  type DirectionalHitResult,
  type EnemyDecisionKind,
  type EntityId,
  type EntitySpawnData,
  type EntityState,
  type EncounterOutcome,
  type GuardRuntime,
  isTerminalPhase,
  type PendingRewardOffer,
  type PendingSpawnBatch,
  type Reservation,
  type RunBuildState,
  type Seed,
  type Telegraph,
  type TileKind,
  type WaveRuntimeState,
  type WorldSnapshot,
} from "../model/types";
import type { AdmittedBatch, SlotState } from "../waves/wave-scheduler";
import { Arena } from "./arena";
import {
  GridBoard,
  type MovementReservationRequest,
  type ReservationDecision,
  type ReservationRequest,
} from "./grid-board";
import {
  CombatOperations,
  type AttackRetargetResult,
  type EnemyAttackResolution,
} from "./combat-operations";
import { RunBuild } from "./run-build";
import { WaveRuntime } from "./wave-runtime";

export interface SpawnEntityInput extends EntitySpawnData {
  readonly footprint?: readonly Cell[];
  readonly guardDefinition?: GuardDefinition;
}

export type {
  BoardEntityLocator,
  DisplacementTransaction,
  MovementReservationRequest,
  ReservationDecision,
  ReservationRequest,
  TelegraphInput,
} from "./grid-board";
export { GridBoard } from "./grid-board";
export type {
  AttackRetargetResult,
  CombatWorldAccess,
  EnemyAttackResolution,
} from "./combat-operations";
export { CombatOperations } from "./combat-operations";
export { RunBuild } from "./run-build";
export { WaveRuntime } from "./wave-runtime";

export interface StagedAttackResolutionCommit {
  readonly damageResults: ReadonlyMap<EntityId, DamageResult>;
}

/**
 * Constrained mutation surface handed to a behavior's detonation policy. All
 * placement questions consult a working occupancy view that reflects staged
 * moves, so a policy computes every displacement from one pre-detonation
 * snapshot; nothing mutates until `commit()`.
 */
export interface AttackResolutionTransaction {
  /** Pre-detonation snapshot of the resolving enemy. */
  readonly enemy: EntityState;
  readonly attack: CommittedAttack;
  /** Legal terrain, unclaimed in the working occupancy view, and unreserved. */
  isFree(cell: Cell): boolean;
  /** The live (non-terminal) occupant at a cell in the working occupancy view. */
  livingOccupantAt(cell: Cell): EntityState | undefined;
  /** Stages an entity displacement; applied atomically on commit. */
  stageMove(id: EntityId, to: Cell): void;
  stageDamage(id: EntityId, amount: number): void;
  /** Stages where the resolving enemy itself lands; omitted, it stays in place. */
  stageLanding(to: Cell): void;
  /**
   * Applies staged moves then staged damages, clears the telegraph, and moves
   * the enemy into recovery at its staged landing. Call exactly once, as the
   * policy's final step.
   */
  commit(): StagedAttackResolutionCommit;
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneEnemyAction(action: EnemyActionDefinition): EnemyActionDefinition {
  return {
    ...action,
    offsets: action.offsets.map(cloneCell),
    ...(action.rangedTuning ? { rangedTuning: { ...action.rangedTuning } } : {}),
    ...(action.chargeTuning ? { chargeTuning: { ...action.chargeTuning } } : {}),
    ...(action.metadata ? { metadata: structuredClone(action.metadata) } : {}),
  };
}

function cloneCommittedAttack(attack: CommittedAttack): CommittedAttack {
  return {
    ...attack,
    cells: attack.cells.map(cloneCell),
    ...(attack.metadata ? { metadata: structuredClone(attack.metadata) } : {}),
  };
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
    ...(entity.mobility ? { mobility: { ...entity.mobility } } : {}),
    ...(entity.facing ? { facing: cloneCell(entity.facing) } : {}),
    ...(entity.committedAttack
      ? { committedAttack: cloneCommittedAttack(entity.committedAttack) }
      : {}),
  };
}

function hasDuplicateCells(cells: readonly Cell[]): boolean {
  const keys = new Set(cells.map(cellKey));
  return keys.size !== cells.length;
}

export class World {
  readonly arena: ArenaState;
  readonly seed: number;
  readonly rootSeed: number;
  readonly random: RandomStreams;
  readonly streams: RandomStreams;

  private readonly geometry: Arena;
  private readonly board: GridBoard;
  private readonly combat: CombatOperations;
  private readonly waves = new WaveRuntime();
  private readonly run = new RunBuild();
  private readonly entities = new Map<EntityId, EntityState>();
  private currentPlayerCell: Cell | undefined;
  private currentArmedSmashTarget: Cell | undefined;
  private currentTick = 0;
  private currentOutcome: EncounterOutcome = "running";
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
      : Arena.fromTiles(
          arenaOrWidth,
          typeof heightOrSeed === "number" ? heightOrSeed : 0,
          tiles ?? [],
        );
    const rootSeed = isArena ? heightOrSeed : seed;
    this.seed = new RandomStreams(rootSeed ?? 0).rootSeed;
    this.rootSeed = this.seed;
    this.random = new RandomStreams(this.seed);
    this.streams = this.random;
    this.arena = this.geometry.toState();
    this.board = new GridBoard(this.geometry, {
      anchorCellOf: (id) => this.entities.get(id)?.cell,
      playerCell: () => this.currentPlayerCell,
    });
    this.combat = new CombatOperations(
      {
        getEntity: (id) => this.entities.get(id),
        setEntity: (id, entity) => {
          this.entities.set(id, entity);
        },
        allEntities: () => this.entities.values(),
        setPhase: (id, phase) => this.setPhase(id, phase),
        playerCell: () => this.playerCell,
      },
      this.board,
    );
  }

  spawn(input: SpawnEntityInput): EntityState {
    if (this.entities.has(input.id)) {
      throw new Error(`Entity already exists: ${input.id}`);
    }
    if (input.kind === "player" && this.currentPlayerCell) {
      throw new Error("Only one player can exist in the world.");
    }

    const footprint = input.footprint ? input.footprint.map(cloneCell) : [cloneCell(input.cell)];
    this.board.validateSpawnPlacement(input.id, input.cell, footprint);

    const entity: EntityState = {
      id: input.id,
      kind: input.kind,
      archetype: input.archetype,
      ...(input.presentationId ? { presentationId: input.presentationId } : {}),
      cell: cloneCell(input.cell),
      footprint,
      hp: input.hp,
      maxHp: input.hp,
      ...(input.damageImmune ? { damageImmune: true } : {}),
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
      ...(input.mobility
        ? {
            mobility: {
              ...input.mobility,
              remainingCooldown: 0,
              invulnerable: false,
            },
          }
        : {}),
      ...(input.enemyAction
        ? {
            enemyAction: cloneEnemyAction(input.enemyAction),
            activity: "ready" as const,
            facing: cloneCell(input.facing ?? { x: 1, y: 0 }),
          }
        : {}),
      ...(!input.enemyAction && input.facing ? { facing: cloneCell(input.facing) } : {}),
      phase: "alive",
    };
    this.entities.set(entity.id, entity);
    this.board.claimFootprint(entity.id, entity.footprint);
    if (entity.kind === "player") {
      this.currentPlayerCell = cloneCell(entity.cell);
    }
    return cloneEntity(entity);
  }

  getEntity(id: EntityId): EntityState | undefined {
    const entity = this.entities.get(id);
    return entity ? cloneEntity(entity) : undefined;
  }

  requireEntity(id: EntityId): EntityState {
    const entity = this.getEntity(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
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

  /**
   * `waveGate`, when supplied, replaces the terminal-enemy scan for victory rather than merely
   * suppressing it — it is the sole victory signal for a wave-driven world, so it still declares
   * victory once Child C1 removes terminal entities and the terminal scan would otherwise never
   * fire again.
   */
  updateEncounterOutcome(waveGate?: {
    readonly victoryReady: boolean;
  }): EncounterOutcome | undefined {
    if (this.currentOutcome !== "running") {
      return undefined;
    }

    const player = [...this.entities.values()].find((entity) => entity.kind === "player");
    if (player && player.phase !== "alive") {
      this.currentOutcome = "defeat";
      return this.currentOutcome;
    }

    if (waveGate) {
      if (waveGate.victoryReady) {
        this.currentOutcome = "victory";
        return this.currentOutcome;
      }
      return undefined;
    }

    const enabledEnemies = [...this.entities.values()].filter(
      (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
    );
    if (
      enabledEnemies.length > 0 &&
      enabledEnemies.every((enemy) => isTerminalPhase(enemy.phase))
    ) {
      this.currentOutcome = "victory";
      return this.currentOutcome;
    }

    return undefined;
  }

  get armedSmashTarget(): Cell | undefined {
    return this.currentArmedSmashTarget ? cloneCell(this.currentArmedSmashTarget) : undefined;
  }

  armSmash(target: Cell): void {
    if (this.currentArmedSmashTarget) {
      throw new Error("Smash is already armed.");
    }
    this.currentArmedSmashTarget = cloneCell(target);
  }

  clearArmedSmash(): void {
    this.currentArmedSmashTarget = undefined;
  }

  get waveRuntime(): WaveRuntimeState | undefined {
    return this.waves.state;
  }

  /** Sets the current wave number and its latched per-slot state, preserving any pending batch. */
  setWave(waveNumber: number, slots: readonly SlotState[]): void {
    this.waves.setWave(waveNumber, slots);
  }

  /** Installs an admitted batch's placed target cells with a fresh countdown from its warning ticks. */
  installPendingSpawnBatch(batch: AdmittedBatch, cells: readonly Cell[]): PendingSpawnBatch {
    return this.waves.installPendingSpawnBatch(batch, cells);
  }

  /** Decrements the pending batch's countdown by one, floored at zero. No-op if none is installed. */
  decrementPendingSpawnBatchWarning(): PendingSpawnBatch | undefined {
    return this.waves.decrementPendingSpawnBatchWarning();
  }

  /** Clears the pending batch once it has resolved (spawned or requeued). No-op if none is installed. */
  clearPendingSpawnBatch(): void {
    this.waves.clearPendingSpawnBatch();
  }

  get runBuild(): RunBuildState {
    return this.run.state;
  }

  get pendingRewardOffer(): PendingRewardOffer | undefined {
    return this.run.pendingRewardOffer;
  }

  /** Installs a reward offer, pausing command acceptance until it is selected. */
  installPendingRewardOffer(offer: PendingRewardOffer): PendingRewardOffer {
    return this.run.installPendingRewardOffer(offer);
  }

  clearPendingRewardOffer(): void {
    this.run.clearPendingRewardOffer();
  }

  /**
   * Records the selected artifact's resulting stack count in the run build and, for a Major
   * trigger artifact, adds its acquired trigger (deduplicated; enforced by the trigger's own
   * one-stack cap upstream, not re-validated here).
   */
  applyRewardSelection(
    artifactId: string,
    resultingStackCount: number,
    trigger?: ArtifactTrigger,
  ): RunBuildState {
    return this.run.applyRewardSelection(artifactId, resultingStackCount, trigger);
  }

  /** Updates the player entity's own normal-attack damage; the sole owner of that combat stat. */
  setNormalAttackDamage(id: EntityId, damage: number): void {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new Error("Normal attack damage must be a non-negative finite number.");
    }
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    this.entities.set(id, { ...entity, normalAttackDamage: damage });
  }

  /** Updates the player entity's configured Mobility attack damage; read by preview and resolution. */
  setMobilityDamage(id: EntityId, damage: number): void {
    if (!Number.isFinite(damage) || damage < 0) {
      throw new Error("Mobility damage must be a non-negative finite number.");
    }
    const entity = this.entities.get(id);
    if (!entity?.mobility) {
      throw new Error(`Entity has no Mobility to update: ${id}`);
    }
    this.entities.set(id, { ...entity, mobility: { ...entity.mobility, damage } });
  }

  /**
   * Updates the configured Mobility cooldown applied after release. Distinct from
   * `setMobilityCooldown`, which sets the counting-down remainder for the current cooldown.
   */
  setMobilityCooldownConfig(id: EntityId, cooldown: number): void {
    if (!Number.isInteger(cooldown) || cooldown < 0) {
      throw new Error("Mobility cooldown must be a non-negative integer.");
    }
    const entity = this.entities.get(id);
    if (!entity?.mobility) {
      throw new Error(`Entity has no Mobility to update: ${id}`);
    }
    this.entities.set(id, { ...entity, mobility: { ...entity.mobility, cooldown } });
  }

  /** Updates the player entity's configured Mobility range. */
  setMobilityRange(id: EntityId, range: number): void {
    if (!Number.isInteger(range) || range <= 0) {
      throw new Error("Mobility range must be a positive integer.");
    }
    const entity = this.entities.get(id);
    if (!entity?.mobility) {
      throw new Error(`Entity has no Mobility to update: ${id}`);
    }
    this.entities.set(id, { ...entity, mobility: { ...entity.mobility, range } });
  }

  /** Raises maximum HP by `amount` and current HP by the same amount, capped at the new maximum. */
  raiseMaxHealth(id: EntityId, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Max health gain must be a positive finite number.");
    }
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    const maxHp = entity.maxHp + amount;
    const hp = Math.min(maxHp, entity.hp + amount);
    this.entities.set(id, { ...entity, maxHp, hp });
  }

  getOccupantAt(cell: Cell): EntityState | undefined {
    const id = this.board.occupantIdAt(cell);
    return id ? this.getEntity(id) : undefined;
  }

  isOccupied(cell: Cell): boolean {
    return this.board.isOccupied(cell);
  }

  findAliveAt(cell: Cell, kind?: EntityState["kind"]): EntityState | undefined {
    const entity = this.getOccupantAt(cell);
    if (!entity || (kind && entity.kind !== kind)) {
      return undefined;
    }
    return sameCell(entity.cell, cell) ||
      entity.footprint.some((occupied) => sameCell(occupied, cell))
      ? entity
      : undefined;
  }

  listAliveEnemiesAround(center: Cell, radius: number): readonly EntityState[] {
    return [...this.entities.values()]
      .filter((entity) => {
        if (entity.kind !== "enemy" || entity.phase !== "alive") {
          return false;
        }
        const dx = Math.abs(entity.cell.x - center.x);
        const dy = Math.abs(entity.cell.y - center.y);
        return dx <= radius && dy <= radius;
      })
      .map(cloneEntity);
  }

  moveEntity(id: EntityId, to: Cell): void {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    if (isTerminalPhase(entity.phase)) {
      throw new Error(`Cannot move terminal entity: ${id}`);
    }

    const footprint = this.translateFootprint(entity, to);
    this.board.validateActiveFootprint(id, footprint);
    this.replaceEntityPlacement(entity, { ...entity, cell: cloneCell(to), footprint });
  }

  setPhase(id: EntityId, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    if (entity.phase === phase) {
      return;
    }

    if (isTerminalPhase(phase)) {
      this.board.releaseFootprint(entity.id, entity.footprint);
      this.releaseReservation(entity.id);
      this.clearTelegraph(entity.id);
      if (entity.kind === "player") {
        this.clearArmedSmash();
      }
      this.entities.set(id, {
        ...entity,
        phase,
        activity: undefined,
        recoveryTicks: undefined,
        restTicks: undefined,
        committedAttack: undefined,
        lastDecision: undefined,
        guard: entity.guard ? { ...entity.guard, current: 0 } : undefined,
        staggerTicks: undefined,
        protectionTicks: undefined,
        ...(entity.mobility
          ? { mobility: { ...entity.mobility, remainingCooldown: 0, invulnerable: false } }
          : {}),
      });
      return;
    }

    this.board.validateActiveFootprint(id, entity.footprint);
    this.board.claimFootprint(id, entity.footprint);
    this.entities.set(id, { ...entity, phase });
  }

  applyDamage(targetId: EntityId, damage: number): DamageResult | undefined {
    return this.combat.applyDamage(targetId, damage);
  }

  applyBasicHit(hit: BasicHitResult): BasicHitResult | undefined {
    return this.combat.applyBasicHit(hit);
  }

  applyDirectionalHit(hit: DirectionalHitResult): DirectionalHitResult | undefined {
    return this.combat.applyDirectionalHit(hit);
  }

  setEnemyFacing(id: EntityId, facing: Cell): void {
    this.combat.setEnemyFacing(id, facing);
  }

  setEnemyDecision(id: EntityId, decision: EnemyDecisionKind): void {
    this.combat.setEnemyDecision(id, decision);
  }

  setEnemyActivity(id: EntityId, activity: EntityState["activity"], recoveryTicks?: number): void {
    this.combat.setEnemyActivity(id, activity, recoveryTicks);
  }

  setEnemyResting(id: EntityId, restTicks = 1): void {
    this.combat.setEnemyResting(id, restTicks);
  }

  resetEnemyCombatState(id: EntityId): void {
    this.combat.resetEnemyCombatState(id);
  }

  advanceEnemyStatuses(): readonly CombatEvent[] {
    return this.combat.advanceEnemyStatuses();
  }

  commitEnemyAttack(id: EntityId, attack: CommittedAttack): CommittedAttack {
    return this.combat.commitEnemyAttack(id, attack);
  }

  decrementEnemyAttackWarning(id: EntityId): CommittedAttack | undefined {
    return this.combat.decrementEnemyAttackWarning(id);
  }

  resolveCommittedEnemyAttack(id: EntityId): EnemyAttackResolution | undefined {
    return this.combat.resolveCommittedEnemyAttack(id);
  }

  /**
   * Refreshes a telegraphing enemy's locked commitment to a newly supplied live path/facing.
   * The calling behavior decides whether the live Player still satisfies its targeting rule;
   * this only applies the refreshed cells atomically and reports whether anything changed.
   */
  retargetCommittedAttack(id: EntityId, path: readonly Cell[], facing: Cell): AttackRetargetResult {
    return this.combat.retargetCommittedAttack(id, path, facing);
  }

  /**
   * Runs a behavior-supplied detonation policy against one atomic transaction. The policy
   * stages displacements and damage from a single pre-detonation snapshot, then commits;
   * a policy that returns undefined without committing leaves the world untouched. Staged
   * placement and damage application are ordered by the transaction, so entity iteration
   * order cannot affect the outcome.
   */
  resolveCommittedAttackTransaction<T>(
    id: EntityId,
    policy: (transaction: AttackResolutionTransaction) => T | undefined,
  ): T | undefined {
    const entity = this.entities.get(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") {
      return undefined;
    }

    const origin = cloneCell(entity.cell);
    const displacement = this.board.beginDisplacementTransaction();
    const damages: { readonly targetId: EntityId; readonly amount: number }[] = [];
    let landing: Cell | undefined;

    const transaction: AttackResolutionTransaction = {
      enemy: entity,
      attack: cloneCommittedAttack(attack),
      isFree: (cell) => displacement.isFree(cell),
      livingOccupantAt: (cell) => {
        const occupantId = displacement.occupantIdAt(cell);
        const occupant = occupantId ? this.entities.get(occupantId) : undefined;
        return occupant && !isTerminalPhase(occupant.phase) ? occupant : undefined;
      },
      stageMove: (moverId, to) => {
        const mover = this.entities.get(moverId);
        if (!mover) {
          return;
        }
        displacement.stageMove(moverId, mover.cell, to);
      },
      stageDamage: (targetId, amount) => {
        damages.push({ targetId, amount });
      },
      stageLanding: (to) => {
        landing = cloneCell(to);
      },
      commit: () => {
        for (const move of displacement.moves) {
          this.board.releaseFootprint(move.id, this.entities.get(move.id)!.footprint);
        }
        for (const move of displacement.moves) {
          const mover = this.entities.get(move.id)!;
          const footprint = this.translateFootprint(mover, move.to);
          this.board.claimFootprint(move.id, footprint);
          this.entities.set(move.id, { ...mover, cell: cloneCell(move.to), footprint });
          if (mover.kind === "player") {
            this.currentPlayerCell = cloneCell(move.to);
          }
        }

        const damageResults = new Map<EntityId, DamageResult>();
        for (const damage of damages) {
          const result = this.combat.applyDamage(damage.targetId, damage.amount);
          if (result) {
            damageResults.set(damage.targetId, result);
          }
        }

        this.clearTelegraph(id);
        const current = this.entities.get(id)!;
        const recovering = {
          activity: "recovering" as const,
          recoveryTicks: attack.recoveryTicks,
          restTicks: undefined,
          committedAttack: undefined,
        };
        if (landing && !sameCell(origin, landing)) {
          this.board.releaseFootprint(id, current.footprint);
          const footprint = this.translateFootprint(current, landing);
          this.board.claimFootprint(id, footprint);
          this.entities.set(id, { ...current, cell: cloneCell(landing), footprint, ...recovering });
        } else {
          this.entities.set(id, { ...current, ...recovering });
        }
        return { damageResults };
      },
    };

    return policy(transaction);
  }

  advanceEnemyRecovery(id: EntityId): boolean {
    return this.combat.advanceEnemyRecovery(id);
  }

  advanceEnemyRest(id: EntityId): boolean {
    return this.combat.advanceEnemyRest(id);
  }

  moveEntityToPhase(id: EntityId, to: Cell, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    if (!isTerminalPhase(phase)) {
      this.moveEntity(id, to);
      this.setPhase(id, phase);
      return;
    }

    const footprint = this.translateFootprint(entity, to);
    this.board.validateTerminalFootprint(id, footprint);
    this.board.releaseFootprint(entity.id, entity.footprint);
    this.releaseReservation(entity.id);
    this.clearTelegraph(entity.id);
    this.entities.set(id, {
      ...entity,
      cell: cloneCell(to),
      footprint,
      phase,
      activity: undefined,
      recoveryTicks: undefined,
      restTicks: undefined,
      committedAttack: undefined,
      lastDecision: undefined,
      staggerTicks: undefined,
      protectionTicks: undefined,
      guard: entity.guard ? { ...entity.guard, current: 0 } : undefined,
      ...(entity.mobility
        ? { mobility: { ...entity.mobility, remainingCooldown: 0, invulnerable: false } }
        : {}),
    });
  }

  removeEntity(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) {
      return;
    }
    this.board.releaseFootprint(entity.id, entity.footprint);
    this.releaseReservation(id);
    this.clearTelegraph(id);
    this.entities.delete(id);
    if (entity.kind === "player") {
      this.currentPlayerCell = undefined;
      this.clearArmedSmash();
    }
  }

  tileAt(cell: Cell): TileKind {
    return this.board.tileAt(cell);
  }

  isInside(cell: Cell): boolean {
    return this.board.isInside(cell);
  }

  isLegalCell(cell: Cell): boolean {
    return this.board.isLegalCell(cell);
  }

  isWalkable(cell: Cell): boolean {
    return this.board.isWalkable(cell);
  }

  getRandomStream(domain: string) {
    return this.random.get(domain);
  }

  previewReservation(request: ReservationRequest): ReservationDecision {
    return this.board.previewReservation(request);
  }

  requestReservation(request: ReservationRequest): ReservationDecision {
    return this.board.requestReservation(request);
  }

  /**
   * Claims all one-cell movement intents as one arbitration step. The claims
   * remain installed until the enemy phase applies every granted movement.
   */
  requestMovementReservations(
    requests: readonly MovementReservationRequest[],
  ): readonly ReservationDecision[] {
    return this.board.requestMovementReservations(requests);
  }

  getReservation(ownerId: string): Reservation | undefined {
    return this.board.getReservation(ownerId);
  }

  listReservations(): readonly Reservation[] {
    return this.board.listReservations();
  }

  reservationAt(cell: Cell): Reservation | undefined {
    return this.board.reservationAt(cell);
  }

  isReserved(cell: Cell, excludingOwnerId?: string): boolean {
    return this.board.isReserved(cell, excludingOwnerId);
  }

  releaseReservation(ownerId: string): boolean {
    return this.board.releaseReservation(ownerId);
  }

  setTelegraph(input: TelegraphInput): Telegraph {
    return this.board.setTelegraph(input);
  }

  addTelegraph(input: TelegraphInput): Telegraph {
    return this.board.setTelegraph(input);
  }

  getTelegraph(sourceId: string): Telegraph | undefined {
    return this.board.getTelegraph(sourceId);
  }

  listTelegraphs(): readonly Telegraph[] {
    return this.board.listTelegraphs();
  }

  getTelegraphsAt(cell: Cell): readonly Telegraph[] {
    return this.board.getTelegraphsAt(cell);
  }

  clearTelegraph(sourceId: string): boolean {
    return this.board.clearTelegraph(sourceId);
  }

  clearTelegraphs(): void {
    this.board.clearTelegraphs();
  }

  advancePlayerAction(): CombatEvent {
    this.currentTick += 1;
    return {
      type: "world_advanced",
      tick: this.currentTick,
      phases: ["foundation", "enemy"],
    };
  }

  preparePlayerAction(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity || entity.phase !== "alive") {
      return;
    }
    if (!entity.mobility) {
      return;
    }
    this.entities.set(id, {
      ...entity,
      mobility: {
        ...entity.mobility,
        remainingCooldown: Math.max(0, entity.mobility.remainingCooldown - 1),
        invulnerable: false,
      },
    });
  }

  beginMobilityInvulnerability(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity?.mobility || entity.phase !== "alive") {
      return;
    }
    this.entities.set(id, {
      ...entity,
      mobility: { ...entity.mobility, invulnerable: true },
    });
  }

  clearMobilityInvulnerability(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity?.mobility || entity.phase !== "alive" || !entity.mobility.invulnerable) {
      return;
    }
    this.entities.set(id, {
      ...entity,
      mobility: { ...entity.mobility, invulnerable: false },
    });
  }

  setMobilityCooldown(id: EntityId, cooldown: number): void {
    if (!Number.isInteger(cooldown) || cooldown < 0) {
      throw new Error("Mobility cooldown must be a non-negative integer.");
    }
    const entity = this.entities.get(id);
    if (!entity?.mobility || entity.phase !== "alive") {
      return;
    }
    this.entities.set(id, {
      ...entity,
      mobility: { ...entity.mobility, remainingCooldown: cooldown },
    });
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
      waveRuntime: this.waveRuntime,
      runBuild: this.runBuild,
      pendingReward: this.pendingRewardOffer,
      seed: this.seed,
      lastEvents: this.lastEvents.map((event) => structuredClone(event)),
    };
  }

  private translateFootprint(entity: EntityState, to: Cell): readonly Cell[] {
    const dx = to.x - entity.cell.x;
    const dy = to.y - entity.cell.y;
    return entity.footprint.map((cell) => ({ x: cell.x + dx, y: cell.y + dy }));
  }

  private replaceEntityPlacement(entity: EntityState, next: EntityState): void {
    this.board.releaseFootprint(entity.id, entity.footprint);
    this.board.claimFootprint(next.id, next.footprint);
    this.entities.set(entity.id, next);
    if (entity.kind === "player") {
      this.currentPlayerCell = cloneCell(next.cell);
    }
  }
}
