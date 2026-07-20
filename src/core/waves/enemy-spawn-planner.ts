import type { PlacementStrategy } from "../content/wave-schema";
import { manhattanDistance, sameCell, type Cell } from "../model/types";
import type { RandomUnitSource, WaveWorldView } from "./wave-inputs";

const PLAYER_RING_MIN_DISTANCE = 2;
const PLAYER_RING_MAX_DISTANCE = 4;
const ANCHOR_CLUSTER_MIN_DISTANCE = 3;
const ANCHOR_CLUSTER_MAX_DISTANCE = 5;

export type SpawnPlacementResult = { readonly cells: readonly Cell[] } | { readonly failed: true };

function isLegalCell(view: WaveWorldView, cell: Cell): boolean {
  return (
    !sameCell(cell, view.playerCell) &&
    view.isArenaLegal(cell) &&
    !view.isOccupied(cell) &&
    !view.isReserved(cell)
  );
}

/** Enumerates every legal cell in a fixed row-major order so the random source only selects. */
function collectLegalCells(view: WaveWorldView): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < view.height; y += 1) {
    for (let x = 0; x < view.width; x += 1) {
      const cell = { x, y };
      if (isLegalCell(view, cell)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

function collectCellsInBand(
  view: WaveWorldView,
  center: Cell,
  minDistance: number,
  maxDistance: number,
): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < view.height; y += 1) {
    for (let x = 0; x < view.width; x += 1) {
      const cell = { x, y };
      const distance = manhattanDistance(center, cell);
      if (distance < minDistance || distance > maxDistance) {
        continue;
      }
      if (isLegalCell(view, cell)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

function drawIndex(random: RandomUnitSource, length: number): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

/** Draws `count` distinct cells from `candidates` without replacement, consuming one draw each. */
function selectRandomSubset(
  candidates: readonly Cell[],
  count: number,
  random: RandomUnitSource,
): Cell[] {
  const pool = [...candidates];
  const chosen: Cell[] = [];
  for (let index = 0; index < count; index += 1) {
    const pickIndex = drawIndex(random, pool.length);
    chosen.push(pool.splice(pickIndex, 1)[0]!);
  }
  return chosen;
}

function angleFrom(origin: Cell, cell: Cell): number {
  return Math.atan2(cell.y - origin.y, cell.x - origin.x);
}

function angleDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 2 * Math.PI - diff);
}

/**
 * Draws a random starting cell, then greedily adds whichever remaining candidate maximizes its
 * minimum angular distance to cells already chosen, so a batch spreads around `origin` instead of
 * clustering to one side. Only the starting draw consumes the random source; the rest is a
 * deterministic function of the fixed candidate order.
 */
function selectAngularlySpreadCells(
  candidates: readonly Cell[],
  count: number,
  origin: Cell,
  random: RandomUnitSource,
): Cell[] {
  const remaining = [...candidates];
  const chosen: Cell[] = [remaining.splice(drawIndex(random, remaining.length), 1)[0]!];
  while (chosen.length < count) {
    let bestIndex = 0;
    let bestMinDiff = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      let minDiff = Infinity;
      for (const picked of chosen) {
        minDiff = Math.min(
          minDiff,
          angleDiff(angleFrom(origin, candidate), angleFrom(origin, picked)),
        );
      }
      if (minDiff > bestMinDiff) {
        bestMinDiff = minDiff;
        bestIndex = index;
      }
    }
    chosen.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return chosen;
}

function planPlayerRing(
  view: WaveWorldView,
  count: number,
  random: RandomUnitSource,
): SpawnPlacementResult {
  const candidates = collectCellsInBand(
    view,
    view.playerCell,
    PLAYER_RING_MIN_DISTANCE,
    PLAYER_RING_MAX_DISTANCE,
  );
  if (candidates.length < count) {
    return { failed: true };
  }
  return { cells: selectAngularlySpreadCells(candidates, count, view.playerCell, random) };
}

function planAnchorCluster(
  view: WaveWorldView,
  count: number,
  random: RandomUnitSource,
): SpawnPlacementResult {
  const anchorCandidates = collectCellsInBand(
    view,
    view.playerCell,
    ANCHOR_CLUSTER_MIN_DISTANCE,
    ANCHOR_CLUSTER_MAX_DISTANCE,
  );
  if (anchorCandidates.length === 0) {
    return { failed: true };
  }
  const anchor = anchorCandidates[drawIndex(random, anchorCandidates.length)]!;
  const legalCells = collectLegalCells(view);
  if (legalCells.length < count) {
    return { failed: true };
  }
  const nearest = [...legalCells].sort(
    (a, b) => manhattanDistance(anchor, a) - manhattanDistance(anchor, b),
  );
  return { cells: nearest.slice(0, count) };
}

function planScatter(
  view: WaveWorldView,
  count: number,
  random: RandomUnitSource,
): SpawnPlacementResult {
  const candidates = collectLegalCells(view);
  if (candidates.length < count) {
    return { failed: true };
  }
  return { cells: selectRandomSubset(candidates, count, random) };
}

/**
 * Plans exactly `count` distinct legal cells for one group's placement strategy. Returns
 * `{ failed: true }` rather than a short list when fewer than `count` legal cells exist.
 */
export function planGroupCells(
  strategy: PlacementStrategy,
  count: number,
  view: WaveWorldView,
  random: RandomUnitSource,
): SpawnPlacementResult {
  if (count <= 0) {
    return { cells: [] };
  }
  switch (strategy) {
    case "player-ring":
      return planPlayerRing(view, count, random);
    case "anchor-cluster":
      return planAnchorCluster(view, count, random);
    case "scatter":
      return planScatter(view, count, random);
    default: {
      const exhaustiveCheck: never = strategy;
      throw new Error(`Unknown placement strategy: ${String(exhaustiveCheck)}`);
    }
  }
}
