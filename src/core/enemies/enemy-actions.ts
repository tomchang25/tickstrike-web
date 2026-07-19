import {
  addCells,
  cardinalDirection,
  cardinalLineDirection,
  chebyshevDistance,
  directionBetween,
  manhattanDistance,
  sameCell,
  type ChargeEnemyTuning,
  type EnemyActionDefinition,
  type Cell,
  type EntityState,
  type EnemyMovementCandidate,
} from "../model/types";
import { findEnemyPaths } from "./enemy-path-planner";

export type EnemyActionDecision =
  | { readonly type: "move"; readonly candidates: readonly EnemyMovementCandidate[] }
  | {
      readonly type: "attack";
      readonly attack: EnemyActionDefinition;
      readonly cells: readonly Cell[];
      readonly facing: Cell;
      readonly metadata?: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "wait" };

export interface EnemyDecisionContext {
  readonly enemy: EntityState;
  readonly playerCell?: Cell;
  isInside(cell: Cell): boolean;
  canMove(destination: Cell): boolean;
  canPathThrough(cell: Cell): boolean;
  canEndAt(cell: Cell): boolean;
  /** Terrain-only legality, ignoring occupancy and the live Player position. Used by Charge range/path checks. */
  isLegalTerrain(cell: Cell): boolean;
}

/** Rotates a local offset where x is forward and y is lateral into world space. */
export function rotateLocalOffset(offset: Cell, facing: Cell): Cell {
  const direction = cardinalDirection(facing);
  if (!direction) {
    throw new Error("Basic enemy facing must be cardinal.");
  }
  const lateral = { x: -direction.y, y: direction.x };
  return {
    x: direction.x * offset.x + lateral.x * offset.y,
    y: direction.y * offset.x + lateral.y * offset.y,
  };
}

export function rotatedAttackCells(
  origin: Cell,
  facing: Cell,
  offsets: readonly Cell[],
): readonly Cell[] {
  const cells = offsets.map((offset) => addCells(origin, rotateLocalOffset(offset, facing)));
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const CARDINAL_DIRECTIONS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

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
  const improves = (nextDistance: number) =>
    movesTowardBand ? nextDistance < distance : nextDistance > distance;
  const boundaryDistance = (nextDistance: number) =>
    Math.min(
      Math.abs(nextDistance - tuning.minDistance),
      Math.abs(nextDistance - tuning.maxDistance),
    );

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

export function attackOriginCellsFromShape(
  target: Cell,
  action: EnemyActionDefinition,
): readonly Cell[] {
  const origins: Cell[] = [];
  for (const facing of CARDINAL_DIRECTIONS) {
    for (const offset of action.offsets) {
      const rotated = rotateLocalOffset(offset, facing);
      const origin = { x: target.x - rotated.x, y: target.y - rotated.y };
      if (!origins.some((candidate) => sameCell(candidate, origin))) {
        origins.push(origin);
      }
    }
  }
  return origins;
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

const CHARGE_MIN_RANGE = 1;
const CHARGE_PREFERRED_MIN_RANGE = 2;

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

function chargeOriginCells(
  playerCell: Cell,
  maxRange: number,
): { primary: Cell[]; fallback: Cell[] } {
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

export function decideEnemyAction(context: EnemyDecisionContext): EnemyActionDecision {
  const { enemy, playerCell } = context;
  const action = enemy.enemyAction;
  if (!action || enemy.phase !== "alive" || enemy.activity !== "ready" || !playerCell) {
    return { type: "wait" };
  }

  if (action.role === "ranged") {
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
  }

  if (action.role === "charge") {
    const tuning = action.chargeTuning;
    if (!tuning) {
      return { type: "wait" };
    }
    const rangePath = chargeRangePath(
      enemy.cell,
      playerCell,
      tuning.maxRange,
      context.isLegalTerrain,
    );
    if (rangePath) {
      return {
        type: "attack",
        attack: action,
        cells: rangePath.path,
        facing: rangePath.facing,
      };
    }

    const candidates = chargeMovementCandidates(enemy, playerCell, tuning, context).filter(
      (candidate) => context.canMove(candidate.destination),
    );
    return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
  }

  if (action.role === "bomb") {
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
  }

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
}

export function committedAttackFromDecision(
  decision: Extract<EnemyActionDecision, { type: "attack" }>,
): {
  readonly attackId: string;
  readonly role: string;
  readonly kind?: string;
  readonly cells: readonly Cell[];
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  return {
    attackId: decision.attack.attackId,
    role: decision.attack.role,
    ...(decision.attack.kind ? { kind: decision.attack.kind } : {}),
    cells: decision.cells,
    damage: decision.attack.damage,
    warningTicks: decision.attack.warningTicks,
    recoveryTicks: decision.attack.recoveryTicks,
    ...(decision.metadata || decision.attack.metadata
      ? { metadata: decision.metadata ?? decision.attack.metadata }
      : {}),
  };
}

export function directionToPlayer(enemy: EntityState, playerCell?: Cell): Cell | undefined {
  return playerCell ? directionBetween(enemy.cell, playerCell) : undefined;
}
