import {
  addCells,
  cardinalDirection,
  directionBetween,
  sameCell,
  type EnemyActionDefinition,
  type Cell,
  type EntityState,
  type EnemyMovementCandidate,
} from "../model/types";
import { findEnemyPaths } from "./enemy-path-planner";

export type EnemyDecision =
  | { readonly type: "move"; readonly candidates: readonly EnemyMovementCandidate[] }
  | {
      readonly type: "attack";
      readonly attack: EnemyActionDefinition;
      readonly cells: readonly Cell[];
      readonly facing: Cell;
    }
  | { readonly type: "wait" };

export interface EnemyDecisionContext {
  readonly enemy: EntityState;
  readonly playerCell?: Cell;
  isInside(cell: Cell): boolean;
  canMove(destination: Cell): boolean;
  canPathThrough(cell: Cell): boolean;
  canEndAt(cell: Cell): boolean;
}

/** Rotates a local offset where x is forward and y is lateral into world space. */
export function rotateLocalOffset(offset: Cell, facing: Cell): Cell {
  const direction = cardinalDirection(facing);
  if (!direction) throw new Error("Basic enemy facing must be cardinal.");
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
    if (seen.has(key)) return false;
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

function attackFacing(
  enemy: EntityState,
  playerCell: Cell,
  action: EnemyActionDefinition,
  preferred: Cell,
): Cell | undefined {
  const candidates = [enemy.facing ?? preferred, preferred, ...CARDINAL_DIRECTIONS];
  return candidates.find((facing, index) => {
    if (candidates.findIndex((candidate) => sameCell(candidate, facing)) !== index) return false;
    return rotatedAttackCells(enemy.cell, facing, action.offsets).some((cell) => sameCell(cell, playerCell));
  });
}

export function attackOriginCellsFromShape(target: Cell, action: EnemyActionDefinition): readonly Cell[] {
  const origins: Cell[] = [];
  for (const facing of CARDINAL_DIRECTIONS) {
    for (const offset of action.offsets) {
      const rotated = rotateLocalOffset(offset, facing);
      const origin = { x: target.x - rotated.x, y: target.y - rotated.y };
      if (!origins.some((candidate) => sameCell(candidate, origin))) origins.push(origin);
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
  const approachGoals = CARDINAL_DIRECTIONS
    .map((direction) => ({ x: playerCell.x + direction.x, y: playerCell.y + direction.y }))
    .filter(context.canEndAt);
  const findPaths = (goals: readonly Cell[]) => findEnemyPaths({
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

export function decideEnemyAction(context: EnemyDecisionContext): EnemyDecision {
  const { enemy, playerCell } = context;
  const action = enemy.enemyAction;
  if (!action || enemy.phase !== "alive" || enemy.activity !== "ready" || !playerCell) {
    return { type: "wait" };
  }

  const attackDirection = attackFacing(enemy, playerCell, action, enemy.facing ?? CARDINAL_DIRECTIONS[0]!);
  if (attackDirection) {
    return {
      type: "attack",
      attack: action,
      cells: rotatedAttackCells(enemy.cell, attackDirection, action.offsets),
      facing: attackDirection,
    };
  }

  const candidates = movementCandidates(enemy, playerCell, action, context)
    .filter((candidate) => context.canMove(candidate.destination));
  return candidates.length > 0 ? { type: "move", candidates } : { type: "wait" };
}

export function committedAttackFromDecision(
  decision: Extract<EnemyDecision, { type: "attack" }>,
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
    ...(decision.attack.metadata ? { metadata: decision.attack.metadata } : {}),
  };
}

export function directionToPlayer(enemy: EntityState, playerCell?: Cell): Cell | undefined {
  return playerCell ? directionBetween(enemy.cell, playerCell) : undefined;
}
