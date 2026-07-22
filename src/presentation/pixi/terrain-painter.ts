import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from "pixi.js";
import type { WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";

/**
 * Paints the walled-contour terrain — a tiled water base, borderless floor
 * tiles, and a Cainos-style wall contour that rims each land region and hangs
 * an inner brick face into enclosed water openings — into a renderer-owned
 * layer from the snapshot's land mask. It reads no gameplay and decides
 * nothing: `arena.tiles` is the only truth for land vs water. Terrain never
 * changes during a run, so it rebuilds only when the arena signature changes,
 * and every random choice (floor variant, flower motif) is a pure function of
 * cell coordinates — never core RNG — so it cannot affect determinism.
 *
 * Assets are baked by `dev/tools/terrain/bake_wall_terrain.py`: the atlas
 * carries the two canonical wall structures verbatim (exterior enclosure at 6x8
 * units, interior opening at 8x7 units) plus the floor tile variants. The 16px
 * piece layout sliced here mirrors `dev/tools/terrain/render_wall_contour_preview.py`,
 * which validates the same rules by rebuilding both canonical structures
 * pixel-perfect. Wall rims and stone runs are 32px-periodic, so horizontal and
 * vertical runs tile contiguous strips instead of shuffling per-unit pieces —
 * shuffling would split stones and open 1px joints. The interior face's
 * leftmost two columns carry the west wall's baked occlusion shadow and are
 * placed only at each run's left end.
 *
 * Wall structures are emitted only for rectangular land regions and enclosed
 * rectangular water openings; a non-rectangular region renders floor and water
 * without a wall contour, which keeps odd debug arenas sane rather than
 * guessing at unauthored corner art.
 */

const UNIT = 16; // wall piece unit
const FLOOR_TILE = 32; // borderless floor tile; one cell holds 2x2 of them
const FLOWER_PERCENT = 8;

// Static reflection treatment: the wall's front face vertically mirrored into
// the water below it, pushed toward the water hue and made translucent. A 1px
// light waterline separates the wall foot from its mirror image.
const REFLECTION_TINT = 0x8fc8e0;
// Vertical compression of the mirror image (water is seen at an angle). 0.75
// keeps every 16px source row an integer 12px on screen, so piece offsets stay
// on the pixel grid; drop to 0.5 if the row-skip sampling reads as noise.
const REFLECTION_SQUASH = 1.5;
// Continuous fade from the waterline outward, applied as a gradient alpha mask
// over the whole mirror image so there are no per-row banding seams.
// [position 0..1, opacity] stops along the reflection's height.
const REFLECTION_FADE_STOPS: readonly (readonly [number, number])[] = [
  [0, 0.85],
  [0.65, 0.4],
  [1, 0.1],
];
const WATERLINE_COLOR = 0xe8f6f8;
const WATERLINE_ALPHA = 0.65;

interface PlaceOptions {
  readonly flipY?: boolean;
  readonly alpha?: number;
  readonly tint?: number;
  /** Vertical scale applied together with flipY. */
  readonly squashY?: number;
}

const REFLECTED: PlaceOptions = { flipY: true, squashY: REFLECTION_SQUASH, tint: REFLECTION_TINT };

let reflectionFade: Texture | undefined;

/** Lazy 1x64 white gradient texture carrying the fade stops in its alpha channel. */
function reflectionFadeTexture(): Texture {
  if (!reflectionFade) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    for (const [offset, alpha] of REFLECTION_FADE_STOPS) {
      gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1, canvas.height);
    reflectionFade = Texture.from(canvas);
  }
  return reflectionFade;
}

/** Baked-manifest data the painter needs; see `wall-terrain.json`. */
export interface TerrainConfig {
  readonly exteriorOrigin: { readonly x: number; readonly y: number };
  readonly interiorOrigin: { readonly x: number; readonly y: number };
  readonly grassVariants: { readonly y: number; readonly count: number };
  readonly flowerVariants: { readonly y: number; readonly count: number };
}

interface Region {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly cellCount: number;
  readonly touchesBorder: boolean;
}

