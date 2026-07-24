import type { CombatEvent } from "../events/combat-events";
import {
  isTerminalPhase,
  sameCell,
  type BasicHitResult,
  type Cell,
  type CommittedAttack,
  type DamageResult,
  type DirectionalHitResult,
  type EnemyDecisionKind,
  type EntityId,
  type EntityState,
  type Telegraph,
} from "../model/types";
import type { GridBoard } from "./grid-board";

export interface EnemyAttackResolution {
  readonly attack: CommittedAttack;
  readonly target: Cell;
  readonly damage?: DamageResult;
}

export interface AttackRetargetResult {
  readonly changed: boolean;
  readonly telegraph?: Telegraph;
}

/**
 * `changed: false` means the entity was exempt (not an alive enemy, or staggered) and nothing
 * was touched; it carries no other fields. The `changed: true` arm always reports the recovery
 * duration applied, so callers that narrow on `changed` never need a fallback.
 */
export type DisplacementInterruptResult =
  | { readonly changed: false }
  | {
      readonly changed: true;
      readonly hadTelegraph: boolean;
      readonly hadCommittedAttack: boolean;
      readonly recoveryTicks: number;
    };

/**
 * The entity surface combat rules are allowed to touch. `setPhase` is the
 * world's own terminal transition, which cascades placement, reservation,
 * telegraph, and armed-smash cleanup; combat never performs that cleanup itself.
 */
export interface CombatWorldAccess {
  getEntity(id: EntityId): EntityState | undefined;
  setEntity(id: EntityId, entity: EntityState): void;
  allEntities(): Iterable<EntityState>;
  setPhase(id: EntityId, phase: EntityState["phase"]): void;
  playerCell(): Cell | undefined;
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function sameCells(a: readonly Cell[], b: readonly Cell[]): boolean {
  return a.length === b.length && a.every((cell, index) => sameCell(cell, b[index]!));
}

function cloneCommittedAttack(attack: CommittedAttack): CommittedAttack {
  return {
    ...attack,
    cells: attack.cells.map(cloneCell),
    ...(attack.metadata ? { metadata: structuredClone(attack.metadata) } : {}),
  };
}

/**
 * Owns the enemy combat lifecycle: damage and guard application, the activity
 * state machine (ready, telegraphing, recovering, resting, staggered), and the
 * committed-attack lifecycle from commit through warning to resolution.
 *
 * These interlock — a broken guard staggers, a resolution recovers, a countdown
 * returns to ready — so they live together rather than split across owners.
 * Multi-entity displacement stays with the world, which composes this module's
 * damage application with the board's staged placement.
 */
export class CombatOperations {
  constructor(
    private readonly world: CombatWorldAccess,
    private readonly board: GridBoard,
  ) {}

  applyDamage(targetId: EntityId, damage: number): DamageResult | undefined {
    if (!Number.isFinite(damage) || damage <= 0) {
      throw new Error("Damage must be a positive finite number.");
    }

    const entity = this.world.getEntity(targetId);
    if (!entity || isTerminalPhase(entity.phase)) {
      return undefined;
    }
    if (entity.kind === "player" && entity.mobility?.invulnerable) {
      return undefined;
    }
    if (entity.damageImmune) {
      return undefined;
    }

    const hpAfter = Math.max(0, entity.hp - damage);
    const killed = hpAfter === 0;
    if (killed) {
      this.world.setPhase(targetId, "dead");
    }

    this.world.setEntity(targetId, { ...this.world.getEntity(targetId)!, hp: hpAfter });
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
    if (!damage) {
      return undefined;
    }
    return { ...damage, attackerId: hit.attackerId };
  }

  applyDirectionalHit(hit: DirectionalHitResult): DirectionalHitResult | undefined {
    const entity = this.world.getEntity(hit.targetId);
    if (!entity || isTerminalPhase(entity.phase)) {
      return undefined;
    }

    this.world.setEntity(hit.targetId, {
      ...entity,
      hp: hit.hpAfter,
      ...(entity.guard ? { guard: { ...entity.guard, current: hit.guardAfter } } : {}),
    });

    if (hit.guardBroken && !hit.killed && entity.enemyAction && entity.activity !== "staggered") {
      this.board.releaseReservation(entity.id);
      this.board.clearTelegraph(entity.id);
      const current = this.world.getEntity(entity.id)!;
      const staggerTicks = current.guard?.staggerDuration ?? 0;
      this.world.setEntity(entity.id, {
        ...current,
        activity: "staggered",
        recoveryTicks: undefined,
        restTicks: undefined,
        committedAttack: undefined,
        staggerTicks,
        protectionTicks: undefined,
      });
    }

    if (hit.killed) {
      this.world.setPhase(hit.targetId, "dead");
    }
    return { ...hit };
  }

