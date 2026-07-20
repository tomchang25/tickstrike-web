import {
  sameCell,
  type Cell,
  type EnemyActionDefinition,
  type EntityState,
  type EnemyMovementCandidate,
} from "../../model/types";
import { findEnemyPaths } from "../enemy-path-planner";
import {
  attackOriginCellsFromShape,
  CARDINAL_DIRECTIONS,
  rotatedAttackCells,
} from "../attack-geometry";
import type { EnemyBehavior, EnemyDecisionContext } from "../enemy-behavior";

function attackFacing(
  enemy: EntityState,
  playerCell: Cell,
  action: EnemyActionDefinition,
  preferred: Cell,
): Cell | undefined {
  const candidates = [enemy.facing ?? preferred, preferred, ...CARDINAL_DIRECTIONS];
  return candidates.find((facing, index) => {
    if (candidates.findIndex((candidate) => sameCell(candidate, facing)) !== index) {
      return false;
    }
    return rotatedAttackCells(enemy.cell, facing, action.offsets).some((cell) =>
      sameCell(cell, playerCell),
    );
  });
}

function movementCandidates(
  enemy: EntityState,
  playerCell: Cell,
  action: EnemyActionDefinition,
  context: EnemyDecisionContext,
): readonly EnemyMovementCandidate[] {
  const origins = attackOriginCellsFromShape(playerCell, action).filter(context.canEndAt);
  const approachGoals = CARDINAL_DIRECTIONS.map((direction) => ({
    x: playerCell.x + direction.x,
    y: playerCell.y + direction.y,
  })).filter(context.canEndAt);
  const findPaths = (goals: readonly Cell[]) =>
    findEnemyPaths({
      start: enemy.cell,
      goals,
      canPathThrough: (cell) => context.isInside(cell) && context.canPathThrough(cell),
      canEndAt: context.canEndAt,
    });
  const paths = origins.length > 0 ? findPaths(origins) : [];
  const fallbackPaths = paths.length > 0 ? paths : findPaths(approachGoals);
  return fallbackPaths.map((path) => {
    const destination = path[0]!;
    const goal = path[path.length - 1]!;
    return {
      destination,
      path,
      goal,
      facing: { x: destination.x - enemy.cell.x, y: destination.y - enemy.cell.y },
    };
  });
}

/** Adjacent-shape melee behavior shared by the Thrust and Slash roles. */
export const meleeEnemyBehavior: EnemyBehavior = {
  decide(context, action, playerCell) {
    const { enemy } = context;
    const attackDirection = attackFacing(
      enemy,
      playerCell,
      action,
      enemy.facing ?? CARDINAL_DIRECTIONS[0]!,
    );
    if (attackDirection) {
      return {
        type: "attack",
        attack: action,
        cells: rotatedAttackCells(enemy.cell, attackDirection, action.offsets),
        facing: attackDirection,
      };
    }

    const candidates = movementCandidates(enemy, playerCell, action, context).filter((candidate) =>
      context.canMove(candidate.destination),
    );
    return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
  },
};
