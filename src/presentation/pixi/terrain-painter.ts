import { Container, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import type { WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";

/**
 * Paints the static layered terrain — a tiled water base, a dual-grid autotiled grass island, and a
 * same-tone textured interior — into a renderer-owned layer from the snapshot's land mask. It reads
 * no gameplay and decides nothing: `arena.tiles` is the only truth for land vs water. Terrain never
 * changes during a run (no terrain mutation ships), so it rebuilds only when the arena signature
 * (dimensions + tiles) changes, and its scatter placement is a deterministic function of cell
 * coordinates — never core RNG — so it cannot affect determinism or goldens.
 *
 * Assets are baked offline by `dev/tools/terrain/bake_terrain.py`; the atlas layout below mirrors its
 * manifest (`terrain-atlas.json`): a 4x4 grid of 64px dual-grid tiles indexed by the 4-corner land
 * mask, one 32px water tile, and a row of 32px same-tone grass variants.
 */

const SUB = CELL_SIZE / 2; // one gameplay cell renders as 2x2 sub-tiles
const AUTOTILE_COLUMNS = 4; // 4x4 atlas, index === mask
const MASK_TL = 1;
const MASK_TR = 2;
const MASK_BL = 4;
const MASK_BR = 8;

export class TerrainPainter {
  private landTiles: Texture[] = [];
  private grassVariants: Texture[] = [];
  private waterTexture: Texture | undefined;
  private signature: string | undefined;

  constructor(private readonly layer: Container) {}

  /** Slices the baked atlas textures into the per-mask land tiles, grass variants, and water tile. */
  setAtlas(landAutotile: Texture, water: Texture, grassTexture: Texture): void {
    landAutotile.source.scaleMode = "nearest";
    water.source.scaleMode = "nearest";
    grassTexture.source.scaleMode = "nearest";
    this.waterTexture = water;
    this.landTiles = Array.from({ length: AUTOTILE_COLUMNS * AUTOTILE_COLUMNS }, (_, mask) => {
      const column = mask % AUTOTILE_COLUMNS;
      const row = Math.floor(mask / AUTOTILE_COLUMNS);
      return new Texture({
        source: landAutotile.source,
        frame: new Rectangle(column * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE),
      });
    });
    const variantCount = Math.max(1, Math.floor(grassTexture.width / SUB));
    this.grassVariants = Array.from({ length: variantCount }, (_, index) => {
      return new Texture({ source: grassTexture.source, frame: new Rectangle(index * SUB, 0, SUB, SUB) });
    });
    this.signature = undefined;
  }

  /** Rebuilds the terrain when the arena's dimensions or tiles change; otherwise a no-op. */
  render(snapshot: WorldSnapshot): void {
    if (!this.waterTexture || this.landTiles.length === 0) {
      return;
    }
    const { width, height, tiles } = snapshot.arena;
    const signature = `${width}x${height}:${tiles.join("")}`;
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    this.clear();

    const isLand = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < width && y < height && tiles[y * width + x] === "floor";

    const water = new TilingSprite({
      texture: this.waterTexture,
      width: width * CELL_SIZE,
      height: height * CELL_SIZE,
    });
    this.layer.addChild(water);

    // Dual-grid land: one tile per grid corner, chosen by the four cells meeting at it.
    for (let cy = 0; cy <= height; cy += 1) {
      for (let cx = 0; cx <= width; cx += 1) {
        const mask =
          (isLand(cx - 1, cy - 1) ? MASK_TL : 0) |
          (isLand(cx, cy - 1) ? MASK_TR : 0) |
          (isLand(cx - 1, cy) ? MASK_BL : 0) |
          (isLand(cx, cy) ? MASK_BR : 0);
        if (mask === 0) {
          continue;
        }
        const tile = new Sprite(this.landTiles[mask]);
        tile.position.set(cx * CELL_SIZE - CELL_SIZE / 2, cy * CELL_SIZE - CELL_SIZE / 2);
        this.layer.addChild(tile);
      }
    }

    // Same-tone textured interior on fully-interior cells, keeping the shore ring's clean edge tiles.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!this.isInterior(isLand, x, y)) {
          continue;
        }
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            this.layer.addChild(this.grassSubTile(x, y, sx, sy));
          }
        }
      }
    }
  }

  clear(): void {
    this.layer.removeChildren().forEach((child) => child.destroy());
  }

  private isInterior(isLand: (x: number, y: number) => boolean, x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!isLand(x + dx, y + dy)) {
          return false;
        }
      }
    }
    return true;
  }

  /** A grass variant and flip chosen deterministically from the sub-tile coordinate (never core RNG). */
  private grassSubTile(x: number, y: number, sx: number, sy: number): Sprite {
    const hash = hashCell(x * 2 + sx, y * 2 + sy);
    const variant = this.grassVariants[hash % this.grassVariants.length]!;
    const sprite = new Sprite(variant);
    sprite.anchor.set(0.5);
    sprite.scale.set((hash & 1) === 0 ? 1 : -1, (hash & 2) === 0 ? 1 : -1);
    sprite.position.set(x * CELL_SIZE + sx * SUB + SUB / 2, y * CELL_SIZE + sy * SUB + SUB / 2);
    return sprite;
  }
}

/** Stable non-cryptographic hash of a sub-tile coordinate for deterministic scatter/flip selection. */
function hashCell(x: number, y: number): number {
  let hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  return hash >>> 0;
}
