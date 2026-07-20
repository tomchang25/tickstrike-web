import { describe, expect, it } from "vitest";
import {
  addCells,
  cardinalDirection,
  cellKey,
  chebyshevDistance,
  directionBetween,
  isCardinalDirection,
  manhattanDistance,
} from "@core/model/types";
import { createShippedArena } from "@core/world/arena";
import { createShippedArena as createShippedWorld } from "@harness/fixtures/shipped-arena";

describe("shipped arena geometry", () => {
  it("creates the twelve-by-twelve land rectangle and sea perimeter", () => {
    const arena = createShippedArena();
    const land = [...arena.iterateCells()].filter((cell) => arena.terrainAt(cell) === "land");
    const sea = [...arena.iterateCells()].filter((cell) => arena.terrainAt(cell) === "sea");

    expect(arena.width).toBe(12);
    expect(arena.height).toBe(12);
    expect(land).toHaveLength(100);
    expect(sea).toHaveLength(44);
    expect(arena.terrainAt({ x: 6, y: 6 })).toBe("land");
    expect(arena.isLegalCell({ x: 6, y: 6 })).toBe(true);
    expect(arena.isWalkable({ x: 0, y: 6 })).toBe(false);
  });

  it("keeps bounds and out-of-bounds queries distinct from sea", () => {
    const arena = createShippedArena();

    expect(arena.isInBounds({ x: 0, y: 0 })).toBe(true);
    expect(arena.isInBounds({ x: -1, y: 0 })).toBe(false);
    expect(arena.isInBounds({ x: 12, y: 0 })).toBe(false);
    expect(arena.terrainAt({ x: -1, y: 0 })).toBeUndefined();
    expect(arena.isLegalCell({ x: -1, y: 0 })).toBe(false);
    expect(arena.tileAt({ x: -1, y: 0 })).toBe("wall");
  });

  it("iterates cells in stable row-major order", () => {
    const arena = createShippedArena();

    expect([...arena.iterateCells()].slice(0, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect([...arena.iterateCells()].slice(-2)).toEqual([
      { x: 10, y: 11 },
      { x: 11, y: 11 },
    ]);
  });

  it("provides renderer-independent cell operations", () => {
    expect(addCells({ x: 2, y: 3 }, { x: -1, y: 4 })).toEqual({ x: 1, y: 7 });
    expect(cellKey({ x: 2, y: 3 })).toBe("2,3");
    expect(manhattanDistance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(7);
    expect(chebyshevDistance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(4);
    expect(isCardinalDirection({ x: 1, y: 0 })).toBe(true);
    expect(isCardinalDirection({ x: 1, y: 1 })).toBe(false);
    expect(cardinalDirection({ x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
    expect(cardinalDirection({ x: 1, y: 1 })).toBeUndefined();
    expect(directionBetween({ x: 4, y: 4 }, { x: 5, y: 4 })).toEqual({ x: 1, y: 0 });
    expect(directionBetween({ x: 4, y: 4 }, { x: 5, y: 5 })).toBeUndefined();
  });

  it("normalizes duplicate footprints without inventing an empty cell", () => {
    const arena = createShippedArena();
    const footprint = arena.normalizeFootprint([
      { x: 6, y: 6 },
      { x: 6, y: 6 },
      { x: 7, y: 6 },
    ]);

    expect(footprint).toEqual([
      { x: 6, y: 6 },
      { x: 7, y: 6 },
    ]);
    expect(arena.normalizeFootprint([])).toEqual([]);
    expect(arena.isLegalFootprint([])).toBe(true);
    expect(arena.isLegalFootprint(footprint)).toBe(true);
    expect(arena.isLegalFootprint([{ x: 0, y: 0 }])).toBe(false);
    expect(arena.isLegalFootprint([{ x: -1, y: 0 }])).toBe(false);
  });

  it("routes the foundation scenario through the shipped board", () => {
    const world = createShippedWorld();
    const player = world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 6, y: 6 },
      hp: 100,
    });

    expect(player.cell).toEqual({ x: 6, y: 6 });
    expect(world.snapshot().arena).toMatchObject({ width: 12, height: 12 });
    expect(world.snapshot().arena.terrain.filter((terrain) => terrain === "land")).toHaveLength(
      100,
    );
  });
});
