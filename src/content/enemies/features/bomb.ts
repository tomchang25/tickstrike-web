import sheetUrl from "../assets/lantern-red-sprite-sheet.png";
import waterSheetUrl from "../assets/bomb_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/bomb_enemy-entered_water-4dir-x8.animation.json";
import prepareSheetUrl from "../assets/bomb_enemy-self_destruct_prepare-4dir-x8.png";
import prepareMetadata from "../assets/bomb_enemy-self_destruct_prepare-4dir-x8.animation.json";
import executeSheetUrl from "../assets/bomb_enemy-self_destruct_execute-4dir-x8.png";
import executeMetadata from "../assets/bomb_enemy-self_destruct_execute-4dir-x8.animation.json";
import dashKilledSheetUrl from "../assets/bomb_enemy-dash_killed-4dir-x8.png";
import dashKilledMetadata from "../assets/bomb_enemy-dash_killed-4dir-x8.animation.json";
import { defineEnemyFeature } from "./enemy-feature";

export const bombEnemyFeature = defineEnemyFeature({
  enemy: {
    id: "bomb_enemy",
    name: "Bomb Enemy",
    role: "bomb",
    speed: 75,
    hp: 50,
    defense: 0,
    guardId: null,
    roleTuning: { type: "bomb", commitment: "adjacent" },
    audio: { id: "enemy.guardless" },
  },
  attacks: [
    {
      id: "bomb_area",
      name: "Bomb Area",
      kind: "area",
      damage: 50,
      warningTicks: 5,
      recoveryTicks: 1,
      shape: { shape: "manhattan", radius: 3 },
    },
  ],
  presentation: {
    id: "enemy.bomb",
    sheet: { key: "lantern", url: sheetUrl },
    palette: "lantern",
  },
  waterAnimation: {
    id: "enemy.bomb.drowning",
    label: "Bomb Drowning",
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
    loop: waterMetadata.timing.loop,
  },
  actionAnimations: {
    prepare: {
      id: "enemy.bomb.self_destruct_prepare",
      label: "Bomb Self-Destruct Prepare",
      sheetUrl: prepareSheetUrl,
      frameDurationsMs: prepareMetadata.timing.frame_durations_ms,
      loop: prepareMetadata.timing.loop,
    },
    execute: {
      id: "enemy.bomb.self_destruct_execute",
      label: "Bomb Self-Destruct Execute",
      sheetUrl: executeSheetUrl,
      frameDurationsMs: executeMetadata.timing.frame_durations_ms,
      loop: executeMetadata.timing.loop,
    },
  },
  dashKilledAnimation: {
    id: "enemy.bomb.dash_killed",
    label: "Bomb Dash-Killed",
    sheetUrl: dashKilledSheetUrl,
    frameDurationsMs: dashKilledMetadata.timing.frame_durations_ms,
    loop: dashKilledMetadata.timing.loop,
  },
});
