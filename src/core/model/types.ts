export type EntityId = string;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type TerrainKind = "land" | "sea";
export type TileKind = "floor" | "wall" | "water";
export type EntityKind = "player" | "enemy";
export type EntityPhase = "alive" | "drowning" | "dead";
export type TerminalEntityPhase = Exclude<EntityPhase, "alive">;

export interface EntityState {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly archetype: string;
  readonly cell: Cell;
  /** Absolute logical cells claimed by the entity while it is active. */
  readonly footprint: readonly Cell[];
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: EntityPhase;
}

export interface ArenaState {
  readonly width: number;
  readonly height: number;
  /** Authoritative renderer-independent terrain values in row-major order. */
  readonly terrain: readonly TerrainKind[];
  /** Legacy presentation tile projection retained for the current combat fixture. */
  readonly tiles: readonly TileKind[];
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly arena: ArenaState;
  readonly playerCell: Cell | undefined;
  readonly entities: readonly EntityState[];
  readonly lastEvents: readonly import("../events/combat-events").CombatEvent[];
}

export function isTerminalPhase(phase: EntityPhase): phase is TerminalEntityPhase {
  return phase !== "alive";
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function addCells(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function manhattanDistance(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshevDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function isCardinalDirection(direction: Cell): boolean {
  return (
    Number.isInteger(direction.x) &&
    Number.isInteger(direction.y) &&
    Math.abs(direction.x) + Math.abs(direction.y) === 1
  );
}

export function cardinalDirection(direction: Cell): Cell | undefined {
  return isCardinalDirection(direction) ? { x: direction.x, y: direction.y } : undefined;
}

export function directionBetween(from: Cell, to: Cell): Cell | undefined {
  return cardinalDirection({ x: to.x - from.x, y: to.y - from.y });
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}
