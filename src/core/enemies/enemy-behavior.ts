import type {
  Cell,
  EnemyActionDefinition,
  EnemyMovementCandidate,
  EntityId,
  EntityState,
  Telegraph,
} from "../model/types";
import type { CombatEvent } from "../events/combat-events";
import type { AttackResolutionTransaction, CombatOperations, GridBoard, WorldView } from "../world/world";

/**
 * The capability handle the enemy phase and its behavior hooks receive instead
 * of the whole `World` (hardening spec d): the read-only {@link WorldView} plus
 * the `board` and `combat` subsystems the combat cluster mutates, the
 * `moveEntity` orchestration, and the world-owned attack-resolution transaction
 * composer. A phase given this cannot reach waves, run, spawn, or armed-smash
 * state. `World` satisfies it structurally, so `action-resolver` passes a
 * `World` directly. Lives here, not in `actions/`, so the behavior hooks can
 * name it without an actions -> enemies -> actions import cycle.
 */
export interface EnemyPhaseContext extends WorldView {
  readonly board: GridBoard;
  readonly combat: CombatOperations;
  moveEntity(id: EntityId, to: Cell): void;
  resolveCommittedAttackTransaction<T>(
    id: EntityId,
    policy: (transaction: AttackResolutionTransaction) => T | undefined,
  ): T | undefined;
}

export type EnemyActionDecision =
  | { readonly type: "move"; readonly candidates: readonly EnemyMovementCandidate[] }
  | {
      readonly type: "attack";
      readonly attack: EnemyActionDefinition;
      readonly cells: readonly Cell[];
      readonly facing: Cell;
      readonly metadata?: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "wait" };

export interface EnemyDecisionContext {
  readonly enemy: EntityState;
  readonly playerCell?: Cell;
  isInside(cell: Cell): boolean;
  canMove(destination: Cell): boolean;
  canPathThrough(cell: Cell): boolean;
  canEndAt(cell: Cell): boolean;
  /** Terrain-only legality, ignoring occupancy and the live Player position. Used by Charge range/path checks. */
  isLegalTerrain(cell: Cell): boolean;
}

/**
 * Role-specific enemy logic. One implementation per behavior id; the registry in
 * `behaviors/index.ts` is the only place a role string maps to an implementation,
 * so adding an enemy behavior never edits the shared decision or phase code.
 */
export interface EnemyBehavior {
  /**
   * Chooses the enemy's action for this turn. Only called for an alive, ready
   * enemy with an action definition while the Player is on the board.
   */
  decide(context: EnemyDecisionContext, action: EnemyActionDefinition, playerCell: Cell): EnemyActionDecision;
  /** When true, the enemy enters its authored rest after completing a move. */
  readonly restsAfterMove?: boolean;
  /**
   * Optional warning-time retarget for a telegraphing enemy. Runs every enemy
   * phase before the warning counter decrements; returns the emitted events.
   */
  retarget?(context: EnemyPhaseContext, enemy: EntityState): CombatEvent[];
  /**
   * Optional role-specific detonation replacing the shared resolution. Returns
   * the emitted events, or undefined when nothing resolved. Implementations
   * mutate the world only through `context.resolveCommittedAttackTransaction`
   * or the shared committed-attack resolution.
   */
  resolveAttack?(
    context: EnemyPhaseContext,
    enemyId: EntityId,
    telegraph: Telegraph | undefined,
  ): CombatEvent[] | undefined;
}
