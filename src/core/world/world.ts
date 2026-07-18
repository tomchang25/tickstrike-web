import type { CombatEvent } from "../events/combat-events";
import {
  cellKey,
  sameCell,
  type ArenaState,
  type Cell,
  type EntityId,
  type EntityState,
  isTerminalPhase,
  type TileKind,
  type WorldSnapshot,
} from "../model/types";
import { Arena } from "./arena";

export interface SpawnEntityInput {
  readonly id: EntityId;
  readonly kind: EntityState["kind"];
  readonly archetype: string;
  readonly cell: Cell;
  readonly footprint?: readonly Cell[];
  readonly hp: number;
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneEntity(entity: EntityState): EntityState {
  return {
    ...entity,
    cell: cloneCell(entity.cell),
    footprint: entity.footprint.map(cloneCell),
  };
}

function hasDuplicateCells(cells: readonly Cell[]): boolean {
  const keys = new Set(cells.map(cellKey));
  return keys.size !== cells.length;
}

export class World {
  readonly arena: ArenaState;
  private readonly geometry: Arena;
  private readonly entities = new Map<EntityId, EntityState>();
  private readonly occupancy = new Map<string, EntityId>();
  private currentPlayerCell: Cell | undefined;
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
    if (input.kind === "player" && this.currentPlayerCell) {
      throw new Error("Only one player can exist in the world.");
    }

    const footprint = input.footprint ? input.footprint.map(cloneCell) : [cloneCell(input.cell)];
    this.validateNewFootprint(input.id, input.cell, footprint);
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
    }

    const entity: EntityState = {
      id: input.id,
      kind: input.kind,
      archetype: input.archetype,
      cell: cloneCell(input.cell),
      footprint,
      hp: input.hp,
      maxHp: input.hp,
      phase: "alive",
    };
    this.entities.set(entity.id, entity);
    this.claimFootprint(entity.id, entity.footprint);
    if (entity.kind === "player") this.currentPlayerCell = cloneCell(entity.cell);
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

  listActiveEntities(): readonly EntityState[] {
    return [...this.entities.values()]
      .filter((entity) => !isTerminalPhase(entity.phase))
      .map(cloneEntity);
  }

  get playerCell(): Cell | undefined {
    return this.currentPlayerCell ? cloneCell(this.currentPlayerCell) : undefined;
  }

  getOccupantAt(cell: Cell): EntityState | undefined {
    const id = this.occupancy.get(cellKey(cell));
    return id ? this.getEntity(id) : undefined;
  }

  isOccupied(cell: Cell): boolean {
    return this.occupancy.has(cellKey(cell));
  }

  findAliveAt(cell: Cell, kind?: EntityState["kind"]): EntityState | undefined {
    const entity = this.getOccupantAt(cell);
    if (!entity || (kind && entity.kind !== kind)) return undefined;
    return sameCell(entity.cell, cell) || entity.footprint.some((occupied) => sameCell(occupied, cell))
      ? entity
      : undefined;
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
    if (isTerminalPhase(entity.phase)) throw new Error(`Cannot move terminal entity: ${id}`);

    const footprint = this.translateFootprint(entity, to);
    this.validateActiveFootprint(id, footprint);
    this.replaceEntityPlacement(entity, { ...entity, cell: cloneCell(to), footprint });
  }

  setPhase(id: EntityId, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (entity.phase === phase) return;

    if (isTerminalPhase(phase)) {
      this.releaseFootprint(entity.id, entity.footprint);
      this.entities.set(id, { ...entity, phase });
      return;
    }

    this.validateActiveFootprint(id, entity.footprint);
    this.claimFootprint(id, entity.footprint);
    this.entities.set(id, { ...entity, phase });
  }

  moveEntityToPhase(id: EntityId, to: Cell, phase: EntityState["phase"]): void {
    const entity = this.entities.get(id);
    if (!entity) throw new Error(`Unknown entity: ${id}`);
    if (!isTerminalPhase(phase)) {
      this.moveEntity(id, to);
      this.setPhase(id, phase);
      return;
    }

    const footprint = this.translateFootprint(entity, to);
    this.validateTerminalFootprint(id, footprint);
    this.releaseFootprint(entity.id, entity.footprint);
    this.entities.set(id, { ...entity, cell: cloneCell(to), footprint, phase });
  }

  removeEntity(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.releaseFootprint(entity.id, entity.footprint);
    this.entities.delete(id);
    if (entity.kind === "player") this.currentPlayerCell = undefined;
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
    return this.geometry.isLegalCell(cell) && !this.isOccupied(cell);
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
      playerCell: this.playerCell,
      entities: this.listEntities(),
      lastEvents: this.lastEvents.map((event) => structuredClone(event)),
    };
  }

  private validateNewFootprint(id: EntityId, anchor: Cell, footprint: readonly Cell[]): void {
    if (!this.isInside(anchor)) throw new Error(`Cannot spawn ${id} outside the arena.`);
    if (footprint.length === 0) throw new Error(`Cannot spawn ${id} with an empty footprint.`);
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot spawn ${id} with duplicate footprint cells.`);
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot spawn ${id} on a non-walkable footprint.`);
    }
  }

  private validateActiveFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot place ${id} on a non-walkable footprint.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
    }
  }

  private validateTerminalFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    if (footprint.some((cell) => !this.isInside(cell))) {
      throw new Error(`Cannot move ${id} outside the arena.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
    }
  }

  private translateFootprint(entity: EntityState, to: Cell): readonly Cell[] {
    const dx = to.x - entity.cell.x;
    const dy = to.y - entity.cell.y;
    return entity.footprint.map((cell) => ({ x: cell.x + dx, y: cell.y + dy }));
  }

  private claimFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) this.occupancy.set(cellKey(cell), id);
  }

  private releaseFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) {
      const key = cellKey(cell);
      if (this.occupancy.get(key) === id) this.occupancy.delete(key);
    }
  }

  private replaceEntityPlacement(entity: EntityState, next: EntityState): void {
    this.releaseFootprint(entity.id, entity.footprint);
    this.claimFootprint(next.id, next.footprint);
    this.entities.set(entity.id, next);
    if (entity.kind === "player") this.currentPlayerCell = cloneCell(next.cell);
  }
}
