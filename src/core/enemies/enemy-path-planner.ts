import { sameCell, type Cell } from "../model/types";

const CARDINAL_DIRECTIONS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export interface EnemyPathQuery {
  readonly start: Cell;
  readonly goals: readonly Cell[];
  canPathThrough(cell: Cell): boolean;
  canEndAt(cell: Cell): boolean;
}

/** Returns one deterministic shortest path to every reachable goal. */
export function findEnemyPaths(query: EnemyPathQuery): readonly (readonly Cell[])[] {
  const queue: Cell[] = [query.start];
  const cameFrom = new Map<string, Cell>();
  const distances = new Map<string, number>();
  const goalKeys = new Set(query.goals.map(cellKey));
  const paths: (readonly Cell[])[] = [];
  cameFrom.set(cellKey(query.start), query.start);
  distances.set(cellKey(query.start), 0);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const currentKey = cellKey(current);
    if (goalKeys.has(currentKey) && query.canEndAt(current)) {
      const path = reconstructPath(cameFrom, current);
      if (path.length > 0) {
        paths.push(path);
      }
    }

    for (const direction of CARDINAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = cellKey(next);
      if (cameFrom.has(nextKey) || !query.canPathThrough(next)) {
        continue;
      }
      if (sameCell(current, query.start) && !query.canEndAt(next)) {
        continue;
      }
      cameFrom.set(nextKey, current);
      distances.set(nextKey, (distances.get(currentKey) ?? 0) + 1);
      queue.push(next);
    }
  }

  return paths.sort((a, b) => comparePaths(a, b, distances));
}

function reconstructPath(cameFrom: ReadonlyMap<string, Cell>, goal: Cell): readonly Cell[] {
  const path: Cell[] = [];
  let current = goal;
  while (!sameCell(cameFrom.get(cellKey(current)) ?? current, current)) {
    path.unshift(current);
    current = cameFrom.get(cellKey(current))!;
  }
  return path;
}

function comparePaths(
  a: readonly Cell[],
  b: readonly Cell[],
  distances: ReadonlyMap<string, number>,
): number {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  const aGoal = a[a.length - 1]!;
  const bGoal = b[b.length - 1]!;
  if (aGoal.y !== bGoal.y) {
    return aGoal.y - bGoal.y;
  }
  if (aGoal.x !== bGoal.x) {
    return aGoal.x - bGoal.x;
  }
  const aFirst = a[0]!;
  const bFirst = b[0]!;
  if (aFirst.y !== bFirst.y) {
    return aFirst.y - bFirst.y;
  }
  if (aFirst.x !== bFirst.x) {
    return aFirst.x - bFirst.x;
  }
  return (distances.get(cellKey(aGoal)) ?? 0) - (distances.get(cellKey(bGoal)) ?? 0);
}

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}