interface ExteriorPieces {
  readonly nw: Texture;
  readonly ne: Texture;
  readonly nStrip: Texture;
  readonly west: readonly Texture[];
  readonly east: readonly Texture[];
  readonly ledgeW: Texture;
  readonly ledgeE: Texture;
  readonly ledgeStrip: Texture;
  readonly faceStrip: Texture;
  readonly faceW: Texture;
  readonly faceE: Texture;
  readonly bottomW: Texture;
  readonly bottomE: Texture;
  readonly bottomStrip: Texture;
}

interface InteriorPieces {
  readonly west: readonly Texture[];
  readonly east: readonly Texture[];
  readonly sw: Texture;
  readonly se: Texture;
  readonly ledgeStrip: Texture;
  readonly faceLeft: Texture;
  readonly faceMid: Texture;
  readonly bottomStrip: Texture;
}

export class TerrainPainter {
  private waterTexture: Texture | undefined;
  private exterior: ExteriorPieces | undefined;
  private interior: InteriorPieces | undefined;
  private grassTiles: Texture[] = [];
  private flowerTiles: Texture[] = [];
  private signature: string | undefined;

  constructor(
    private readonly layer: Container,
    private readonly overlayLayer: Container,
  ) {}

  /** Slices the baked atlas into named wall pieces and floor tile variants. */
  setAtlas(atlas: Texture, water: Texture, config: TerrainConfig): void {
    atlas.source.scaleMode = "nearest";
    water.source.scaleMode = "nearest";
    this.waterTexture = water;
    const units = (origin: { x: number; y: number }, c: number, r: number, w = 1, h = 1): Texture =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle(origin.x + c * UNIT, origin.y + r * UNIT, w * UNIT, h * UNIT),
      });
    const a = config.exteriorOrigin;
    this.exterior = {
      nw: units(a, 0, 0),
      ne: units(a, 5, 0),
      nStrip: units(a, 1, 0, 4, 1),
      west: [1, 2, 3].map((r) => units(a, 0, r)),
      east: [1, 2, 3].map((r) => units(a, 5, r)),
      ledgeW: units(a, 0, 4),
      ledgeE: units(a, 5, 4),
      ledgeStrip: units(a, 1, 4, 4, 1),
      faceStrip: units(a, 1, 5, 4, 2),
      faceW: units(a, 0, 5, 1, 2),
      faceE: units(a, 5, 5, 1, 2),
      bottomW: units(a, 0, 7),
      bottomE: units(a, 5, 7),
      bottomStrip: units(a, 1, 7, 4, 1),
    };
    const b = config.interiorOrigin;
    this.interior = {
      west: [0, 1, 2, 3, 4, 5].map((r) => units(b, 0, r)),
      east: [0, 1, 2, 3, 4, 5].map((r) => units(b, 7, r)),
      sw: units(b, 0, 6),
      se: units(b, 7, 6),
      ledgeStrip: units(b, 1, 0, 6, 1),
      faceLeft: units(b, 1, 1, 2, 3),
      faceMid: units(b, 3, 1, 4, 3),
      bottomStrip: units(b, 1, 6, 6, 1),
    };
    const floorTile = (row: { y: number }, index: number): Texture =>
      new Texture({
        source: atlas.source,
        frame: new Rectangle(index * FLOOR_TILE, row.y, FLOOR_TILE, FLOOR_TILE),
      });
    this.grassTiles = Array.from({ length: config.grassVariants.count }, (_, i) => floorTile(config.grassVariants, i));
    this.flowerTiles = Array.from({ length: config.flowerVariants.count }, (_, i) =>
      floorTile(config.flowerVariants, i),
    );
    this.signature = undefined;
  }

  /** Rebuilds the terrain when the arena's dimensions or tiles change; otherwise a no-op. */
  render(snapshot: WorldSnapshot): void {
    if (!this.waterTexture || !this.exterior || !this.interior || this.grassTiles.length === 0) {
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

    this.layer.addChild(
      new TilingSprite({ texture: this.waterTexture, width: width * CELL_SIZE, height: height * CELL_SIZE }),
    );
    this.paintFloor(width, height, isLand);

    for (const region of findRegions(width, height, (x, y) => isLand(x, y))) {
      if (isRectangular(region)) {
        this.paintExteriorRing(region);
      }
    }
    for (const region of findRegions(width, height, (x, y) => !isLand(x, y))) {
      if (!region.touchesBorder && isRectangular(region)) {
        this.paintInteriorOpening(region);
      }
    }
  }

  clear(): void {
    // Reflection groups are nested containers, so destruction must be deep.
    this.layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.overlayLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  private paintFloor(width: number, height: number, isLand: (x: number, y: number) => boolean): void {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!isLand(x, y)) {
          continue;
        }
        for (let sy = 0; sy < 2; sy += 1) {
          for (let sx = 0; sx < 2; sx += 1) {
            const sxg = x * 2 + sx;
            const syg = y * 2 + sy;
            const px = x * CELL_SIZE + sx * FLOOR_TILE;
            const py = y * CELL_SIZE + sy * FLOOR_TILE;
            this.place(this.grassTiles[hashCell(sxg, syg) % this.grassTiles.length]!, px, py);
            const flowerSeed = hashCell(sxg + 13, syg + 29);
            if (this.flowerTiles.length > 0 && flowerSeed % 100 < FLOWER_PERCENT) {
              this.place(this.flowerTiles[(flowerSeed >>> 8) % this.flowerTiles.length]!, px, py);
            }
          }
        }
      }
    }
  }

  /** Rim ring inside the region's edges plus the south face hanging below it. */
  private paintExteriorRing(region: Region): void {
    const pieces = this.exterior!;
    const x0 = region.minX * CELL_SIZE;
    const y0 = region.minY * CELL_SIZE;
    const w = (region.maxX - region.minX + 1) * (CELL_SIZE / UNIT);
    const h = (region.maxY - region.minY + 1) * (CELL_SIZE / UNIT) + 3;
    const ledgeRow = h - 4;
    this.tileStrip(pieces.nStrip, x0 + UNIT, y0, (w - 2) * UNIT);
    this.place(pieces.nw, x0, y0);
    this.place(pieces.ne, x0 + (w - 1) * UNIT, y0);
    for (let r = 1; r < ledgeRow; r += 1) {
      // Positional wrap keeps the vertical stone bond of the canonical run.
      this.place(pieces.west[(r - 1) % pieces.west.length]!, x0, y0 + r * UNIT);
      this.place(pieces.east[(r - 1) % pieces.east.length]!, x0 + (w - 1) * UNIT, y0 + r * UNIT);
    }
    // The whole south treatment (ledge lip, brick face, bottom trim) is the
    // island's front wall: an actor standing on the southern land row stands
    // behind that lip, so these rows paint into the overlay layer the renderer
    // stacks above actors.
    const overlay = this.overlayLayer;
    this.tileStrip(pieces.ledgeStrip, x0 + UNIT, y0 + ledgeRow * UNIT, (w - 2) * UNIT, overlay);
    this.place(pieces.ledgeW, x0, y0 + ledgeRow * UNIT, overlay);
    this.place(pieces.ledgeE, x0 + (w - 1) * UNIT, y0 + ledgeRow * UNIT, overlay);
    this.tileStrip(pieces.faceStrip, x0 + UNIT, y0 + (h - 3) * UNIT, (w - 2) * UNIT, overlay);
    this.place(pieces.faceW, x0, y0 + (h - 3) * UNIT, overlay);
    this.place(pieces.faceE, x0 + (w - 1) * UNIT, y0 + (h - 3) * UNIT, overlay);
    this.tileStrip(pieces.bottomStrip, x0 + UNIT, y0 + (h - 1) * UNIT, (w - 2) * UNIT, overlay);
    this.place(pieces.bottomW, x0, y0 + (h - 1) * UNIT, overlay);
    this.place(pieces.bottomE, x0 + (w - 1) * UNIT, y0 + (h - 1) * UNIT, overlay);

    // Static reflection: the front face mirrored into the water, nearest rows
    // first — bottom trim, then the brick face — under a continuous fade mask.
    // The base layer keeps it under grid lines, actors, and the wall overlay.
    const waterY = y0 + h * UNIT;
    const reflection = this.beginReflection(x0, waterY, w * UNIT, 3 * UNIT * REFLECTION_SQUASH);
    this.tileStrip(pieces.bottomStrip, x0 + UNIT, waterY, (w - 2) * UNIT, reflection, REFLECTED);
    this.place(pieces.bottomW, x0, waterY, reflection, REFLECTED);
    this.place(pieces.bottomE, x0 + (w - 1) * UNIT, waterY, reflection, REFLECTED);
    const faceY = waterY + UNIT * REFLECTION_SQUASH;
    this.tileStrip(pieces.faceStrip, x0 + UNIT, faceY, (w - 2) * UNIT, reflection, REFLECTED);
    this.place(pieces.faceW, x0, faceY, reflection, REFLECTED);
    this.place(pieces.faceE, x0 + (w - 1) * UNIT, faceY, reflection, REFLECTED);
    this.waterline(x0, waterY, w * UNIT);
  }

  /** Rim lanes hugging the opening from the land side, inner face hanging in. */
  private paintInteriorOpening(region: Region): void {
    const pieces = this.interior!;
    const cellsW = region.maxX - region.minX + 1;
    const cellsH = region.maxY - region.minY + 1;
    const x0 = region.minX * CELL_SIZE - UNIT;
    const y0 = region.minY * CELL_SIZE;
    const w = cellsW * (CELL_SIZE / UNIT) + 2;
    const h = cellsH * (CELL_SIZE / UNIT) + 1;
    const faceRows = cellsH >= 2 ? 3 : 2;
    for (let r = 0; r < h - 1; r += 1) {
      this.place(pieces.west[r % pieces.west.length]!, x0, y0 + r * UNIT);
      this.place(pieces.east[r % pieces.east.length]!, x0 + (w - 1) * UNIT, y0 + r * UNIT);
    }
    this.place(pieces.sw, x0, y0 + (h - 1) * UNIT);
    this.place(pieces.se, x0 + (w - 1) * UNIT, y0 + (h - 1) * UNIT);
    this.tileStrip(pieces.ledgeStrip, x0 + UNIT, y0, (w - 2) * UNIT);
    const faceLeft = cropFaceRows(pieces.faceLeft, faceRows);
    this.place(faceLeft, x0 + UNIT, y0 + UNIT);
    this.tileStrip(
      cropFaceRows(pieces.faceMid, faceRows),
      x0 + UNIT + faceLeft.frame.width,
      y0 + UNIT,
      (w - 2) * UNIT - faceLeft.frame.width,
    );
    this.tileStrip(pieces.bottomStrip, x0 + UNIT, y0 + (h - 1) * UNIT, (w - 2) * UNIT);

    // Static reflection of the inner face in the pool, cropped to the water
    // left between the face bottom and the bottom rim lane.
    const faceBottom = y0 + (1 + faceRows) * UNIT;
    const poolHeight = (h - 1) * UNIT - (1 + faceRows) * UNIT;
    const reflectionHeight = Math.min(faceRows * UNIT, poolHeight);
    if (reflectionHeight > 0) {
      const runWidth = (w - 2) * UNIT;
      const reflectedLeft = cropBottom(cropFaceRows(pieces.faceLeft, faceRows), reflectionHeight);
      const reflectedMid = cropBottom(cropFaceRows(pieces.faceMid, faceRows), reflectionHeight);
      const reflection = this.beginReflection(x0 + UNIT, faceBottom, runWidth, reflectionHeight * REFLECTION_SQUASH);
      this.place(reflectedLeft, x0 + UNIT, faceBottom, reflection, REFLECTED);
      this.tileStrip(
        reflectedMid,
        x0 + UNIT + reflectedLeft.frame.width,
        faceBottom,
        runWidth - reflectedLeft.frame.width,
        reflection,
        REFLECTED,
      );
      this.waterline(x0 + UNIT, faceBottom, runWidth);
    }
  }

  /**
   * Starts a mirror-image group: a container in the base layer whose alpha
   * comes entirely from a vertical gradient mask spanning the given rectangle,
   * so the fade toward open water is continuous instead of per-row banded.
   */
  private beginReflection(x: number, y: number, width: number, height: number): Container {
    const reflection = new Container();
    const fade = new Sprite(reflectionFadeTexture());
    fade.position.set(x, y);
    fade.width = width;
    fade.height = height;
    reflection.mask = fade;
    this.layer.addChild(reflection, fade);
    return reflection;
  }

  private place(texture: Texture, x: number, y: number, target: Container = this.layer, opts?: PlaceOptions): void {
    const sprite = new Sprite(texture);
    if (opts?.flipY) {
      // A negative scale renders upward from the anchor, so the position drops
      // by the rendered sprite height to keep the same covered rectangle.
      const squash = opts.squashY ?? 1;
      sprite.scale.y = -squash;
      sprite.position.set(x, y + texture.frame.height * squash);
    } else {
      sprite.position.set(x, y);
    }
    if (opts?.alpha !== undefined) {
      sprite.alpha = opts.alpha;
    }
    if (opts?.tint !== undefined) {
      sprite.tint = opts.tint;
    }
    target.addChild(sprite);
  }

  /** Repeats a contiguous strip horizontally, cropping the final repeat. */
  private tileStrip(
    strip: Texture,
    x: number,
    y: number,
    width: number,
    target: Container = this.layer,
    opts?: PlaceOptions,
  ): void {
    let cursor = 0;
    while (cursor < width) {
      const chunk = Math.min(strip.frame.width, width - cursor);
      const texture =
        chunk === strip.frame.width
          ? strip
          : new Texture({
              source: strip.source,
              frame: new Rectangle(strip.frame.x, strip.frame.y, chunk, strip.frame.height),
            });
      this.place(texture, x + cursor, y, target, opts);
      cursor += chunk;
    }
  }

  private waterline(x: number, y: number, width: number): void {
    const line = new Graphics().rect(x, y, width, 1).fill({ color: WATERLINE_COLOR, alpha: WATERLINE_ALPHA });
    this.layer.addChild(line);
  }
}

