import type { AttackDefinition, EnemyDefinition } from "@core/content/actor-schema";
import type { EnemyFeature, EnemyPresentationProfile, EnemyWaterAnimationAsset } from "./enemy-feature";
import { thrustEnemyFeature } from "./thrust";
import { slashEnemyFeature } from "./slash";
import { rangedEnemyFeature } from "./ranged";
import { chargeEnemyFeature } from "./charge";
import { bombEnemyFeature } from "./bomb";

export type { EnemyFeature, EnemyPresentationProfile, EnemyWaterAnimationAsset } from "./enemy-feature";
export { defineEnemyFeature } from "./enemy-feature";

/**
 * The single enemy roster. Adding an enemy is one feature module plus one entry
 * here; every list and registry below derives from it.
 */
export const enemyFeatures: readonly EnemyFeature[] = [
  thrustEnemyFeature,
  slashEnemyFeature,
  rangedEnemyFeature,
  chargeEnemyFeature,
  bombEnemyFeature,
];

export const enemyDefinitions: readonly EnemyDefinition[] = enemyFeatures.map((feature) => feature.enemy);

export const attackDefinitions: readonly AttackDefinition[] = enemyFeatures.flatMap((feature) => feature.attacks);

export const enemyPresentationProfiles: ReadonlyMap<string, EnemyPresentationProfile> = new Map(
  enemyFeatures.map((feature) => [feature.presentation.id, feature.presentation]),
);

/** Unique base sprite sheets across all features, keyed by sheet key. */
export const enemySpriteSheetUrls: Readonly<Record<string, string>> = Object.fromEntries(
  enemyFeatures.map((feature) => [feature.spriteSheet.key, feature.spriteSheet.url]),
);

export const enemyWaterAnimationAssets: Readonly<Record<string, EnemyWaterAnimationAsset>> = Object.fromEntries(
  enemyFeatures.flatMap((feature) =>
    feature.waterAnimation ? [[feature.presentation.id, feature.waterAnimation]] : [],
  ),
);
