import { describe, expect, it } from "vitest";
import {
  aggregateTelegraphLabels,
  formatTelegraphMultiplier,
  placeTelegraphLabels,
} from "@presentation/pixi/telegraph-labels";

describe("telegraph labels", () => {
  it("aggregates repeated values and keeps distinct values in ascending order", () => {
    const summaries = aggregateTelegraphLabels([
      {
        cells: [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
        ticks: 3,
      },
      {
        cells: [
          { x: 2, y: 2 },
          { x: 2, y: 2 },
        ],
        ticks: 1,
      },
      { cells: [{ x: 2, y: 2 }], ticks: 3 },
      { cells: [{ x: 3, y: 2 }], ticks: 0 },
    ]);

    expect(summaries).toEqual([
      {
        cell: { x: 2, y: 2 },
        entries: [
          { ticks: 1, count: 1 },
          { ticks: 3, count: 2 },
        ],
      },
      { cell: { x: 3, y: 2 }, entries: [{ ticks: 3, count: 1 }] },
    ]);
  });

  it("moves an occupied primary label above the entity and shrinks later values to corners", () => {
    const summaries = aggregateTelegraphLabels([
      { cells: [{ x: 2, y: 2 }], ticks: 2 },
      { cells: [{ x: 2, y: 2 }], ticks: 4 },
    ]);
    const summary = summaries[0];
    expect(summary).toBeDefined();
    if (!summary) {
      throw new Error("Expected one telegraph summary.");
    }

    const placements = placeTelegraphLabels([summary], [{ x: 2, y: 2 }]);

    expect(placements).toEqual([
      { cell: { x: 2, y: 2 }, ticks: 2, count: 1, primary: true, offset: { x: 0, y: -0.43 } },
      { cell: { x: 2, y: 2 }, ticks: 4, count: 1, primary: false, offset: { x: -0.3, y: -0.3 } },
    ]);
  });

  it("formats a multiplier only when a value is repeated", () => {
    expect(formatTelegraphMultiplier(1)).toBeUndefined();
    expect(formatTelegraphMultiplier(3)).toBe("x3");
  });
});
