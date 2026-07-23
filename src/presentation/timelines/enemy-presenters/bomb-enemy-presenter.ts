import { GenericEnemyPresenter } from "./generic-enemy-presenter";
import type { CombatEvent } from "@core/events/combat-events";
import type { EnemyPresenterContext } from "./enemy-presenter";

type EnemyDiedEvent = Extract<CombatEvent, { type: "enemy_died" }>;

/** Keeps ordinary Bomb deaths generic while letting self-destruction finish its authored body animation. */
export class BombEnemyPresenter extends GenericEnemyPresenter {
  protected override died(context: EnemyPresenterContext, event: EnemyDiedEvent): void {
    if (event.attackerId === event.enemyId) {
      context.getPresentation()?.stopBlink();
      return;
    }
    super.died(context, event);
  }
}

export const bombEnemyPresenter = new BombEnemyPresenter();
