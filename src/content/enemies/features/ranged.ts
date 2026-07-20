import sheetUrl from "../assets/eye-sprite-sheet.png";
import waterSheetUrl from "../assets/ranged_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/ranged_enemy-entered_water-4dir-x8.animation.json";
import { defineEnemyFeature } from "./enemy-feature";

export const rangedEnemyFeature = defineEnemyFeature({
  enemy: {
    id: "ranged_enemy",
    name: "Ranged Enemy",
    role: "ranged",
    speed: 75,
    hp: 100,
    defense: 0,
    guardId: "small",
    roleTuning: {
      type: "ranged",
      minDistance: 3,
      maxDistance: 5,
    },
    audio: { id: "enemy.guarded" },
  },
  attacks: [
    {
      id: "ranged_cross",
      name: "Ranged Cross",
      kind: "tile",
      damage: 10,
      warningTicks: 2,
      recoveryTicks: 1,
      shape: {
        shape: "custom-offsets",
        offsets: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ],
      },
    },
  ],
  presentation: {
    id: "enemy.ranged",
    sheet: { key: "eye", url: sheetUrl },
    palette: "eye",
    scale: 5,
  },
  waterAnimation: {
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
  },
});
