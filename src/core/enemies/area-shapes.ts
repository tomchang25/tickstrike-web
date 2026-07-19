import type { Cell } from "../model/types";

export interface ManhattanAreaShape {
  readonly shape: "manhattan";
  readonly radius: number;
}

export type AreaShape = ManhattanAreaShape;

/**
 * Single source of truth for area-shape -> local offset geometry. Content-schema
 * validation constrains the authored radius; runtime attack-cell generation
 * consumes this same resolver so the two cannot diverge.
 */
export function resolveAreaOffsets(shape: AreaShape): readonly Cell[] {
  switch (shape.shape) {
    case "manhattan":
      return manhattanOffsets(shape.radius);
    default:
      return [];
  }
}

function manhattanOffsets(radius: number): readonly Cell[] {
  const offsets: Cell[] = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    const remaining = radius - Math.abs(dx);
    for (let dy = -remaining; dy <= remaining; dy += 1) {
      offsets.push({ x: dx, y: dy });
    }
  }
  return offsets;
}
