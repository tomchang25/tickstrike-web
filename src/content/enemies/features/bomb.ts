import sheetUrl from "../assets/lantern-red-sprite-sheet.png";
import waterSheetUrl from "../assets/bomb_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/bomb_enemy-entered_water-4dir-x8.animation.json";
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
      warningTicks: 3,
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
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
  },
});
