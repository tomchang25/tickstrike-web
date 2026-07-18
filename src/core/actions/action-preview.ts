import { isCardinalDirection, sameCell, type Cell, type EntityState, type WorldSnapshot } from "../model/types";
import type { World } from "../world/world";

export interface AttackPreview {
  readonly accepted: boolean;
  readonly direction: Cell;
  readonly target: Cell;
  readonly hasTarget: boolean;
  readonly reason?: string;
}

export interface DashPreview {
  readonly accepted: boolean;
  readonly direction: Cell;
  readonly path: readonly Cell[];
  readonly landing?: Cell;
  readonly reason?: string;
}

type PreviewSource = World | WorldSnapshot;

function snapshotOf(source: PreviewSource): WorldSnapshot {
  return "snapshot" in source ? source.snapshot() : source;
}

function add(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y };
}

function multiply(cell: Cell, amount: number): Cell {
  return { x: cell.x * amount, y: cell.y * amount };
}

function entityAt(snapshot: WorldSnapshot, cell: Cell, kind?: EntityState["kind"]): EntityState | undefined {
  return snapshot.entities.find((entity) => {
    if (entity.phase !== "alive" || (kind && entity.kind !== kind)) return false;
    return entity.footprint.some((occupied) => sameCell(occupied, cell));
  });
}

function isWalkable(snapshot: WorldSnapshot, cell: Cell): boolean {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return false;
  if (cell.x < 0 || cell.y < 0 || cell.x >= snapshot.arena.width || cell.y >= snapshot.arena.height) return false;
  if (snapshot.arena.terrain[cell.y * snapshot.arena.width + cell.x] !== "land") return false;
  if (snapshot.reservations.some((reservation) => reservation.cells.some((reserved) => sameCell(reserved, cell)))) return false;
  return !entityAt(snapshot, cell);
}

export function attackTarget(origin: Cell, direction: Cell): Cell {
  return add(origin, direction);
}

export function previewAttack(source: PreviewSource, actorId: string, direction: Cell): AttackPreview {
  const snapshot = snapshotOf(source);
  const actor = snapshot.entities.find((entity) => entity.id === actorId);
  const target = actor ? attackTarget(actor.cell, direction) : direction;
  if (!actor || actor.phase !== "alive") {
    return {
      accepted: false,
      direction,
      target,
      hasTarget: false,
      reason: "Actor is not active.",
    };
  }
  if (!isCardinalDirection(direction)) {
    return {
      accepted: false,
      direction,
      target,
      hasTarget: false,
      reason: "Direction must be cardinal.",
    };
  }
  return {
    accepted: true,
    direction,
    target,
    hasTarget: Boolean(entityAt(snapshot, target, "enemy")),
  };
}

export function previewDash(source: PreviewSource, actorId: string, direction: Cell): DashPreview {
  const snapshot = snapshotOf(source);
  const actor = snapshot.entities.find((entity) => entity.id === actorId);
  if (!actor || actor.phase !== "alive") {
    return { accepted: false, direction, path: [], reason: "Actor is not active." };
  }
  if (!isCardinalDirection(direction)) {
    return { accepted: false, direction, path: [], reason: "Direction must be cardinal." };
  }

  const path: Cell[] = [];
  for (let step = 1; step <= 3; step += 1) {
    const candidate = add(actor.cell, multiply(direction, step));
    if (!isWalkable(snapshot, candidate)) break;
    path.push(candidate);
  }

  if (path.length === 0) {
    return { accepted: false, direction, path, reason: "Dash has no legal landing cell." };
  }

  return {
    accepted: true,
    direction,
    path,
    landing: path[path.length - 1],
  };
}
