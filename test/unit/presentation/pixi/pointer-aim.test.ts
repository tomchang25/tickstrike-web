import { describe, expect, it } from "vitest";
import {
  dominantDirection,
  resolveAimDirection,
  resolveAimDistance,
  screenPointToCell,
} from "@presentation/pixi/pointer-aim";

describe("pointer aim", () => {
  it("converts a CSS-scaled canvas point to a grid cell", () => {
    expect(screenPointToCell({ x: 90, y: 132 }, { left: 10, top: 20, width: 384, height: 384 }, 768, 768)).toEqual({
      x: 2,
      y: 3,
    });
  });

  it("uses the dominant cardinal direction and last aim for ambiguous deltas", () => {
    expect(resolveAimDirection({ x: 9, y: 7 }, { x: 6, y: 6 })).toEqual({ x: 1, y: 0 });
    expect(dominantDirection({ x: 0, y: 0 }, { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
    expect(dominantDirection({ x: 2, y: 2 }, { x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
  });

  it("uses the hovered grid distance up to the Dash range", () => {
    expect(resolveAimDistance({ x: 7, y: 6 }, { x: 6, y: 6 })).toBe(1);
    expect(resolveAimDistance({ x: 12, y: 6 }, { x: 6, y: 6 })).toBe(3);
    expect(resolveAimDistance({ x: 6, y: 6 }, { x: 6, y: 6 })).toBe(1);
  });

  it("rejects points outside the canvas rectangle", () => {
    expect(
      screenPointToCell({ x: 394, y: 244 }, { left: 10, top: 20, width: 384, height: 384 }, 768, 768),
    ).toBeUndefined();
  });

  it("subtracts the board origin inside an expanded composition", () => {
    expect(
      screenPointToCell({ x: 257, y: 193 }, { left: 0, top: 0, width: 704, height: 448 }, 1408, 896, 64, {
        origin: { x: 128, y: 64 },
        widthCells: 18,
        heightCells: 12,
      }),
    ).toEqual({ x: 6, y: 5 });
  });

  it("rejects the decorative margin around the board", () => {
    const board = { origin: { x: 128, y: 64 }, widthCells: 18, heightCells: 12 };
    const rect = { left: 0, top: 0, width: 1408, height: 896 };

    expect(screenPointToCell({ x: 64, y: 200 }, rect, 1408, 896, 64, board)).toBeUndefined();
    expect(screenPointToCell({ x: 200, y: 32 }, rect, 1408, 896, 64, board)).toBeUndefined();
    expect(screenPointToCell({ x: 1344, y: 200 }, rect, 1408, 896, 64, board)).toBeUndefined();
    expect(screenPointToCell({ x: 200, y: 864 }, rect, 1408, 896, 64, board)).toBeUndefined();
  });
});
