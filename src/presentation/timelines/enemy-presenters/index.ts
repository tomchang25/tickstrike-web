import type { EnemyPresenter } from "./enemy-presenter";
import { genericEnemyPresenter } from "./generic-enemy-presenter";
import { chargeEnemyPresenter } from "./charge-enemy-presenter";
import { bombEnemyPresenter } from "./bomb-enemy-presenter";

export type { EnemyPresenter, EnemyPresenterContext } from "./enemy-presenter";
export { GenericEnemyPresenter } from "./generic-enemy-presenter";

/**
 * The single mapping from a presentation profile to its presenter. Adding a
 * bespoke enemy presentation is one module in this directory plus one entry
 * here — the coordinator never learns about it.
 */
const enemyPresenterRegistry: ReadonlyMap<string, EnemyPresenter> = new Map([
  ["enemy.charge", chargeEnemyPresenter],
  ["enemy.bomb", bombEnemyPresenter],
]);

/** Profiles without a bespoke presenter (or with no profile at all) present generically. */
export function getEnemyPresenter(profileId: string | undefined): EnemyPresenter {
  return (profileId && enemyPresenterRegistry.get(profileId)) || genericEnemyPresenter;
}
