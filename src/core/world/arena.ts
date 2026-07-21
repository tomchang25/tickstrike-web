import { cellKey, type ArenaState, type Cell, type TerrainKind, type TileKind } from "../model/types";

export interface ArenaInput {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
}

const SHIPPED_WIDTH = 12;
const SHIPPED_HEIGHT = 12;

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Arena dimensions must be positive integers.");
  }
}

function validateCell(cell: Cell): void {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    throw new Error(`Cell coordinates must be integers: ${cellKey(cell)}`);
  }
}

function tileForTerrain(terrain: TerrainKind): TileKind {
  return terrain === "land" ? "floor" : "water";
}

/** Immutable geometry and terrain authority for a grid arena. */
export class Arena {
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly TerrainKind[];
  readonly tiles: readonly TileKind[];

  constructor(input: ArenaInput) {
    validateDimensions(input.width, input.height);
    if (input.terrain.length !== input.width * input.height) {
      throw new Error(`Expected ${input.width * input.height} terrain cells, received ${input.terrain.length}.`);
    }
    if (input.terrain.some((terrain) => terrain !== "land" && terrain !== "sea")) {
      throw new Error("Arena terrain must contain only land or sea values.");
    }

    this.width = input.width;
    this.height = input.height;
    this.terrain = Object.freeze([...input.terrain]);
    this.tiles = Object.freeze(input.terrain.map(tileForTerrain));
  }

  static fromTiles(width: number, height: number, tiles: readonly TileKind[]): Arena {
    validateDimensions(width, height);
    if (tiles.length !== width * height) {
      throw new Error(`Expected ${width * height} tiles, received ${tiles.length}.`);
    }
    return new LegacyArena(width, height, tiles);
  }

  isInBounds(cell: Cell): boolean {
    return (
      Number.isInteger(cell.x) &&
      Number.isInteger(cell.y) &&
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < this.width &&
      cell.y < this.height
    );
  }

  terrainAt(cell: Cell): TerrainKind | undefined {
    if (!this.isInBounds(cell)) {
      return undefined;
    }
    return this.terrain[cell.y * this.width + cell.x];
  }

  tileAt(cell: Cell): TileKind {
    if (!this.isInBounds(cell)) {
      return "wall";
    }
    return this.tiles[cell.y * this.width + cell.x] ?? "wall";
  }

  isLegalCell(cell: Cell): boolean {
    return this.isInBounds(cell) && this.terrainAt(cell) === "land";
  }

  isWalkable(cell: Cell): boolean {
    return this.isLegalCell(cell);
  }

  normalizeFootprint(cells: readonly Cell[]): readonly Cell[] {
    const normalized: Cell[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      validateCell(cell);
      const key = cellKey(cell);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(cloneCell(cell));
    }
    return Object.freeze(normalized);
  }

  isLegalFootprint(cells: readonly Cell[]): boolean {
    return this.normalizeFootprint(cells).every((cell) => this.isLegalCell(cell));
  }

  *iterateCells(): IterableIterator<Cell> {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        yield { x, y };
      }
    }
  }

  toState(): ArenaState {
    return {
      width: this.width,
      height: this.height,
      terrain: [...this.terrain],
      tiles: [...this.tiles],
    };
  }
}

class LegacyArena extends Arena {
  readonly tiles: readonly TileKind[];

  constructor(width: number, height: number, tiles: readonly TileKind[]) {
    const terrain = tiles.map((tile) => (tile === "floor" ? "land" : "sea"));
    super({ width, height, terrain });
    this.tiles = Object.freeze([...tiles]);
  }
}

export function createArena(input: ArenaInput): Arena {
  return new Arena(input);
}

export function createShippedArena(): Arena {
  const terrain: TerrainKind[] = [];
  for (let y = 0; y < SHIPPED_HEIGHT; y += 1) {
    for (let x = 0; x < SHIPPED_WIDTH; x += 1) {
      terrain.push(x >= 1 && x <= 10 && y >= 1 && y <= 10 ? "land" : "sea");
    }
  }
  return new Arena({ width: SHIPPED_WIDTH, height: SHIPPED_HEIGHT, terrain });
}
