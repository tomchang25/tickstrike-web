import {
  cardinalDirection,
  cardinalLineDirection,
  manhattanDistance,
  sameCell,
  type Cell,
  type ChargeEnemyTuning,
  type CommittedAttack,
  type DamageResult,
  type EntityId,
  type EntityState,
  type EnemyMovementCandidate,
} from "../../model/types";
import type { CombatEvent } from "../../events/combat-events";
import type { AttackResolutionTransaction, WorldView } from "../../world/world";
import { findEnemyPaths } from "../enemy-path-planner";
import { CARDINAL_DIRECTIONS } from "../attack-geometry";
import { damageEventsFor } from "../attack-resolution-events";
import type { EnemyBehavior, EnemyDecisionContext, EnemyPhaseContext } from "../enemy-behavior";

export interface ChargeDisplacementResult {
  readonly entityId: EntityId;
  readonly from: Cell;
  /** Present when the entity accepted a sideways push; absent when it was blocked in place. */
  readonly to?: Cell;
  readonly blocked: boolean;
  readonly damage?: DamageResult;
}

export interface ChargeImpactResult {
  readonly targetId?: EntityId;
  readonly cell: Cell;
  readonly outcome: "empty" | "normal" | "blocked";
  readonly from?: Cell;
  readonly to?: Cell;
  readonly damage?: DamageResult;
}

export interface ChargeAttackResolution {
  readonly attack: CommittedAttack;
  readonly displacements: readonly ChargeDisplacementResult[];
  readonly impact: ChargeImpactResult;
  readonly landing: { readonly from: Cell; readonly to: Cell };
}

/** Single source of the Charge range policy; tuning only authors `maxRange`. */
export const CHARGE_MIN_RANGE = 1;
export const CHARGE_PREFERRED_MIN_RANGE = 2;

export interface ChargeRangePath {
  /** Cells from the cell immediately in front of the origin through the target cell, inclusive. */
  readonly path: readonly Cell[];
  readonly facing: Cell;
}

/** A legal Charge range path is cardinal, one to `maxRange` cells away, and entirely legal terrain. */
export function chargeRangePath(
  origin: Cell,
  playerCell: Cell,
  maxRange: number,
  isLegalTerrain: (cell: Cell) => boolean,
): ChargeRangePath | undefined {
  const direction = cardinalLineDirection(origin, playerCell);
  if (!direction) {
    return undefined;
  }
  const distance = manhattanDistance(origin, playerCell);
  if (distance < CHARGE_MIN_RANGE || distance > maxRange) {
    return undefined;
  }

  const path: Cell[] = [];
  for (let step = 1; step <= distance; step += 1) {
    const cell = { x: origin.x + direction.x * step, y: origin.y + direction.y * step };
    if (!isLegalTerrain(cell)) {
      return undefined;
    }
    path.push(cell);
  }
  return { path, facing: direction };
}

/** Live warning-time retarget: only refreshes the range path when the Player remains ahead of Charge. */
export function chargeLiveRetarget(
  enemy: EntityState,
  playerCell: Cell | undefined,
  isLegalTerrain: (cell: Cell) => boolean,
): ChargeRangePath | undefined {
  const tuning = enemy.enemyAction?.chargeTuning;
  if (!tuning || !playerCell) {
    return undefined;
  }
  const path = chargeRangePath(enemy.cell, playerCell, tuning.maxRange, isLegalTerrain);
  const facing = enemy.facing && cardinalDirection(enemy.facing);
  return path && facing && sameCell(path.facing, facing) ? path : undefined;
}

function chargeOriginCells(playerCell: Cell, maxRange: number): { primary: Cell[]; fallback: Cell[] } {
  const primary: Cell[] = [];
  const fallback: Cell[] = [];
  for (const direction of CARDINAL_DIRECTIONS) {
    for (let distance = CHARGE_MIN_RANGE; distance <= maxRange; distance += 1) {
      const cell = {
        x: playerCell.x + direction.x * distance,
        y: playerCell.y + direction.y * distance,
      };
      (distance >= CHARGE_PREFERRED_MIN_RANGE ? primary : fallback).push(cell);
    }
  }
  return { primary, fallback };
}

