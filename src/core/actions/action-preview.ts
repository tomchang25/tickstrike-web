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

export interface SmashPreview {
  readonly accepted: boolean;
  readonly target: Cell;
  readonly area: readonly Cell[];
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

function isWalkable(snapshot: WorldSnapshot, cell: Cell, allowEnemyTraversal = false): boolean {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return false;
  if (cell.x < 0 || cell.y < 0 || cell.x >= snapshot.arena.width || cell.y >= snapshot.arena.height) return false;
  if (snapshot.arena.terrain[cell.y * snapshot.arena.width + cell.x] !== "land") return false;
  if (snapshot.reservations.some((reservation) => reservation.cells.some((reserved) => sameCell(reserved, cell)))) return false;
  const occupant = entityAt(snapshot, cell);
  return !occupant || (allowEnemyTraversal && occupant.kind === "enemy");
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
  let landing: Cell | undefined;
  for (let step = 1; step <= 3; step += 1) {
    const candidate = add(actor.cell, multiply(direction, step));
    if (!isWalkable(snapshot, candidate, true)) break;
    path.push(candidate);
    if (!entityAt(snapshot, candidate, "enemy")) landing = candidate;
  }

  if (!landing) {
    return { accepted: false, direction, path, reason: "Dash has no legal landing cell." };
  }

  return {
    accepted: true,
    direction,
    path,
    landing,
  };
}

export function clampSmashTarget(mouseCell: Cell, origin: Cell, maxRange = 3): Cell {
  return {
    x: origin.x + Math.max(-maxRange, Math.min(maxRange, mouseCell.x - origin.x)),
    y: origin.y + Math.max(-maxRange, Math.min(maxRange, mouseCell.y - origin.y)),
  };
}

export function smashArea(center: Cell): readonly Cell[] {
  const area: Cell[] = [];
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      area.push({ x: center.x + offsetX, y: center.y + offsetY });
    }
  }
  return area;
}

export function previewSmash(source: PreviewSource, actorId: string, target: Cell): SmashPreview {
  const snapshot = snapshotOf(source);
  const actor = snapshot.entities.find((entity) => entity.id === actorId);
  const area = smashArea(target);
  if (!actor || actor.phase !== "alive") {
    return { accepted: false, target, area, reason: "Actor is not active." };
  }
  if (!isWalkable(snapshot, target)) {
    return { accepted: false, target, area, reason: "Smash landing is blocked." };
  }
  return { accepted: true, target, area };
}
