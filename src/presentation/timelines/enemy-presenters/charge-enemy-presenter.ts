import { GenericEnemyPresenter } from "./generic-enemy-presenter";

/**
 * Charge's presenter seam. Charge impact and landing currently share the generic
 * event-driven visuals; override the named `GenericEnemyPresenter` methods here
 * when Charge earns bespoke animation without touching the coordinator.
 */
export class ChargeEnemyPresenter extends GenericEnemyPresenter {}

export const chargeEnemyPresenter = new ChargeEnemyPresenter();
