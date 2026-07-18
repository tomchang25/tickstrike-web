export type EntityId = string;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type TileKind = "floor" | "wall" | "water";
export type EntityKind = "player" | "enemy";
export type EntityPhase = "alive" | "drowning" | "dead";

export interface EntityState {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly archetype: string;
  readonly cell: Cell;
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: EntityPhase;
}

export interface ArenaState {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly TileKind[];
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly arena: ArenaState;
  readonly entities: readonly EntityState[];
  readonly lastEvents: readonly import("../events/combat-events").CombatEvent[];
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}
