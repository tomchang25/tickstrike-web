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
  private readonly entities = new Map<EntityId, EntityState>();
  private currentTick = 0;
  private lastEvents: readonly CombatEvent[] = [];

  constructor(width: number, height: number, tiles: readonly TileKind[]) {
    if (tiles.length !== width * height) {
      throw new Error(`Expected ${width * height} tiles, received ${tiles.length}.`);
    }

    this.arena = {
      width,
      height,
      tiles: [...tiles],
    };
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
    if (!this.isInside(cell)) return "wall";
    const index = cell.y * this.arena.width + cell.x;
    return this.arena.tiles[index] ?? "wall";
  }

  isInside(cell: Cell): boolean {
    return (
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < this.arena.width &&
      cell.y < this.arena.height
    );
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
        tiles: [...this.arena.tiles],
      },
      entities: this.listEntities(),
      lastEvents: this.lastEvents.map((event) => structuredClone(event)),
    };
  }
}
