import sheetUrl from "../assets/skull-sprite-sheet.png";
import waterSheetUrl from "../assets/charge_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/charge_enemy-entered_water-4dir-x8.animation.json";
import prepareSheetUrl from "../assets/charge_enemy-charge_prepare-4dir-x8.png";
import prepareMetadata from "../assets/charge_enemy-charge_prepare-4dir-x8.animation.json";
import executeSheetUrl from "../assets/charge_enemy-charge_execute-4dir-x8.png";
import executeMetadata from "../assets/charge_enemy-charge_execute-4dir-x8.animation.json";
import dashKilledSheetUrl from "../assets/charge_enemy-dash_killed-4dir-x8.png";
import dashKilledMetadata from "../assets/charge_enemy-dash_killed-4dir-x8.animation.json";
import { defineEnemyFeature } from "./enemy-feature";

export const chargeEnemyFeature = defineEnemyFeature({
  enemy: {
    id: "charge_enemy",
    name: "Charge Enemy",
    role: "charge",
    speed: 100,
    hp: 150,
    defense: 0,
    guardId: "heavy",
    roleTuning: null,
    audio: { id: "enemy.guarded" },
  },
  attacks: [
    {
      id: "charge",
      name: "Charge",
      kind: "charge",
      damage: 8,
      warningTicks: 2,
      recoveryTicks: 2,
      shape: { shape: "line", length: 5 },
    },
  ],
  presentation: {
    id: "enemy.charge",
    sheet: { key: "skull", url: sheetUrl },
    palette: "skull",
  },
  waterAnimation: {
    id: "enemy.charge.drowning",
    label: "Charge Drowning",
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
    loop: waterMetadata.timing.loop,
  },
  actionAnimations: {
    prepare: {
      id: "enemy.charge.prepare",
      label: "Charge Prepare",
      sheetUrl: prepareSheetUrl,
      frameDurationsMs: prepareMetadata.timing.frame_durations_ms,
      loop: prepareMetadata.timing.loop,
    },
    execute: {
      id: "enemy.charge.execute",
      label: "Charge Execute",
      sheetUrl: executeSheetUrl,
      frameDurationsMs: executeMetadata.timing.frame_durations_ms,
      loop: executeMetadata.timing.loop,
    },
  },
  dashKilledAnimation: {
    id: "enemy.charge.dash_killed",
    label: "Charge Dash-Killed",
    sheetUrl: dashKilledSheetUrl,
    frameDurationsMs: dashKilledMetadata.timing.frame_durations_ms,
    loop: dashKilledMetadata.timing.loop,
  },
});
