import bombSheetUrl from "./assets/bomb_enemy-entered_water-4dir-x8.png";
import bombMetadata from "./assets/bomb_enemy-entered_water-4dir-x8.animation.json";
import chargeSheetUrl from "./assets/charge_enemy-entered_water-4dir-x8.png";
import chargeMetadata from "./assets/charge_enemy-entered_water-4dir-x8.animation.json";
import rangedSheetUrl from "./assets/ranged_enemy-entered_water-4dir-x8.png";
import rangedMetadata from "./assets/ranged_enemy-entered_water-4dir-x8.animation.json";
import slashSheetUrl from "./assets/slash_enemy-entered_water-4dir-x8.png";
import slashMetadata from "./assets/slash_enemy-entered_water-4dir-x8.animation.json";
import thrustSheetUrl from "./assets/thrust_enemy-entered_water-4dir-x8.png";
import thrustMetadata from "./assets/thrust_enemy-entered_water-4dir-x8.animation.json";

export interface EnemyWaterAnimationAsset {
  readonly sheetUrl: string;
  readonly frameDurationsMs: readonly number[];
}

function asset(sheetUrl: string, metadata: typeof thrustMetadata): EnemyWaterAnimationAsset {
  return {
    sheetUrl,
    frameDurationsMs: metadata.timing.frame_durations_ms,
  };
}

export const enemyWaterAnimationAssets: Readonly<Record<string, EnemyWaterAnimationAsset>> = {
  "enemy.thrust": asset(thrustSheetUrl, thrustMetadata),
  "enemy.slash": asset(slashSheetUrl, slashMetadata),
  "enemy.ranged": asset(rangedSheetUrl, rangedMetadata),
  "enemy.charge": asset(chargeSheetUrl, chargeMetadata),
  "enemy.bomb": asset(bombSheetUrl, bombMetadata),
};
