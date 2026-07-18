import type { Cell } from "../../core/model/types";
import { cellKey, sameCell } from "../../core/model/types";

export interface TelegraphLabelSource {
  readonly cells: readonly Cell[];
  readonly ticks: number;
}

export interface TelegraphLabelEntry {
  readonly ticks: number;
  readonly count: number;
}

export interface TelegraphCellSummary {
  readonly cell: Cell;
  readonly entries: readonly TelegraphLabelEntry[];
}

export interface TelegraphLabelPlacement extends TelegraphLabelEntry {
  readonly cell: Cell;
  readonly primary: boolean;
  readonly offset: Cell;
}

const CORNER_OFFSETS: readonly Cell[] = [
  { x: -0.3, y: -0.3 },
  { x: 0.3, y: -0.3 },
  { x: 0.3, y: 0.3 },
  { x: -0.3, y: 0.3 },
];

export function aggregateTelegraphLabels(
  sources: readonly TelegraphLabelSource[],
): readonly TelegraphCellSummary[] {
  const cells = new Map<string, { readonly cell: Cell; readonly counts: Map<number, number> }>();

  for (const source of sources) {
    if (!Number.isFinite(source.ticks) || source.ticks <= 0) continue;
    const seenCells = new Set<string>();
    for (const cell of source.cells) {
      const key = cellKey(cell);
      if (seenCells.has(key)) continue;
      seenCells.add(key);

      let summary = cells.get(key);
      if (!summary) {
        summary = { cell, counts: new Map<number, number>() };
        cells.set(key, summary);
      }
      summary.counts.set(source.ticks, (summary.counts.get(source.ticks) ?? 0) + 1);
    }
  }

  return [...cells.values()].map(({ cell, counts }) => ({
    cell,
    entries: [...counts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([ticks, count]) => ({ ticks, count })),
  }));
}

export function placeTelegraphLabels(
  summaries: readonly TelegraphCellSummary[],
  occupiedCells: readonly Cell[],
): readonly TelegraphLabelPlacement[] {
  const placements: TelegraphLabelPlacement[] = [];

  for (const summary of summaries) {
    const occupied = occupiedCells.some((cell) => sameCell(cell, summary.cell));
    const [earliest, ...later] = summary.entries;
    if (!earliest) continue;

    placements.push({
      ...earliest,
      cell: summary.cell,
      primary: true,
      offset: occupied ? { x: 0, y: -0.43 } : { x: 0, y: 0 },
    });

    later.slice(0, CORNER_OFFSETS.length).forEach((entry, index) => {
      const offset = CORNER_OFFSETS[index];
      if (!offset) return;
      placements.push({
        ...entry,
        cell: summary.cell,
        primary: false,
        offset,
      });
    });
  }

  return placements;
}

export function formatTelegraphMultiplier(count: number): string | undefined {
  return count > 1 ? `x${count}` : undefined;
}
