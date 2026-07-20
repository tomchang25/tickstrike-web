import sheetUrl from "../assets/kappa-purple-sprite-sheet.png";
import waterSheetUrl from "../assets/slash_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/slash_enemy-entered_water-4dir-x8.animation.json";
import { defineEnemyFeature } from "./enemy-feature";

export const slashEnemyFeature = defineEnemyFeature({
  enemy: {
    id: "slash_enemy",
    name: "Slash Enemy",
    role: "slash",
    speed: 75,
    hp: 100,
    defense: 0,
    guardId: "small",
    roleTuning: null,
    audio: { id: "enemy.guarded" },
  },
  attacks: [
    {
      id: "slash",
      name: "Slash",
      kind: "tile",
      damage: 10,
      warningTicks: 2,
      recoveryTicks: 2,
      shape: {
        shape: "custom-offsets",
        offsets: [
          { x: 1, y: -1 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    },
  ],
  presentation: {
    id: "enemy.slash",
    sheet: { key: "purple", url: sheetUrl },
    palette: "purple",
  },
  waterAnimation: {
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
  },
});
