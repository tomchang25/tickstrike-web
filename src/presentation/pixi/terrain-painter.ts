import { Container, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import type { WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";

/**
 * Paints the static layered terrain — a tiled water base, a dual-grid autotiled grass island whose
 * fill comes from authored base variants, and a sparse motif overlay — into a renderer-owned layer
 * from the snapshot's land mask. It reads no gameplay and decides nothing: `arena.tiles` is the only
 * truth for land vs water. Terrain never changes during a run, so it rebuilds only when the arena
 * signature (dimensions + tiles) changes, and every random choice (base variant, motif, slot) is a
 * pure function of cell coordinates — never core RNG — so it cannot affect determinism or goldens.
 *
 * Assets are baked by `dev/tools/terrain/bake_terrain.py` from the authored `grass-tile-base.png`
 * (base variants; variant 0 is the pure flat tile) and consumed per its manifest:
 *
 * - `land-autotile.png` holds one 16-tile dual-grid block per variant, side by side; every block
 *   shares the same silhouette and shore fringe, so any two variants meet seamlessly. Each grid
 *   corner picks a variant by coordinate hash and blits `block[variant][mask]`.
 * - `grass-texture.png` holds transparent 32px motifs in weighted rows. The overlay scatters at most
 *   one motif per fill sub-tile and only where the covering corner's base variant is 0 (flat), which
 *   structurally prevents a motif from stacking on a textured base or touching the shore fringe.
 */

const SUB = CELL_SIZE / 2; // one gameplay cell renders as 2x2 sub-tiles
const ATLAS_COLUMNS = 4; // within a variant block: 4x4 tiles, index === 4-corner land mask
const MASK_TL = 1;
const MASK_TR = 2;
const MASK_BL = 4;
const MASK_BR = 8;

/** Baked-manifest data the painter needs; see `terrain-atlas.json`. */
export interface TerrainConfig {
  /** Number of base-variant blocks in the land autotile sheet. Variant 0 must be the flat one. */
  readonly variantCount: number;
  /** Total selection buckets for the motif overlay (e.g. 10). */
  readonly overlayBuckets: number;
  /** Buckets (out of `overlayBuckets`) that place no motif. */
  readonly overlayNoneBuckets: number;
  /** Buckets per motif row, in row order, after the none-buckets. */
  readonly overlayRowBuckets: readonly number[];
  /** Non-empty motif slot indices per row of the grass texture sheet. */
  readonly overlayRowSlots: readonly (readonly number[])[];
}

export class TerrainPainter {
  private variantTiles: Texture[][] = [];
  private motifTiles: Texture[][] = [];
  private waterTexture: Texture | undefined;
  private config: TerrainConfig | undefined;
  private signature: string | undefined;

  constructor(private readonly layer: Container) {}

  /** Slices the baked sheets into per-variant mask tiles and per-row motif tiles. */
  setAtlas(landAutotile: Texture, water: Texture, grassTexture: Texture, config: TerrainConfig): void {
    for (const texture of [landAutotile, water, grassTexture]) {
      texture.source.scaleMode = "nearest";
    }
    this.waterTexture = water;
    this.config = config;
    const stride = ATLAS_COLUMNS * CELL_SIZE;
    this.variantTiles = Array.from({ length: config.variantCount }, (_, variant) =>
      Array.from({ length: 16 }, (_, mask) => {
        const column = mask % ATLAS_COLUMNS;
        const row = Math.floor(mask / ATLAS_COLUMNS);
        return new Texture({
          source: landAutotile.source,
          frame: new Rectangle(variant * stride + column * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE),
        });
      }),
    );
    this.motifTiles = config.overlayRowSlots.map((slots, row) =>
      slots.map(
        (slot) => new Texture({ source: grassTexture.source, frame: new Rectangle(slot * SUB, row * SUB, SUB, SUB) }),
      ),
    );
    this.signature = undefined;
  }

  /** Rebuilds the terrain when the arena's dimensions or tiles change; otherwise a no-op. */
  render(snapshot: WorldSnapshot): void {
    const config = this.config;
    if (!this.waterTexture || !config || this.variantTiles.length === 0) {
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
    const cornerVariant = (cx: number, cy: number): number => hashCell(cx, cy) % config.variantCount;

    this.layer.addChild(
      new TilingSprite({ texture: this.waterTexture, width: width * CELL_SIZE, height: height * CELL_SIZE }),
    );

    // Dual-grid base: one 64px tile per grid corner from that corner's variant block.
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
        const tile = new Sprite(this.variantTiles[cornerVariant(cx, cy)]![mask]);
        tile.position.set(cx * CELL_SIZE - CELL_SIZE / 2, cy * CELL_SIZE - CELL_SIZE / 2);
        this.layer.addChild(tile);
      }
    }

    // Motif overlay: at most one motif per fill sub-tile, only over the flat base variant.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isLand(x, y)) {
          continue;
        }
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            const horizontal = sx === 0 ? isLand(x - 1, y) : isLand(x + 1, y);
            const vertical = sy === 0 ? isLand(x, y - 1) : isLand(x, y + 1);
            if (!horizontal || !vertical) {
              continue; // shore sub-tile: fringe stays untouched
            }
            const sxg = x * 2 + sx;
            const syg = y * 2 + sy;
            if (cornerVariant((sxg + 1) >> 1, (syg + 1) >> 1) !== 0) {
              continue; // textured base variant: never stack a motif on it
            }
            const seed = hashCell(sxg + 3, syg + 7);
            const motif = this.pickMotif(seed, config);
            if (motif) {
              const sprite = new Sprite(motif);
              sprite.position.set(x * CELL_SIZE + sx * SUB, y * CELL_SIZE + sy * SUB);
              this.layer.addChild(sprite);
            }
          }
        }
      }
    }
  }

  clear(): void {
    this.layer.removeChildren().forEach((child) => child.destroy());
  }

  private pickMotif(seed: number, config: TerrainConfig): Texture | undefined {
    let bucket = seed % config.overlayBuckets;
    if (bucket < config.overlayNoneBuckets) {
      return undefined;
    }
    bucket -= config.overlayNoneBuckets;
    for (let row = 0; row < config.overlayRowBuckets.length; row += 1) {
      if (bucket < config.overlayRowBuckets[row]!) {
        const tiles = this.motifTiles[row] ?? [];
        return tiles.length > 0 ? tiles[(seed >>> 8) % tiles.length] : undefined;
      }
      bucket -= config.overlayRowBuckets[row]!;
    }
    return undefined;
  }
}

/** Stable non-cryptographic hash of a cell/corner coordinate for deterministic selection. */
function hashCell(x: number, y: number): number {
  let hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  return hash >>> 0;
}
