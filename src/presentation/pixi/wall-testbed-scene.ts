import { Application, Assets, Sprite, TilingSprite, type Texture } from "pixi.js";
import { CELL_SIZE } from "./pointer-aim";
import waterTileUrl from "./assets/terrain/water.png";
import wallTestbedIslandUrl from "./assets/terrain/wall-testbed-island.png";

/**
 * Dev-only visual testbed for the walled-contour terrain direction: a tiled
 * water base under the baked 14x8 island overlay (grass, Cainos wall contour,
 * and two interior water openings) from `dev/tools/terrain/bake_wall_testbed.py`.
 * No gameplay, snapshot, or input — this exists to judge the art direction at
 * real runtime scale before the terrain rework is specced.
 */

const ISLAND_CELLS = { width: 14, height: 8 } as const;
const WATER_MARGIN_CELLS = 2;

export async function mountWallTestbedScene(host: HTMLElement): Promise<() => void> {
  const width = (ISLAND_CELLS.width + WATER_MARGIN_CELLS * 2) * CELL_SIZE;
  const height = (ISLAND_CELLS.height + WATER_MARGIN_CELLS * 2) * CELL_SIZE;
  const app = new Application();
  await app.init({ width, height, antialias: false });
  const [water, island] = (await Promise.all([
    Assets.load<Texture>(waterTileUrl),
    Assets.load<Texture>(wallTestbedIslandUrl),
  ])) as [Texture, Texture];
  water.source.scaleMode = "nearest";
  island.source.scaleMode = "nearest";

  app.stage.addChild(new TilingSprite({ texture: water, width, height }));
  const islandSprite = new Sprite(island);
  islandSprite.position.set(WATER_MARGIN_CELLS * CELL_SIZE, WATER_MARGIN_CELLS * CELL_SIZE);
  app.stage.addChild(islandSprite);

  app.canvas.style.maxWidth = "100%";
  app.canvas.style.height = "auto";
  app.canvas.style.imageRendering = "pixelated";
  host.appendChild(app.canvas);
  return () => {
    app.destroy(true, { children: true });
  };
}
