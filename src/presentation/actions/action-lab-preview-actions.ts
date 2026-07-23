import bombBaseSheetUrl from "@content/enemies/assets/lantern-red-sprite-sheet.png";
import bombPrepareSheetUrl from "@content/enemies/assets/bomb_enemy-self_destruct_prepare-4dir-x8.png";
import bombPrepareMetadata from "@content/enemies/assets/bomb_enemy-self_destruct_prepare-4dir-x8.animation.json";
import bombExecuteSheetUrl from "@content/enemies/assets/bomb_enemy-self_destruct_execute-4dir-x8.png";
import bombExecuteMetadata from "@content/enemies/assets/bomb_enemy-self_destruct_execute-4dir-x8.animation.json";
import chargeBaseSheetUrl from "@content/enemies/assets/skull-sprite-sheet.png";
import chargePrepareSheetUrl from "@content/enemies/assets/charge_enemy-charge_prepare-4dir-x8.png";
import chargePrepareMetadata from "@content/enemies/assets/charge_enemy-charge_prepare-4dir-x8.animation.json";
import chargeExecuteSheetUrl from "@content/enemies/assets/charge_enemy-charge_execute-4dir-x8.png";
import chargeExecuteMetadata from "@content/enemies/assets/charge_enemy-charge_execute-4dir-x8.animation.json";
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

function createPreviewAction(
  id: string,
  label: string,
  profileId: string,
  bodySheet: string,
  baseSheetUrl: string,
  animationSheetUrl: string,
  frameDurationsMs: readonly number[],
  loop: boolean,
): ActionLabPreviewAction {
  return {
    id,
    baseSheetUrl,
    animationSheetUrl,
    loop,
    action: {
      label,
      profileId,
      attack: {
        bodySheet,
        bodyRow: 0,
        bodyOffset: ZERO_OFFSET,
        bodyFrames: frameDurationsMs.map((duration, row) => ({ row, holdSec: duration / 1000 })),
      },
    },
  };
}

const previews = [
  createPreviewAction(
    "enemy.bomb.self_destruct_prepare",
    "Bomb Self-Destruct Prepare",
    "enemy.bomb",
    "bombSelfDestructPrepare",
    bombBaseSheetUrl,
    bombPrepareSheetUrl,
    bombPrepareMetadata.timing.frame_durations_ms,
    bombPrepareMetadata.timing.loop,
  ),
  createPreviewAction(
    "enemy.bomb.self_destruct_execute",
    "Bomb Self-Destruct Execute",
    "enemy.bomb",
    "bombSelfDestructExecute",
    bombBaseSheetUrl,
    bombExecuteSheetUrl,
    bombExecuteMetadata.timing.frame_durations_ms,
    bombExecuteMetadata.timing.loop,
  ),
  createPreviewAction(
    "enemy.charge.prepare",
    "Charge Prepare",
    "enemy.charge",
    "chargePrepare",
    chargeBaseSheetUrl,
    chargePrepareSheetUrl,
    chargePrepareMetadata.timing.frame_durations_ms,
    chargePrepareMetadata.timing.loop,
  ),
  createPreviewAction(
    "enemy.charge.execute",
    "Charge Execute",
    "enemy.charge",
    "chargeExecute",
    chargeBaseSheetUrl,
    chargeExecuteSheetUrl,
    chargeExecuteMetadata.timing.frame_durations_ms,
    chargeExecuteMetadata.timing.loop,
  ),
] as const;

export const ACTION_LAB_PREVIEW_ACTIONS: Readonly<Record<string, ActionLabPreviewAction>> = Object.fromEntries(
  previews.map((preview) => [preview.id, preview]),
);
