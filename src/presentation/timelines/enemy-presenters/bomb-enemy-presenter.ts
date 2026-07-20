import { GenericEnemyPresenter } from "./generic-enemy-presenter";

/**
 * Bomb's presenter seam. Fuse blink and the self-destruct explosion currently
 * stay metadata/event-driven in `GenericEnemyPresenter` so profiles without a
 * dedicated presenter present identically; override the named methods here when
 * Bomb earns bespoke animation without touching the coordinator.
 */
export class BombEnemyPresenter extends GenericEnemyPresenter {}

export const bombEnemyPresenter = new BombEnemyPresenter();
