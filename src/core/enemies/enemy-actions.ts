import { directionBetween, type Cell, type EntityState } from "../model/types";
import type { EnemyActionDecision, EnemyDecisionContext } from "./enemy-behavior";
import { getEnemyBehavior } from "./behaviors";

export type { EnemyActionDecision, EnemyDecisionContext } from "./enemy-behavior";
export type { EnemyBehavior } from "./enemy-behavior";
export {
  attackOriginCellsFromShape,
  rotatedAttackCells,
  rotateLocalOffset,
} from "./attack-geometry";
export { rangedAttackCells } from "./behaviors/ranged-enemy";
export { bombAreaCells } from "./behaviors/bomb-enemy";
export {
  chargeLiveRetarget,
  chargeRangePath,
  type ChargeRangePath,
} from "./behaviors/charge-enemy";

/** Shared guard for every role, then a pure registry dispatch — no role branching here. */
export function decideEnemyAction(context: EnemyDecisionContext): EnemyActionDecision {
  const { enemy, playerCell } = context;
  const action = enemy.enemyAction;
  if (!action || enemy.phase !== "alive" || enemy.activity !== "ready" || !playerCell) {
    return { type: "wait" };
  }
  return getEnemyBehavior(action.role).decide(context, action, playerCell);
}

export function committedAttackFromDecision(
  decision: Extract<EnemyActionDecision, { type: "attack" }>,
): {
  readonly attackId: string;
  readonly role: string;
  readonly kind?: string;
  readonly cells: readonly Cell[];
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  return {
    attackId: decision.attack.attackId,
    role: decision.attack.role,
    ...(decision.attack.kind ? { kind: decision.attack.kind } : {}),
    cells: decision.cells,
    damage: decision.attack.damage,
    warningTicks: decision.attack.warningTicks,
    recoveryTicks: decision.attack.recoveryTicks,
    ...(decision.metadata || decision.attack.metadata
      ? { metadata: decision.metadata ?? decision.attack.metadata }
      : {}),
  };
}

export function directionToPlayer(enemy: EntityState, playerCell?: Cell): Cell | undefined {
  return playerCell ? directionBetween(enemy.cell, playerCell) : undefined;
}