  setEnemyFacing(id: EntityId, facing: Cell): void {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction) {
      throw new Error(`Entity is not an enabled enemy: ${id}`);
    }
    if (entity.phase !== "alive") {
      throw new Error(`Cannot turn terminal entity: ${id}`);
    }
    if (!Number.isInteger(facing.x) || !Number.isInteger(facing.y) || Math.abs(facing.x) + Math.abs(facing.y) !== 1) {
      throw new Error("Enemy facing must be cardinal.");
    }
    this.world.setEntity(id, { ...entity, facing: cloneCell(facing) });
  }

  setEnemyDecision(id: EntityId, decision: EnemyDecisionKind): void {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction) {
      throw new Error(`Entity is not an enabled enemy: ${id}`);
    }
    this.world.setEntity(id, { ...entity, lastDecision: decision });
  }

  setEnemyActivity(id: EntityId, activity: EntityState["activity"], recoveryTicks?: number): void {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction) {
      throw new Error(`Entity is not an enabled enemy: ${id}`);
    }
    if (entity.phase !== "alive") {
      return;
    }
    this.world.setEntity(id, {
      ...entity,
      activity,
      recoveryTicks: recoveryTicks === undefined ? undefined : recoveryTicks,
      restTicks: undefined,
      ...(activity !== "staggered" ? { staggerTicks: undefined } : {}),
    });
  }

  setEnemyResting(id: EntityId, restTicks = 1): void {
    if (!Number.isInteger(restTicks) || restTicks <= 0) {
      throw new Error("Enemy rest must be a positive integer.");
    }
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction) {
      throw new Error(`Entity is not an enabled enemy: ${id}`);
    }
    if (entity.phase !== "alive") {
      return;
    }
    this.world.setEntity(id, {
      ...entity,
      activity: "resting",
      recoveryTicks: undefined,
      restTicks,
      committedAttack: undefined,
    });
  }

  resetEnemyCombatState(id: EntityId): void {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction || entity.phase !== "alive") {
      return;
    }
    this.board.releaseReservation(id);
    this.board.clearTelegraph(id);
    this.world.setEntity(id, {
      ...entity,
      activity: "ready",
      lastDecision: undefined,
      recoveryTicks: undefined,
      restTicks: undefined,
      committedAttack: undefined,
      staggerTicks: undefined,
      protectionTicks: undefined,
      ...(entity.guard ? { guard: { ...entity.guard, current: entity.guard.max } } : {}),
    });
  }

  advanceEnemyStatuses(): readonly CombatEvent[] {
    const events: CombatEvent[] = [];
    for (const entity of this.world.allEntities()) {
      if (entity.phase !== "alive" || !entity.enemyAction || !entity.guard) {
        continue;
      }
      if (entity.activity === "staggered") {
        const ticks = entity.staggerTicks ?? 0;
        if (ticks > 1) {
          this.world.setEntity(entity.id, { ...entity, staggerTicks: ticks - 1 });
          continue;
        }

        const guard = { ...entity.guard, current: entity.guard.max };
        this.world.setEntity(entity.id, {
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
      if (protectionTicks <= 0) {
        continue;
      }
      if (protectionTicks === 1) {
        this.world.setEntity(entity.id, { ...entity, protectionTicks: undefined });
        events.push({ type: "enemy_protection_ended", enemyId: entity.id });
      } else {
        this.world.setEntity(entity.id, { ...entity, protectionTicks: protectionTicks - 1 });
      }
    }
    return events;
  }

  commitEnemyAttack(id: EntityId, attack: CommittedAttack): CommittedAttack {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction || entity.phase !== "alive" || entity.activity !== "ready") {
      throw new Error(`Enemy cannot commit an attack: ${id}`);
    }
    const committed = cloneCommittedAttack({
      ...attack,
      ...(attack.role ? {} : { role: entity.enemyAction.role }),
      ...(attack.kind || !entity.enemyAction.kind ? {} : { kind: entity.enemyAction.kind }),
      ...(attack.metadata || !entity.enemyAction.metadata ? {} : { metadata: entity.enemyAction.metadata }),
    });
    this.board.setTelegraph({ sourceId: id, phase: "warning", cells: committed.cells });
    this.world.setEntity(id, {
      ...entity,
      activity: "telegraphing",
      recoveryTicks: undefined,
      restTicks: undefined,
      committedAttack: committed,
    });
    return cloneCommittedAttack(committed);
  }

  decrementEnemyAttackWarning(id: EntityId): CommittedAttack | undefined {
    const entity = this.world.getEntity(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") {
      return undefined;
    }
    const next = { ...attack, warningTicks: Math.max(0, attack.warningTicks - 1) };
    this.world.setEntity(id, { ...entity, committedAttack: next });
    return cloneCommittedAttack(next);
  }

  resolveCommittedEnemyAttack(id: EntityId): EnemyAttackResolution | undefined {
    const entity = this.world.getEntity(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") {
      return undefined;
    }
    const playerCell = this.world.playerCell();
    const target = playerCell ?? attack.cells[0] ?? { x: 0, y: 0 };
    this.board.clearTelegraph(id);
    if (attack.metadata?.selfDestruct) {
      this.world.setEntity(id, { ...entity, hp: 0 });
      this.world.setPhase(id, "dead");
    } else {
      this.world.setEntity(id, {
        ...entity,
        activity: "recovering",
        recoveryTicks: attack.recoveryTicks,
        restTicks: undefined,
        committedAttack: undefined,
      });
    }
    const damage =
      playerCell && attack.cells.some((cell) => sameCell(cell, playerCell))
        ? this.applyDamage("player", attack.damage)
        : undefined;
    return { attack: cloneCommittedAttack(attack), target: cloneCell(target), damage };
  }

  /**
   * Refreshes a telegraphing enemy's locked commitment to a newly supplied live path/facing.
   * The calling behavior decides whether the live Player still satisfies its targeting rule;
   * this only applies the refreshed cells atomically and reports whether anything changed.
   */
  retargetCommittedAttack(id: EntityId, path: readonly Cell[], facing: Cell): AttackRetargetResult {
    const entity = this.world.getEntity(id);
    const attack = entity?.committedAttack;
    if (!entity || !attack || entity.activity !== "telegraphing") {
      return { changed: false };
    }
    if (sameCells(attack.cells, path)) {
      return { changed: false };
    }

    const next: CommittedAttack = { ...attack, cells: path.map(cloneCell) };
    this.world.setEntity(id, { ...entity, committedAttack: next, facing: cloneCell(facing) });
    const telegraph = this.board.setTelegraph({ sourceId: id, phase: "warning", cells: path });
    return { changed: true, telegraph };
  }

  /**
   * Cancels an alive, non-staggered enemy's windup because it was just forcibly displaced
   * (a charge push today): releases its reservation, clears its telegraph, drops its
   * committed attack, and enters `recovering` at its full authored duration — refreshing
   * the timer even if it was already recovering. Staggered enemies, the player, and dead
   * entities are exempt and left untouched. Mirrors `applyDirectionalHit`'s stagger
   * transition; emits nothing itself, matching this subsystem's existing style.
   */
  interruptDisplacedEnemy(id: EntityId): DisplacementInterruptResult {
    const entity = this.world.getEntity(id);
    if (!entity?.enemyAction || entity.phase !== "alive" || entity.activity === "staggered") {
      return { changed: false };
    }

    const hadCommittedAttack = entity.committedAttack !== undefined;
    const hadTelegraph = this.board.clearTelegraph(id);
    this.board.releaseReservation(id);
    const recoveryTicks = entity.enemyAction.recoveryTicks;
    this.world.setEntity(id, {
      ...entity,
      activity: "recovering",
      recoveryTicks,
      restTicks: undefined,
      committedAttack: undefined,
      // Cleared for the same reason `setEnemyActivity` clears it on any non-staggered
      // transition; unreachable today because the staggered guard above returns early.
      staggerTicks: undefined,
    });
    return { changed: true, hadTelegraph, hadCommittedAttack, recoveryTicks };
  }

  advanceEnemyRecovery(id: EntityId): boolean {
    const entity = this.world.getEntity(id);
    if (!entity || entity.activity !== "recovering") {
      return false;
    }
    const ticks = entity.recoveryTicks ?? 0;
    if (ticks > 1) {
      this.world.setEntity(id, { ...entity, recoveryTicks: ticks - 1 });
      return false;
    }
    this.world.setEntity(id, { ...entity, activity: "ready", recoveryTicks: undefined });
    return true;
  }

  advanceEnemyRest(id: EntityId): boolean {
    const entity = this.world.getEntity(id);
    if (!entity || entity.activity !== "resting") {
      return false;
    }
    const ticks = entity.restTicks ?? 0;
    if (ticks > 1) {
      this.world.setEntity(id, { ...entity, restTicks: ticks - 1 });
      return false;
    }
    this.world.setEntity(id, { ...entity, activity: "ready", restTicks: undefined });
    return true;
  }
}
