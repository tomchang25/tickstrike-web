import { describe, expect, it } from "vitest";
import { dominantDirection, resolveAimDirection, screenPointToCell } from "../../../../src/presentation/pixi/pointer-aim";

describe("pointer aim", () => {
  it("converts a CSS-scaled canvas point to a grid cell", () => {
    expect(
      screenPointToCell(
        { x: 90, y: 132 },
        { left: 10, top: 20, width: 384, height: 384 },
        768,
        768,
      ),
    ).toEqual({ x: 2, y: 3 });
  });

  it("uses the dominant cardinal direction and last aim for ambiguous deltas", () => {
    expect(resolveAimDirection({ x: 9, y: 7 }, { x: 6, y: 6 })).toEqual({ x: 1, y: 0 });
    expect(dominantDirection({ x: 0, y: 0 }, { x: 0, y: -1 })).toEqual({ x: 0, y: -1 });
    expect(dominantDirection({ x: 2, y: 2 }, { x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
  });

  it("rejects points outside the canvas rectangle", () => {
    expect(
      screenPointToCell(
        { x: 394, y: 244 },
        { left: 10, top: 20, width: 384, height: 384 },
        768,
        768,
      ),
    ).toBeUndefined();
  });
});
