import { addCells, cardinalDirection, sameCell, type Cell } from "../model/types";
import type { EnemyActionDefinition } from "../model/types";

export const CARDINAL_DIRECTIONS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/** Rotates a local offset where x is forward and y is lateral into world space. */
export function rotateLocalOffset(offset: Cell, facing: Cell): Cell {
  const direction = cardinalDirection(facing);
  if (!direction) {
    throw new Error("Basic enemy facing must be cardinal.");
  }
  const lateral = { x: -direction.y, y: direction.x };
  return {
    x: direction.x * offset.x + lateral.x * offset.y,
    y: direction.y * offset.x + lateral.y * offset.y,
  };
}

export function rotatedAttackCells(
  origin: Cell,
  facing: Cell,
  offsets: readonly Cell[],
): readonly Cell[] {
  const cells = offsets.map((offset) => addCells(origin, rotateLocalOffset(offset, facing)));
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function attackOriginCellsFromShape(
  target: Cell,
  action: EnemyActionDefinition,
): readonly Cell[] {
  const origins: Cell[] = [];
  for (const facing of CARDINAL_DIRECTIONS) {
    for (const offset of action.offsets) {
      const rotated = rotateLocalOffset(offset, facing);
      const origin = { x: target.x - rotated.x, y: target.y - rotated.y };
      if (!origins.some((candidate) => sameCell(candidate, origin))) {
        origins.push(origin);
      }
    }
  }
  return origins;
}
