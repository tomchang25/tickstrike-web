import {
  enemyActionAnimationAssets,
  enemyDashKilledAnimationAssets,
  enemyPresentationProfiles,
  enemySpriteSheetUrls,
  enemyWaterAnimationAssets,
  type EnemyActionAnimationAsset,
  type EnemyTerminalAnimationAsset,
  type EnemyWaterAnimationAsset,
} from "@content/enemies/features";
import type { ActionDirectionalOffset, ActionPresentation } from "./action-presentation-catalog";

export interface ActionLabPreviewAction {
  readonly id: string;
  readonly action: ActionPresentation;
  readonly baseSheetUrl: string;
  readonly animationSheetUrl: string;
  readonly loop: boolean;
}

const ZERO_OFFSET: ActionDirectionalOffset = {
  down: { x: 0, y: 0 },
  up: { x: 0, y: 0 },
  left: { x: 0, y: 0 },
  right: { x: 0, y: 0 },
};

type EnemyPreviewAnimationAsset = EnemyActionAnimationAsset | EnemyTerminalAnimationAsset | EnemyWaterAnimationAsset;

function createPreviewAction(
  profileId: string,
  baseSheetUrl: string,
  animation: EnemyPreviewAnimationAsset,
): ActionLabPreviewAction {
  return {
    id: animation.id,
    baseSheetUrl,
    animationSheetUrl: animation.sheetUrl,
    loop: animation.loop,
    action: {
      label: animation.label,
      profileId,
      attack: {
        bodySheet: animation.id,
        bodyRow: 0,
        bodyOffset: ZERO_OFFSET,
        bodyFrames: animation.frameDurationsMs.map((duration, row) => ({ row, holdSec: duration / 1000 })),
      },
    },
  };
}

function baseSheetUrlFor(profileId: string): string {
  const profile = enemyPresentationProfiles.get(profileId);
  const baseSheetUrl = profile ? enemySpriteSheetUrls[profile.sheet] : undefined;
  if (!baseSheetUrl) {
    throw new Error(`Action Lab preview is missing the base sheet for ${profileId}.`);
  }
  return baseSheetUrl;
}

const previews = [
  ...Object.entries(enemyActionAnimationAssets).flatMap(([profileId, animations]) => {
    const baseSheetUrl = baseSheetUrlFor(profileId);
    return [
      createPreviewAction(profileId, baseSheetUrl, animations.prepare),
      createPreviewAction(profileId, baseSheetUrl, animations.execute),
    ];
  }),
  ...Object.entries(enemyDashKilledAnimationAssets).map(([profileId, animation]) =>
    createPreviewAction(profileId, baseSheetUrlFor(profileId), animation),
  ),
  ...Object.entries(enemyWaterAnimationAssets).map(([profileId, animation]) =>
    createPreviewAction(profileId, baseSheetUrlFor(profileId), animation),
  ),
];

export const ACTION_LAB_PREVIEW_ACTIONS: Readonly<Record<string, ActionLabPreviewAction>> = Object.fromEntries(
  previews.map((preview) => [preview.id, preview]),
);