function chargeMovementCandidates(
  enemy: EntityState,
  playerCell: Cell,
  tuning: ChargeEnemyTuning,
  context: EnemyDecisionContext,
): readonly EnemyMovementCandidate[] {
  const { primary, fallback } = chargeOriginCells(playerCell, tuning.maxRange);
  const findPaths = (goals: readonly Cell[]) =>
    findEnemyPaths({
      start: enemy.cell,
      goals: goals.filter(context.canEndAt),
      canPathThrough: (cell) => context.isInside(cell) && context.canPathThrough(cell),
      canEndAt: context.canEndAt,
    });
  const primaryPaths = findPaths(primary);
  const paths = primaryPaths.length > 0 ? primaryPaths : findPaths(fallback);
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

/**
 * The Charge detonation policy: alternating side displacement for non-target path
 * occupants, target knockback or blocked double damage, and Charge's own landing.
 * Runs entirely against the transaction's staged view, then commits once.
 */
function chargeDetonationPolicy(transaction: AttackResolutionTransaction): ChargeAttackResolution | undefined {
  const { enemy, attack } = transaction;
  const origin = { x: enemy.cell.x, y: enemy.cell.y };
  const path = attack.cells;
  if (path.length === 0) {
    return undefined;
  }
  const targetCell = path[path.length - 1]!;
  const sidePath = path.slice(0, -1);
  const direction = enemy.facing ?? { x: 1, y: 0 };
  const right = { x: -direction.y, y: direction.x };
  const left = { x: direction.y, y: -direction.x };

  const displacements: ChargeDisplacementResult[] = [];

  for (let index = 0; index < sidePath.length; index += 1) {
    const cell = sidePath[index]!;
    const occupant = transaction.livingOccupantAt(cell);
    if (!occupant) {
      continue;
    }

    const rightFirst = index % 2 === 0;
    const primary = rightFirst ? right : left;
    const secondary = rightFirst ? left : right;
    const primaryDestination = { x: cell.x + primary.x, y: cell.y + primary.y };
    const secondaryDestination = { x: cell.x + secondary.x, y: cell.y + secondary.y };
    const destination = transaction.isFree(primaryDestination)
      ? primaryDestination
      : transaction.isFree(secondaryDestination)
        ? secondaryDestination
        : undefined;

    if (destination) {
      transaction.stageMove(occupant.id, destination);
      displacements.push({
        entityId: occupant.id,
        from: { ...occupant.cell },
        to: { ...destination },
        blocked: false,
      });
    } else {
      transaction.stageDamage(occupant.id, attack.damage);
      displacements.push({ entityId: occupant.id, from: { ...occupant.cell }, blocked: true });
    }
  }

  const targetOccupant = transaction.livingOccupantAt(targetCell);
  let impact: ChargeImpactResult;
  let landingCell: Cell;

  if (!targetOccupant) {
    impact = { cell: { ...targetCell }, outcome: "empty" };
    landingCell = { ...targetCell };
  } else {
    const forwardDestination = { x: targetCell.x + direction.x, y: targetCell.y + direction.y };
    if (transaction.isFree(forwardDestination)) {
      transaction.stageMove(targetOccupant.id, forwardDestination);
      transaction.stageDamage(targetOccupant.id, attack.damage);
      impact = {
        targetId: targetOccupant.id,
        cell: { ...targetCell },
        outcome: "normal",
        from: { ...targetCell },
        to: { ...forwardDestination },
      };
      landingCell = { ...targetCell };
    } else {
      transaction.stageDamage(targetOccupant.id, attack.damage * 2);
      impact = { targetId: targetOccupant.id, cell: { ...targetCell }, outcome: "blocked" };
      let fallback: Cell | undefined;
      for (let index = sidePath.length - 1; index >= 0; index -= 1) {
        const candidate = sidePath[index]!;
        if (transaction.isFree(candidate)) {
          fallback = candidate;
          break;
        }
      }
      landingCell = fallback ? { ...fallback } : origin;
    }
  }

  transaction.stageLanding(landingCell);
  const { damageResults } = transaction.commit();

  const resolvedDisplacements = displacements.map((displacement) =>
    displacement.blocked ? { ...displacement, damage: damageResults.get(displacement.entityId) } : displacement,
  );
  const resolvedImpact: ChargeImpactResult = impact.targetId
    ? { ...impact, damage: damageResults.get(impact.targetId) }
    : impact;

  return {
    attack,
    displacements: resolvedDisplacements,
    impact: resolvedImpact,
    landing: { from: origin, to: { ...landingCell } },
  };
}

/** Resolves a detonating Charge attack atomically; undefined when the enemy is not telegraphing. */
export function resolveChargeAttack(context: EnemyPhaseContext, id: EntityId): ChargeAttackResolution | undefined {
  return context.resolveCommittedAttackTransaction(id, chargeDetonationPolicy);
}

function chargeResolutionEvents(
  world: WorldView,
  enemyId: EntityId,
  resolution: ChargeAttackResolution,
): CombatEvent[] {
  const events: CombatEvent[] = [
    {
      type: "enemy_attack_detonated",
      enemyId,
      attack: resolution.attack,
      target: resolution.impact.cell,
    },
  ];

  for (const displacement of resolution.displacements) {
    if (displacement.blocked && displacement.damage) {
      events.push(...damageEventsFor(world, enemyId, displacement.entityId, displacement.damage));
    }
  }

  if (resolution.impact.targetId) {
    events.push({
      type: "charge_impact",
      enemyId,
      targetId: resolution.impact.targetId,
      cell: resolution.impact.cell,
      outcome: resolution.impact.outcome,
    });
    if (resolution.impact.damage) {
      events.push(...damageEventsFor(world, enemyId, resolution.impact.targetId, resolution.impact.damage));
    }
  } else {
    events.push({ type: "charge_impact", enemyId, cell: resolution.impact.cell, outcome: "empty" });
  }

  for (const displacement of resolution.displacements) {
    if (!displacement.blocked && displacement.to) {
      events.push({
        type: "entity_displaced",
        entityId: displacement.entityId,
        from: displacement.from,
        to: displacement.to,
        cause: "charge_side_push",
      });
    }
  }
  if (resolution.impact.outcome === "normal" && resolution.impact.targetId && resolution.impact.to) {
    events.push({
      type: "entity_displaced",
      entityId: resolution.impact.targetId,
      from: resolution.impact.from!,
      to: resolution.impact.to,
      cause: "charge_target_knockback",
    });
  }

  events.push({
    type: "charge_landed",
    enemyId,
    from: resolution.landing.from,
    to: resolution.landing.to,
  });
  events.push({ type: "telegraph_changed", sourceId: enemyId, cleared: true });
  events.push({
    type: "enemy_recovering",
    enemyId,
    recoveryTicks: resolution.attack.recoveryTicks,
  });
  return events;
}

/** Cardinal line-rush behavior: commits when a legal range path exists, otherwise repositions. */
export const chargeEnemyBehavior: EnemyBehavior = {
  retarget(context, enemy) {
    const retarget = chargeLiveRetarget(enemy, context.playerCell, (cell) => context.board.isLegalCell(cell));
    if (!retarget) {
      return [];
    }
    const result = context.combat.retargetCommittedAttack(enemy.id, retarget.path, retarget.facing);
    if (result.changed && result.telegraph) {
      return [
        {
          type: "telegraph_changed",
          sourceId: enemy.id,
          telegraph: result.telegraph,
          cleared: false,
        },
      ];
    }
    return [];
  },
  resolveAttack(context, enemyId) {
    const resolution = resolveChargeAttack(context, enemyId);
    return resolution ? chargeResolutionEvents(context, enemyId, resolution) : undefined;
  },
  decide(context, action, playerCell) {
    const { enemy } = context;
    const tuning = action.chargeTuning;
    if (!tuning) {
      return { type: "wait" };
    }
    const rangePath = chargeRangePath(enemy.cell, playerCell, tuning.maxRange, context.isLegalTerrain);
    if (rangePath) {
      return {
        type: "attack",
        attack: action,
        cells: rangePath.path,
        facing: rangePath.facing,
      };
    }

    const candidates = chargeMovementCandidates(enemy, playerCell, tuning, context).filter((candidate) =>
      context.canMove(candidate.destination),
    );
    return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
  },
};
