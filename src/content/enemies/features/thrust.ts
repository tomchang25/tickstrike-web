import sheetUrl from "../assets/kappa-green-sprite-sheet.png";
import waterSheetUrl from "../assets/thrust_enemy-entered_water-4dir-x8.png";
import waterMetadata from "../assets/thrust_enemy-entered_water-4dir-x8.animation.json";
import dashKilledSheetUrl from "../assets/thrust_enemy-dash_killed-4dir-x8.png";
import dashKilledMetadata from "../assets/thrust_enemy-dash_killed-4dir-x8.animation.json";
import { defineEnemyFeature } from "./enemy-feature";

export const thrustEnemyFeature = defineEnemyFeature({
  enemy: {
    id: "thrust_enemy",
    name: "Thrust Enemy",
    role: "thrust",
    speed: 75,
    hp: 100,
    defense: 0,
    guardId: "small",
    roleTuning: null,
    audio: { id: "enemy.guarded" },
  },
  attacks: [
    {
      id: "thrust",
      name: "Thrust",
      kind: "tile",
      damage: 10,
      warningTicks: 2,
      recoveryTicks: 2,
      shape: {
        shape: "custom-offsets",
        offsets: [
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
      },
    },
  ],
  presentation: {
    id: "enemy.thrust",
    sheet: { key: "green", url: sheetUrl },
    palette: "green",
  },
  waterAnimation: {
    id: "enemy.thrust.drowning",
    label: "Thrust Drowning",
    sheetUrl: waterSheetUrl,
    frameDurationsMs: waterMetadata.timing.frame_durations_ms,
    loop: waterMetadata.timing.loop,
  },
  dashKilledAnimation: {
    id: "enemy.thrust.dash_killed",
    label: "Thrust Dash-Killed",
    sheetUrl: dashKilledSheetUrl,
    frameDurationsMs: dashKilledMetadata.timing.frame_durations_ms,
    loop: dashKilledMetadata.timing.loop,
  },
});
