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
import type { AttackResolutionTransaction } from "../../world/world";
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

/**
 * Charge origin cells for one player-distance, in every cardinal direction, farthest
 * distance first — the longest available run-up wins, tried before any shorter one.
 */
function chargeOriginCellsByDistance(playerCell: Cell, maxRange: number): readonly (readonly Cell[])[] {
  const tiers: Cell[][] = [];
  for (let distance = maxRange; distance >= CHARGE_MIN_RANGE; distance -= 1) {
    tiers.push(
      CARDINAL_DIRECTIONS.map((direction) => ({
        x: playerCell.x + direction.x * distance,
        y: playerCell.y + direction.y * distance,
      })),
    );
  }
  return tiers;
}

function chargeMovementCandidates(
  enemy: EntityState,
  playerCell: Cell,
  tuning: ChargeEnemyTuning,
  context: EnemyDecisionContext,
): readonly EnemyMovementCandidate[] {
  const findPaths = (goals: readonly Cell[]) =>
    findEnemyPaths({
      start: enemy.cell,
      goals: goals.filter(context.canEndAt),
      canPathThrough: (cell) => context.isInside(cell) && context.canPathThrough(cell),
      canEndAt: context.canEndAt,
    });

  let paths: readonly (readonly Cell[])[] = [];
  for (const tier of chargeOriginCellsByDistance(playerCell, tuning.maxRange)) {
    paths = findPaths(tier);
    if (paths.length > 0) {
      break;
    }
  }

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
 * The Charge detonation policy: one alternating side-push pass over the entire path,
 * including the final cell — nothing is ever knocked forward. The final-cell occupant
 * always takes the attack's damage, doubled and left in place when both sides are
 * blocked; the charger's own landing follows that same push or blocked fallback.
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
  const direction = enemy.facing ?? { x: 1, y: 0 };
  const right = { x: -direction.y, y: direction.x };
  const left = { x: direction.y, y: -direction.x };

  const displacements: ChargeDisplacementResult[] = [];
  let impact: ChargeImpactResult = { cell: { ...targetCell }, outcome: "empty" };
  let landingCell: Cell = { ...targetCell };

  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index]!;
    const occupant = transaction.livingOccupantAt(cell);
    if (!occupant) {
      continue;
    }
    const isTarget = index === path.length - 1;

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
      if (isTarget) {
        transaction.stageDamage(occupant.id, attack.damage);
        impact = { targetId: occupant.id, cell: { ...targetCell }, outcome: "normal" };
      }
    } else if (isTarget) {
      transaction.stageDamage(occupant.id, attack.damage * 2);
      impact = { targetId: occupant.id, cell: { ...targetCell }, outcome: "blocked" };
      let fallback: Cell | undefined;
      for (let scan = index - 1; scan >= 0; scan -= 1) {
        const candidate = path[scan]!;
        if (transaction.isFree(candidate)) {
          fallback = candidate;
          break;
        }
      }
      landingCell = fallback ? { ...fallback } : origin;
    } else {
      transaction.stageDamage(occupant.id, attack.damage);
      displacements.push({ entityId: occupant.id, from: { ...occupant.cell }, blocked: true });
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

/**
 * Cancels the windup of every entity this detonation actually displaced (the pushed
 * final-cell target included, via the same `displacements` entries as the side pushes).
 * A blocked-in-place occupant took damage but never moved, so it keeps its windup by
 * design. `interruptDisplacedEnemy` self-guards the player and non-enemies, so no
 * entity-kind filtering is needed here.
 */
function chargeInterruptEvents(
  context: EnemyPhaseContext,
  displacements: readonly ChargeDisplacementResult[],
): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (const displacement of displacements) {
    if (!displacement.to) {
      continue;
    }
    const interrupt = context.combat.interruptDisplacedEnemy(displacement.entityId);
    if (!interrupt.changed) {
      continue;
    }
    if (interrupt.hadCommittedAttack || interrupt.hadTelegraph) {
      events.push({ type: "enemy_attack_interrupted", enemyId: displacement.entityId });
    }
    if (interrupt.hadTelegraph) {
      events.push({ type: "telegraph_changed", sourceId: displacement.entityId, cleared: true });
    }
    events.push({
      type: "enemy_recovering",
      enemyId: displacement.entityId,
      recoveryTicks: interrupt.recoveryTicks,
    });
  }
  return events;
}

function chargeResolutionEvents(
  context: EnemyPhaseContext,
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
      events.push(...damageEventsFor(context, enemyId, displacement.entityId, displacement.damage));
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
      events.push(...damageEventsFor(context, enemyId, resolution.impact.targetId, resolution.impact.damage));
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

  events.push(...chargeInterruptEvents(context, resolution.displacements));

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

/**
 * True when some other charge enemy's committed attack already ends on this cell. A charge
 * always ends on the Player's cell, so this is how two chargers serialize instead of both
 * telegraphing onto the same cell. Stale claims (the other charger's Player-cell target moved,
 * or it could no longer retarget) simply compare unequal.
 */
function chargeCellClaimed(cell: Cell, otherCommittedAttacks: readonly CommittedAttack[]): boolean {
  return otherCommittedAttacks.some((attack) => {
    if (attack.role !== "charge") {
      return false;
    }
    const finalCell = attack.cells[attack.cells.length - 1];
    return finalCell !== undefined && sameCell(finalCell, cell);
  });
}

/** Cardinal line-rush behavior: commits when a legal, unclaimed range path exists, otherwise repositions. */
export const chargeEnemyBehavior: EnemyBehavior = {
  retarget(context, enemy) {
    const retarget = chargeLiveRetarget(enemy, context.playerCell, (cell) => context.board.isLegalCell(cell));
    if (!retarget) {
      return [];
    }
    const finalCell = retarget.path[retarget.path.length - 1]!;
    const otherCommittedAttacks = context
      .listEntities()
      .filter((other) => other.id !== enemy.id && other.committedAttack)
      .map((other) => other.committedAttack!);
    if (chargeCellClaimed(finalCell, otherCommittedAttacks)) {
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
    if (rangePath && !chargeCellClaimed(rangePath.path[rangePath.path.length - 1]!, context.otherCommittedAttacks)) {
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
