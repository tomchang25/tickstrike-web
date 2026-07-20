import type { Cell } from "../model/types";

/** The readonly world-view the scheduler and planner consume; Child C backs this with `World`. */
export interface WaveWorldView {
  readonly width: number;
  readonly height: number;
  readonly playerCell: Cell;
  readonly livingEnemyCount: number;
  isArenaLegal(cell: Cell): boolean;
  isOccupied(cell: Cell): boolean;
  isReserved(cell: Cell): boolean;
}

/** Returns a float in [0, 1); the only randomness these modules may consume. */
export type RandomUnitSource = () => number;
