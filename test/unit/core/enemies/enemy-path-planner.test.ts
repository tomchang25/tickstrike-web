import { describe, expect, it } from "vitest";
import { findEnemyPaths } from "../../../../src/core/enemies/enemy-path-planner";

describe("enemy path planner", () => {
  it("does not return a path whose first step is blocked", () => {
    const paths = findEnemyPaths({
      start: { x: 0, y: 0 },
      goals: [{ x: 2, y: 0 }],
      canPathThrough: (cell) => cell.x >= 0 && cell.x <= 3 && cell.y >= 0 && cell.y <= 2,
      canEndAt: (cell) => !(cell.x === 1 && cell.y === 0),
    });

    expect(paths[0]).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 0 },
    ]);
  });
});
