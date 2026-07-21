import {
  manhattanDistance,
  sameCell,
  cardinalDirection,
  type Cell,
  type EnemyActionDefinition,
  type EntityState,
  type EnemyMovementCandidate,
} from "../../model/types";
import { CARDINAL_DIRECTIONS, rotatedAttackCells } from "../attack-geometry";
import type { EnemyBehavior, EnemyDecisionContext } from "../enemy-behavior";

function rangedFacing(enemy: EntityState): Cell {
  return cardinalDirection(enemy.facing ?? CARDINAL_DIRECTIONS[0]!) ?? CARDINAL_DIRECTIONS[0]!;
}

export function rangedAttackCells(
  targetCenter: Cell,
  facing: Cell,
  action: EnemyActionDefinition,
  isInside: (cell: Cell) => boolean,
): readonly Cell[] {
  return rotatedAttackCells(targetCenter, facing, action.offsets).filter(isInside);
}

function rangedMovementCandidates(
  enemy: EntityState,
  playerCell: Cell,
  action: EnemyActionDefinition,
  context: EnemyDecisionContext,
): readonly EnemyMovementCandidate[] {
  const tuning = action.rangedTuning;
  if (!tuning || tuning.minDistance > tuning.maxDistance) {
    return [];
  }

  const distance = manhattanDistance(enemy.cell, playerCell);
  if (distance >= tuning.minDistance && distance <= tuning.maxDistance) {
    return [];
  }
  const movesTowardBand = distance > tuning.maxDistance;
  const improves = (nextDistance: number) => (movesTowardBand ? nextDistance < distance : nextDistance > distance);
  const boundaryDistance = (nextDistance: number) =>
    Math.min(Math.abs(nextDistance - tuning.minDistance), Math.abs(nextDistance - tuning.maxDistance));

  return CARDINAL_DIRECTIONS.map((direction) => ({
    destination: { x: enemy.cell.x + direction.x, y: enemy.cell.y + direction.y },
    facing: direction,
  }))
    .filter(({ destination }) => context.isInside(destination))
    .filter(({ destination }) => !sameCell(destination, playerCell))
    .map(({ destination, facing }) => ({
      destination,
      facing,
      distance: manhattanDistance(destination, playerCell),
    }))
    .filter(
      ({ destination, distance: nextDistance }) =>
        context.canEndAt(destination) && context.canMove(destination) && improves(nextDistance),
    )
    .sort((a, b) => {
      const boundaryResult = boundaryDistance(a.distance) - boundaryDistance(b.distance);
      if (boundaryResult !== 0) {
        return boundaryResult;
      }
      if (a.destination.y !== b.destination.y) {
        return a.destination.y - b.destination.y;
      }
      return a.destination.x - b.destination.x;
    })
    .map(({ destination, facing }) => ({
      destination,
      path: [destination],
      goal: destination,
      facing,
    }));
}

/** Distance-band behavior: attacks inside the authored band, otherwise steps toward it. */
export const rangedEnemyBehavior: EnemyBehavior = {
  restsAfterMove: true,
  decide(context, action, playerCell) {
    const { enemy } = context;
    const distance = manhattanDistance(enemy.cell, playerCell);
    const tuning = action.rangedTuning;
    if (!tuning || tuning.minDistance > tuning.maxDistance) {
      return { type: "wait" };
    }
    if (distance >= tuning.minDistance && distance <= tuning.maxDistance) {
      return {
        type: "attack",
        attack: action,
        cells: rangedAttackCells(playerCell, rangedFacing(enemy), action, context.isInside),
        facing: rangedFacing(enemy),
        metadata: {
          ...action.metadata,
          targetCenter: { x: playerCell.x, y: playerCell.y },
        },
      };
    }

    const candidates = rangedMovementCandidates(enemy, playerCell, action, context);
    return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
  },
};
