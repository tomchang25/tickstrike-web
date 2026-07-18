import {
  addCells,
  cardinalDirection,
  directionBetween,
  sameCell,
  type BasicEnemyActionDefinition,
  type Cell,
  type EntityState,
} from "../model/types";

export type BasicEnemyDecision =
  | { readonly type: "move"; readonly destination: Cell; readonly facing: Cell }
  | {
      readonly type: "attack";
      readonly attack: BasicEnemyActionDefinition;
      readonly cells: readonly Cell[];
      readonly facing: Cell;
    }
  | { readonly type: "wait" };

export interface BasicEnemyDecisionContext {
  readonly enemy: EntityState;
  readonly playerCell?: Cell;
  canMove(destination: Cell): boolean;
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

function chaseDirection(from: Cell, to: Cell): Cell | undefined {
  const horizontal = Math.abs(to.x - from.x);
  const vertical = Math.abs(to.y - from.y);
  if (horizontal === 0 && vertical === 0) return undefined;
  if (horizontal >= vertical && horizontal > 0) return { x: Math.sign(to.x - from.x), y: 0 };
  return { x: 0, y: Math.sign(to.y - from.y) };
}

function movementDirections(primary: Cell, from: Cell, to: Cell): readonly Cell[] {
  const directions: Cell[] = [primary];
  if (primary.x !== 0) {
    const towardSide = Math.sign(to.y - from.y) || 1;
    directions.push(
      { x: 0, y: towardSide },
      { x: 0, y: -towardSide },
      { x: -primary.x, y: 0 },
    );
  } else {
    const towardSide = Math.sign(to.x - from.x) || 1;
    directions.push(
      { x: towardSide, y: 0 },
      { x: -towardSide, y: 0 },
      { x: 0, y: -primary.y },
    );
  }
  return directions.filter((direction, index) =>
    directions.findIndex((candidate) => sameCell(candidate, direction)) === index,
  );
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
  action: BasicEnemyActionDefinition,
  preferred: Cell,
): Cell | undefined {
  const candidates = [enemy.facing ?? preferred, preferred, ...CARDINAL_DIRECTIONS];
  return candidates.find((facing, index) => {
    if (candidates.findIndex((candidate) => sameCell(candidate, facing)) !== index) return false;
    return rotatedAttackCells(enemy.cell, facing, action.offsets).some((cell) => sameCell(cell, playerCell));
  });
}

export function decideBasicEnemyAction(context: BasicEnemyDecisionContext): BasicEnemyDecision {
  const { enemy, playerCell } = context;
  const action = enemy.enemyAction;
  if (!action || enemy.phase !== "alive" || enemy.activity !== "ready" || !playerCell) {
    return { type: "wait" };
  }

  const direction = chaseDirection(enemy.cell, playerCell);
  if (!direction) return { type: "wait" };
  const attackDirection = attackFacing(enemy, playerCell, action, direction);
  if (attackDirection) {
    return {
      type: "attack",
      attack: action,
      cells: rotatedAttackCells(enemy.cell, attackDirection, action.offsets),
      facing: attackDirection,
    };
  }

  for (const candidate of movementDirections(direction, enemy.cell, playerCell)) {
    const destination = addCells(enemy.cell, candidate);
    if (!context.canMove(destination)) continue;
    return { type: "move", destination, facing: candidate };
  }
  return { type: "wait" };
}

export function committedAttackFromDecision(
  decision: Extract<BasicEnemyDecision, { type: "attack" }>,
): {
  readonly attackId: string;
  readonly cells: readonly Cell[];
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
} {
  return {
    attackId: decision.attack.attackId,
    cells: decision.cells,
    damage: decision.attack.damage,
    warningTicks: decision.attack.warningTicks,
    recoveryTicks: decision.attack.recoveryTicks,
  };
}

export function directionToPlayer(enemy: EntityState, playerCell?: Cell): Cell | undefined {
  return playerCell ? directionBetween(enemy.cell, playerCell) : undefined;
}
