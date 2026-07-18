import type { CombatEvent } from "../events/combat-events";
import {
  cellKey,
  sameCell,
  type ArenaState,
  type Cell,
  type EntityId,
  type EntityState,
  type TileKind,
  type WorldSnapshot,
} from "../model/types";
import { Arena } from "./arena";

export interface SpawnEntityInput {
  readonly id: EntityId;
  readonly kind: EntityState["kind"];
  readonly archetype: string;
  readonly cell: Cell;
  readonly hp: number;
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneEntity(entity: EntityState): EntityState {
  return {
    ...entity,
    cell: cloneCell(entity.cell),
  };
}

export class World {
  readonly arena: ArenaState;
  private readonly geometry: Arena;
  private readonly entities = new Map<EntityId, EntityState>();
  private currentTick = 0;
  private lastEvents: readonly CombatEvent[] = [];

  constructor(arena: Arena);
  constructor(width: number, height: number, tiles: readonly TileKind[]);
  constructor(
    arenaOrWidth: Arena | number,
    height?: number,
    tiles?: readonly TileKind[],
  ) {
    this.geometry =
      arenaOrWidth instanceof Arena
        ? arenaOrWidth
        : Arena.fromTiles(arenaOrWidth, height ?? 0, tiles ?? []);
    this.arena = this.geometry.toState();
  }

  spawn(input: SpawnEntityInput): EntityState {
    if (this.entities.has(input.id)) {
      throw new Error(`Entity already exists: ${input.id}`);
    }
    if (!this.isInside(input.cell)) {
      throw new Error(`Cannot spawn ${input.id} outside the arena.`);
    }

    const entity: EntityState = {
      id: input.id,
      kind: input.kind,
      archetype: input.archetype,
      cell: cloneCell(input.cell),
      hp: input.hp,
      maxHp: input.hp,
      phase: "alive",
    };
    this.entities.set(entity.id, entity);
    return cloneEntity(entity);
  }

  getEntity(id: EntityId): EntityState | undefined {
    const entity = this.entities.get(id);
    return entity ? cloneEntity(entity) : undefined;
  }

  requireEntity(id: EntityId): EntityState {
    const entity = this.getEntity(id);
    if (!entity) {
      throw new Error(`Unknown entity: ${id}`);
    }
    return entity;
  }

  listEntities(): readonly EntityState[] {
    return [...this.entities.values()].map(cloneEntity);
  }

  findAliveAt(cell: Cell, kind?: EntityState["kind"]): EntityState | undefined {
    for (const entity of this.entities.values()) {
      if (entity.phase !== "alive") continue;
      if (kind && entity.kind !== kind) continue;
      if (sameCell(entity.cell, cell)) return cloneEntity(entity);
    }
    return undefined;
  }

  listAliveEnemiesAround(center: Cell, radius: number): readonly EntityState[] {
    return [...this.entities.values()]
      .filter((entity) => {
        if (entity.kind !== "enemy" || entity.phase !== "alive") return false;
        const dx = Math.abs(entity.cell.x - center.x);
        const dy = Math.abs(entity.cell.y - center.y);
        return dx <= radius && dy <= radius;
      })
      .map(cloneEntity);
  }

  moveEntity(id: EntityId, to: Cell): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (!this.isInside(to)) throw new Error(`Move outside arena: ${cellKey(to)}`);
    this.entities.set(id, { ...entity, cell: cloneCell(to) });
  }

  setPhase(id: EntityId, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    this.entities.set(id, { ...entity, phase });
  }

  removeEntity(id: EntityId): void {
    this.entities.delete(id);
  }

  tileAt(cell: Cell): TileKind {
    return this.geometry.tileAt(cell);
  }

  isInside(cell: Cell): boolean {
    return this.geometry.isInBounds(cell);
  }

  isLegalCell(cell: Cell): boolean {
    return this.geometry.isLegalCell(cell);
  }

  isWalkable(cell: Cell): boolean {
    return this.tileAt(cell) === "floor" && !this.findAliveAt(cell);
  }

  advanceTick(): void {
    this.currentTick += 1;
  }

  recordEvents(events: readonly CombatEvent[]): void {
    this.lastEvents = events.map((event) => structuredClone(event));
  }

  snapshot(): WorldSnapshot {
    return {
      tick: this.currentTick,
      arena: {
        ...this.arena,
        terrain: [...this.arena.terrain],
        tiles: [...this.arena.tiles],
      },
      entities: this.listEntities(),
      lastEvents: this.lastEvents.map((event) => structuredClone(event)),
    };
  }
}