/** Keeps a texture's bottom `height` pixels — the rows nearest the water, which lead a mirrored image. */
function cropBottom(texture: Texture, height: number): Texture {
  if (height >= texture.frame.height) {
    return texture;
  }
  return new Texture({
    source: texture.source,
    frame: new Rectangle(texture.frame.x, texture.frame.y + texture.frame.height - height, texture.frame.width, height),
  });
}

/** Bottom-aligned crop so a shortened inner face keeps its authored bottom edge. */
function cropFaceRows(face: Texture, rows: number): Texture {
  const full = face.frame.height / UNIT;
  if (rows >= full) {
    return face;
  }
  return new Texture({
    source: face.source,
    frame: new Rectangle(face.frame.x, face.frame.y + (full - rows) * UNIT, face.frame.width, rows * UNIT),
  });
}

/** 4-connected regions of cells matching the predicate, with bbox and border contact. */
function findRegions(width: number, height: number, matches: (x: number, y: number) => boolean): Region[] {
  const seen = new Uint8Array(width * height);
  const regions: Region[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[y * width + x] || !matches(x, y)) {
        continue;
      }
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let cellCount = 0;
      let touchesBorder = false;
      const queue: number[] = [y * width + x];
      seen[y * width + x] = 1;
      while (queue.length > 0) {
        const index = queue.pop()!;
        const cx = index % width;
        const cy = Math.floor(index / width);
        cellCount += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
          touchesBorder = true;
        }
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && !seen[ny * width + nx] && matches(nx, ny)) {
            seen[ny * width + nx] = 1;
            queue.push(ny * width + nx);
          }
        }
      }
      regions.push({ minX, minY, maxX, maxY, cellCount, touchesBorder });
    }
  }
  return regions;
}

function isRectangular(region: Region): boolean {
  return region.cellCount === (region.maxX - region.minX + 1) * (region.maxY - region.minY + 1);
}

/** Stable non-cryptographic hash of a cell/sub-tile coordinate for deterministic selection. */
function hashCell(x: number, y: number): number {
  let hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995) >>> 0;
  return hash >>> 0;
}
