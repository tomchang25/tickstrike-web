import type { EnemyActionRole } from "../../model/types";
import type { EnemyBehavior } from "../enemy-behavior";
import { meleeEnemyBehavior } from "./melee-enemy";
import { rangedEnemyBehavior } from "./ranged-enemy";
import { chargeEnemyBehavior } from "./charge-enemy";
import { bombEnemyBehavior } from "./bomb-enemy";

/**
 * The single mapping from a role id to its behavior. Adding an enemy behavior is
 * one module in this directory plus one entry here — no shared decision, phase,
 * or world code changes.
 */
const enemyBehaviorRegistry: ReadonlyMap<EnemyActionRole, EnemyBehavior> = new Map([
  ["thrust", meleeEnemyBehavior],
  ["slash", meleeEnemyBehavior],
  ["ranged", rangedEnemyBehavior],
  ["charge", chargeEnemyBehavior],
  ["bomb", bombEnemyBehavior],
]);

/** Unregistered roles keep the historical adjacent-melee fallback. */
export function getEnemyBehavior(role: EnemyActionRole): EnemyBehavior {
  return enemyBehaviorRegistry.get(role) ?? meleeEnemyBehavior;
}
