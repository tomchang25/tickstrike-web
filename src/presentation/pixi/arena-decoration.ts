import { Assets, type Container, Sprite, type Texture } from "pixi.js";
import wallTopUrl from "./assets/terrain/wall-top.png";
import wallBottomUrl from "./assets/terrain/wall-bottom.png";
import wallLeftUrl from "./assets/terrain/wall-left.png";
import wallRightUrl from "./assets/terrain/wall-right.png";
import treeGreenUrl from "./assets/terrain/tree-green.png";
import treeShadowUrl from "./assets/terrain/tree-shadow.png";
import rockGreyUrl from "./assets/terrain/rock-grey.png";
import rockReflectionUrl from "./assets/terrain/rock-reflection.png";
import arenaSouthFaceUrl from "./assets/terrain/arena-south-face.png";
import arenaReflectionUrl from "./assets/terrain/arena-reflection.png";
import decorationLayout from "./assets/terrain/arena-decoration-layout.json" with { type: "json" };

const assetUrls = {
  "wall-top": wallTopUrl,
  "wall-bottom": wallBottomUrl,
  "wall-left": wallLeftUrl,
  "wall-right": wallRightUrl,
  "tree-green": treeGreenUrl,
  "tree-shadow": treeShadowUrl,
  "rock-grey": rockGreyUrl,
  "rock-reflection": rockReflectionUrl,
  "arena-south-face": arenaSouthFaceUrl,
  "arena-reflection": arenaReflectionUrl,
} as const;

type DecorationAssetId = keyof typeof assetUrls;
type DecorationLayerId = "water-reflection" | "arena-depth" | "water-prop" | "frame";

interface DecorationPlacement {
  readonly asset: DecorationAssetId;
  readonly layer: DecorationLayerId;
  readonly x: number;
  readonly y: number;
  readonly flipX?: boolean;
}

export interface ArenaDecorationLayers {
  readonly waterReflection: Container;
  readonly arenaDepth: Container;
  readonly waterProp: Container;
  readonly frame: Container;
}

const placements = decorationLayout.placements as unknown as readonly DecorationPlacement[];

/** Loads individual placeholder assets and applies the hand-authored composition layout. */
export async function loadArenaDecorations(
  layers: ArenaDecorationLayers,
  origin: { readonly x: number; readonly y: number },
): Promise<void> {
  const entries = await Promise.all(
    Object.entries(assetUrls).map(async ([assetId, url]) => [assetId, await Assets.load<Texture>(url)] as const),
  );
  const textures = Object.fromEntries(entries) as Record<DecorationAssetId, Texture>;
  const containers: Record<DecorationLayerId, Container> = {
    "water-reflection": layers.waterReflection,
    "arena-depth": layers.arenaDepth,
    "water-prop": layers.waterProp,
    frame: layers.frame,
  };

  for (const placement of placements) {
    const texture = textures[placement.asset];
    texture.source.scaleMode = "nearest";
    const sprite = new Sprite(texture);
    sprite.position.set(placement.x - origin.x, placement.y - origin.y);
    if (placement.flipX) {
      sprite.scale.x = -1;
      sprite.x += texture.width;
    }
    containers[placement.layer].addChild(sprite);
  }
}
