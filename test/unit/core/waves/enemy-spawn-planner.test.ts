import { describe, expect, it } from "vitest";
import { planGroupCells } from "../../../../src/core/waves/enemy-spawn-planner";
import type { RandomUnitSource, WaveWorldView } from "../../../../src/core/waves/wave-inputs";
import { cellKey, manhattanDistance, sameCell, type Cell } from "../../../../src/core/model/types";

function sequenceSource(values: readonly number[]): RandomUnitSource {
  let index = 0;
  return () => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  };
}

function makeView(options: {
  width: number;
  height: number;
  playerCell: Cell;
  occupied?: readonly Cell[];
  reserved?: readonly Cell[];
}): WaveWorldView {
  const occupiedKeys = new Set((options.occupied ?? []).map(cellKey));
  const reservedKeys = new Set((options.reserved ?? []).map(cellKey));
  return {
    width: options.width,
    height: options.height,
    playerCell: options.playerCell,
    livingEnemyCount: occupiedKeys.size,
    isArenaLegal: () => true,
    isOccupied: (cell) => occupiedKeys.has(cellKey(cell)),
    isReserved: (cell) => reservedKeys.has(cellKey(cell)),
  };
}

function allDistinct(cells: readonly Cell[]): boolean {
  return new Set(cells.map(cellKey)).size === cells.length;
}

describe("planGroupCells: player-ring", () => {
  const view = makeView({ width: 9, height: 9, playerCell: { x: 4, y: 4 } });

  it("returns exactly N distinct legal cells within the ring band", () => {
    const result = planGroupCells("player-ring", 4, view, sequenceSource([0.3]));
    expect("failed" in result).toBe(false);
    const cells = (result as { cells: readonly Cell[] }).cells;
    expect(cells).toHaveLength(4);
    expect(allDistinct(cells)).toBe(true);
    for (const cell of cells) {
      expect(sameCell(cell, view.playerCell)).toBe(false);
      const distance = manhattanDistance(cell, view.playerCell);
      expect(distance).toBeGreaterThanOrEqual(2);
      expect(distance).toBeLessThanOrEqual(4);
    }
  });

  it("is deterministic for the same source sequence", () => {
    const first = planGroupCells("player-ring", 4, view, sequenceSource([0.7, 0.2, 0.9]));
    const second = planGroupCells("player-ring", 4, view, sequenceSource([0.7, 0.2, 0.9]));
    expect(first).toEqual(second);
  });

  it("fails rather than returning a short list when too few band cells exist", () => {
    const tinyView = makeView({ width: 1, height: 1, playerCell: { x: 0, y: 0 } });
    const result = planGroupCells("player-ring", 1, tinyView, sequenceSource([0]));
    expect(result).toEqual({ failed: true });
  });
});

describe("planGroupCells: anchor-cluster", () => {
  const view = makeView({ width: 9, height: 9, playerCell: { x: 4, y: 4 } });

  it("returns exactly N distinct legal cells nearest the chosen anchor", () => {
    const result = planGroupCells("anchor-cluster", 3, view, sequenceSource([0.1, 0.4]));
    expect("failed" in result).toBe(false);
    const cells = (result as { cells: readonly Cell[] }).cells;
    expect(cells).toHaveLength(3);
    expect(allDistinct(cells)).toBe(true);
    for (const cell of cells) {
      expect(sameCell(cell, view.playerCell)).toBe(false);
    }
  });

  it("is deterministic for the same source sequence", () => {
    const first = planGroupCells("anchor-cluster", 3, view, sequenceSource([0.6, 0.1]));
    const second = planGroupCells("anchor-cluster", 3, view, sequenceSource([0.6, 0.1]));
    expect(first).toEqual(second);
  });

  it("fails when no cell falls within anchor distance of the player", () => {
    const tinyView = makeView({ width: 3, height: 3, playerCell: { x: 1, y: 1 } });
    const result = planGroupCells("anchor-cluster", 1, tinyView, sequenceSource([0]));
    expect(result).toEqual({ failed: true });
  });
});

describe("planGroupCells: scatter", () => {
  const view = makeView({ width: 5, height: 5, playerCell: { x: 2, y: 2 } });

  it("returns exactly N distinct legal cells anywhere on the board", () => {
    const result = planGroupCells("scatter", 5, view, sequenceSource([0.05, 0.5, 0.9, 0.25]));
    expect("failed" in result).toBe(false);
    const cells = (result as { cells: readonly Cell[] }).cells;
    expect(cells).toHaveLength(5);
    expect(allDistinct(cells)).toBe(true);
    for (const cell of cells) {
      expect(sameCell(cell, view.playerCell)).toBe(false);
    }
  });

  it("is deterministic for the same source sequence", () => {
    const first = planGroupCells("scatter", 5, view, sequenceSource([0.05, 0.5, 0.9]));
    const second = planGroupCells("scatter", 5, view, sequenceSource([0.05, 0.5, 0.9]));
    expect(first).toEqual(second);
  });

  it("fails when only the player's cell is free", () => {
    const occupied: Cell[] = [];
    for (let y = 0; y < view.height; y += 1) {
      for (let x = 0; x < view.width; x += 1) {
        if (!sameCell({ x, y }, view.playerCell)) {
          occupied.push({ x, y });
        }
      }
    }
    const packedView = makeView({ width: 5, height: 5, playerCell: { x: 2, y: 2 }, occupied });
    const result = planGroupCells("scatter", 1, packedView, sequenceSource([0]));
    expect(result).toEqual({ failed: true });
  });

  it("never selects a reserved cell", () => {
    const reserved: Cell[] = [];
    for (let y = 0; y < view.height; y += 1) {
      for (let x = 0; x < view.width; x += 1) {
        if (!(x === 0 && y === 0)) {
          reserved.push({ x, y });
        }
      }
    }
    const reservedView = makeView({
      width: 5,
      height: 5,
      playerCell: { x: 2, y: 2 },
      reserved,
    });
    const result = planGroupCells("scatter", 1, reservedView, sequenceSource([0]));
    expect(result).toEqual({ cells: [{ x: 0, y: 0 }] });
  });
});

describe("planGroupCells: count zero", () => {
  it("returns an empty plan without consuming the random source", () => {
    const view = makeView({ width: 3, height: 3, playerCell: { x: 1, y: 1 } });
    let calls = 0;
    const random: RandomUnitSource = () => {
      calls += 1;
      return 0;
    };
    const result = planGroupCells("scatter", 0, view, random);
    expect(result).toEqual({ cells: [] });
    expect(calls).toBe(0);
  });
});
