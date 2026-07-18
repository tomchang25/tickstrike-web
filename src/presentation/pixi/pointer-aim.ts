import type { Cell } from "../../core/model/types";

export const CELL_SIZE = 64;
export const INITIAL_AIM: Cell = { x: 1, y: 0 };

export interface CanvasRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export function screenPointToCell(
  point: ScreenPoint,
  rect: CanvasRect,
  screenWidth: number,
  screenHeight: number,
  cellSize = CELL_SIZE,
): Cell | undefined {
  if (
    point.x < rect.left ||
    point.y < rect.top ||
    point.x >= rect.left + rect.width ||
    point.y >= rect.top + rect.height ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return undefined;
  }

  const x = Math.floor(((point.x - rect.left) / rect.width) * screenWidth / cellSize);
  const y = Math.floor(((point.y - rect.top) / rect.height) * screenHeight / cellSize);
  return { x, y };
}

export function dominantDirection(delta: Cell, lastAim: Cell = INITIAL_AIM): Cell {
  if (delta.x === 0 && delta.y === 0) return lastAim;
  if (Math.abs(delta.x) === Math.abs(delta.y)) return lastAim;
  if (Math.abs(delta.x) > Math.abs(delta.y)) return { x: Math.sign(delta.x), y: 0 };
  return { x: 0, y: Math.sign(delta.y) };
}

export function resolveAimDirection(mouseCell: Cell, origin: Cell, lastAim: Cell = INITIAL_AIM): Cell {
  return dominantDirection(
    { x: mouseCell.x - origin.x, y: mouseCell.y - origin.y },
    lastAim,
  );
}

export function resolveAimDistance(mouseCell: Cell, origin: Cell, maxRange = 3): number {
  const distance = Math.max(Math.abs(mouseCell.x - origin.x), Math.abs(mouseCell.y - origin.y));
  return Math.max(1, Math.min(maxRange, distance));
}
