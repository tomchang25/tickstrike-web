import {
  addCells,
  chebyshevDistance,
  type Cell,
  type EnemyActionDefinition,
  type EntityState,
  type EnemyMovementCandidate,
} from "../../model/types";
import { findEnemyPaths } from "../enemy-path-planner";
import { CARDINAL_DIRECTIONS } from "../attack-geometry";
import { committedAttackDetonationEvents } from "../attack-resolution-events";
import type { EnemyBehavior, EnemyDecisionContext } from "../enemy-behavior";

function bombOriginCells(playerCell: Cell): Cell[] {
  const origins: Cell[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      origins.push({ x: playerCell.x + dx, y: playerCell.y + dy });
    }
  }
  return origins;
}

function bombMovementCandidates(
  enemy: EntityState,
  playerCell: Cell,
  context: EnemyDecisionContext,
): readonly EnemyMovementCandidate[] {
  const origins = bombOriginCells(playerCell).filter(context.canEndAt);
  const paths = findEnemyPaths({
    start: enemy.cell,
    goals: origins,
    canPathThrough: (cell) => context.isInside(cell) && context.canPathThrough(cell),
    canEndAt: context.canEndAt,
  });
  return paths.map((path) => {
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

/** Bomb's radius-four Manhattan footprint, self-centered on its own commit cell. */
export function bombAreaCells(
  center: Cell,
  action: EnemyActionDefinition,
  isInside: (cell: Cell) => boolean,
): readonly Cell[] {
  const cells = action.offsets.map((offset) => addCells(center, offset));
  const seen = new Set<string>();
  return cells.filter((cell) => {
    if (!isInside(cell)) {
      return false;
    }
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Fuse behavior: locks a self-centered blast when adjacent, otherwise closes in. */
export const bombEnemyBehavior: EnemyBehavior = {
  resolveAttack(context, enemyId, telegraph) {
    const current = context.getEntity(enemyId);
    const resolution = context.combat.resolveCommittedEnemyAttack(enemyId);
    if (!resolution || !current) {
      return undefined;
    }
    const events = committedAttackDetonationEvents(context, enemyId, resolution);
    if (resolution.attack.metadata?.selfDestruct) {
      events.push({ type: "enemy_self_destructed", enemyId, cell: current.cell });
      events.push({ type: "enemy_died", enemyId, attackerId: enemyId, cell: current.cell });
    } else {
      events.push({ type: "telegraph_changed", sourceId: enemyId, telegraph, cleared: true });
      events.push({
        type: "enemy_recovering",
        enemyId,
        recoveryTicks: resolution.attack.recoveryTicks,
      });
    }
    return events;
  },
  decide(context, action, playerCell) {
    const { enemy } = context;
    if (chebyshevDistance(enemy.cell, playerCell) === 1) {
      return {
        type: "attack",
        attack: action,
        cells: bombAreaCells(enemy.cell, action, context.isInside),
        facing: enemy.facing ?? CARDINAL_DIRECTIONS[0]!,
        metadata: {
          ...action.metadata,
          center: { x: enemy.cell.x, y: enemy.cell.y },
          selfDestruct: true,
        },
      };
    }

    const candidates = bombMovementCandidates(enemy, playerCell, context).filter((candidate) =>
      context.canMove(candidate.destination),
    );
    return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
  },
};
