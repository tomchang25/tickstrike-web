import type { AttackDefinition, EnemyDefinition } from "@core/content/actor-schema";

/** Base sprite sheet for an enemy: a registry key plus the bundled asset URL. */
export interface EnemySpriteSheetAsset {
  readonly key: string;
  readonly url: string;
}

export interface EnemyPresentationProfile {
  readonly id: string;
  /** Key into the sheet registry derived from all features. */
  readonly sheet: string;
  readonly palette: string;
}

export interface EnemyWaterAnimationAsset {
  readonly sheetUrl: string;
  readonly frameDurationsMs: readonly number[];
}

/**
 * One enemy, fully described in one place: authored definition, its attacks,
 * its presentation profile and sprite assets. Every derived registry (actor
 * catalog, presentation profiles, sheet URLs, water animations) is built from
 * the feature list, so an id or asset can never drift between layers.
 */
export interface EnemyFeature {
  readonly enemy: EnemyDefinition;
  readonly attacks: readonly AttackDefinition[];
  readonly presentation: EnemyPresentationProfile;
  readonly spriteSheet: EnemySpriteSheetAsset;
  readonly waterAnimation?: EnemyWaterAnimationAsset;
}

export interface EnemyFeatureInput {
  /** Authored stats; `attackIds` and `presentation` are derived, not repeated. */
  readonly enemy: Omit<EnemyDefinition, "attackIds" | "presentation">;
  readonly attacks: readonly AttackDefinition[];
  readonly presentation: {
    readonly id: string;
    readonly sheet: EnemySpriteSheetAsset;
    readonly palette: string;
  };
  readonly waterAnimation?: EnemyWaterAnimationAsset;
}

/** Writes each shared identifier exactly once and derives every cross-reference. */
export function defineEnemyFeature(input: EnemyFeatureInput): EnemyFeature {
  return {
    enemy: {
      ...input.enemy,
      attackIds: input.attacks.map((attack) => attack.id),
      presentation: { id: input.presentation.id },
    },
    attacks: input.attacks,
    presentation: {
      id: input.presentation.id,
      sheet: input.presentation.sheet.key,
      palette: input.presentation.palette,
    },
    spriteSheet: input.presentation.sheet,
    ...(input.waterAnimation ? { waterAnimation: input.waterAnimation } : {}),
  };
}
