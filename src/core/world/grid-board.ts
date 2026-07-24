import {
  cellKey,
  manhattanDistance,
  sameCell,
  type Cell,
  type EntityId,
  type Reservation,
  type ReservationPurpose,
  type Telegraph,
  type TelegraphPhase,
  type TileKind,
} from "../model/types";
import type { Arena } from "./arena";

export interface TelegraphInput {
  readonly sourceId: string;
  readonly phase: TelegraphPhase;
  readonly cells: readonly Cell[];
  readonly remainingTicks?: number;
}

export interface ReservationRequest {
  readonly ownerId: string;
  readonly purpose: ReservationPurpose;
  readonly cells: readonly Cell[];
  readonly activeStep?: boolean;
}

export interface ReservationDecision {
  readonly accepted: boolean;
  readonly granted: boolean;
  readonly reservation?: Reservation;
  readonly lostOwners: readonly string[];
  readonly reason?: string;
}

/**
 * The board's read-back into entity anchors, supplied by the world at
 * construction. Reservation arbitration tiebreaks on distance to the Player;
 * these two lookups are the only entity facts the board may consult.
 */
export interface BoardEntityLocator {
  anchorCellOf(id: EntityId): Cell | undefined;
  playerCell(): Cell | undefined;
}

/**
 * A working occupancy view for one atomic multi-entity displacement. Staged
 * moves update the view immediately so later placement questions see them;
 * nothing touches the live board until the owner applies the staged moves.
 */
export interface DisplacementTransaction {
  /** Legal terrain, unclaimed in the working view, and unreserved on the live board. */
  isFree(cell: Cell): boolean;
  /** The occupant id at a cell in the working view. */
  occupantIdAt(cell: Cell): EntityId | undefined;
  /** Stages moving the occupant anchored at `from` to `to` in the working view. */
  stageMove(id: EntityId, from: Cell, to: Cell): void;
  readonly moves: readonly { readonly id: EntityId; readonly to: Cell }[];
}

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneReservation(reservation: Reservation): Reservation {
  return { ...reservation, cells: reservation.cells.map(cloneCell) };
}

function cloneTelegraph(telegraph: Telegraph): Telegraph {
  return { ...telegraph, cells: telegraph.cells.map(cloneCell) };
}

function hasDuplicateCells(cells: readonly Cell[]): boolean {
  const keys = new Set(cells.map(cellKey));
  return keys.size !== cells.length;
}

function purposePriority(purpose: ReservationPurpose, activeStep: boolean): number {
  if (purpose === "spawn") {
    return -1;
  }
  if (activeStep && (purpose === "movement" || purpose === "movement_step")) {
    return 0;
  }
  if (purpose === "attack" || purpose === "attack_intent") {
    return 1;
  }
  return 2;
}

/**
 * The world's spatial authority: cell legality, occupancy indexing, footprint
 * placement validation, reservation arbitration, and atomic displacement views.
 * The board maps ids to cells and never reads entity hp, activity, or roles;
 * entity data stays with the world, which supplies a narrow locator instead.
 */
export class GridBoard {
  private readonly occupancy = new Map<string, EntityId>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly telegraphs = new Map<string, Telegraph>();
  private nextRegistrationIndex = 0;

  constructor(
    private readonly geometry: Arena,
    private readonly locator: BoardEntityLocator,
  ) {}

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
    const reservation = this.reservationAt(cell);
    return this.geometry.isLegalCell(cell) && !this.isOccupied(cell) && !reservation;
  }

  occupantIdAt(cell: Cell): EntityId | undefined {
    return this.occupancy.get(cellKey(cell));
  }

  isOccupied(cell: Cell): boolean {
    return this.occupancy.has(cellKey(cell));
  }

  claimFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) {
      this.occupancy.set(cellKey(cell), id);
    }
  }

  releaseFootprint(id: EntityId, footprint: readonly Cell[]): void {
    for (const cell of footprint) {
      const key = cellKey(cell);
      if (this.occupancy.get(key) === id) {
        this.occupancy.delete(key);
      }
    }
  }

  /** Full spawn placement check: geometry legality first, then occupancy and reservations. */
  validateSpawnPlacement(id: EntityId, anchor: Cell, footprint: readonly Cell[]): void {
    if (!this.isInside(anchor)) {
      throw new Error(`Cannot spawn ${id} outside the arena.`);
    }
    if (footprint.length === 0) {
      throw new Error(`Cannot spawn ${id} with an empty footprint.`);
    }
    if (hasDuplicateCells(footprint)) {
      throw new Error(`Cannot spawn ${id} with duplicate footprint cells.`);
    }
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot spawn ${id} on a non-walkable footprint.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant) {
        throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
      }
      if (this.reservationAt(cell)) {
        throw new Error(`Cell ${cellKey(cell)} is reserved.`);
      }
    }
  }

  validateActiveFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) {
      throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    }
    if (!footprint.every((cell) => this.geometry.isLegalCell(cell))) {
      throw new Error(`Cannot place ${id} on a non-walkable footprint.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) {
        throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
      }
      const reservation = this.reservationAt(cell);
      if (reservation && reservation.ownerId !== id) {
        throw new Error(`Cell ${cellKey(cell)} is reserved.`);
      }
    }
  }

  validateTerminalFootprint(id: EntityId, footprint: readonly Cell[]): void {
    if (hasDuplicateCells(footprint)) {
      throw new Error(`Cannot place ${id} with duplicate footprint cells.`);
    }
    if (footprint.some((cell) => !this.isInside(cell))) {
      throw new Error(`Cannot move ${id} outside the arena.`);
    }
    for (const cell of footprint) {
      const occupant = this.occupancy.get(cellKey(cell));
      if (occupant && occupant !== id) {
        throw new Error(`Cell ${cellKey(cell)} is occupied by ${occupant}.`);
      }
    }
  }

  previewReservation(request: ReservationRequest): ReservationDecision {
    const cells = request.cells.map(cloneCell);
    if (cells.length === 0 || hasDuplicateCells(cells)) {
      return {
        accepted: false,
        granted: false,
        lostOwners: [],
        reason: "Reservation cells must be unique and non-empty.",
      };
    }
    if (!cells.every((cell) => this.geometry.isLegalCell(cell))) {
      return {
        accepted: false,
        granted: false,
        lostOwners: [],
        reason: "Reservation cells must be legal land cells.",
      };
    }

    const current = this.reservations.get(request.ownerId);
    const conflicts = [...this.reservations.values()].filter(
      (reservation) =>
        reservation.ownerId !== request.ownerId &&
        reservation.cells.some((reserved) => cells.some((cell) => sameCell(cell, reserved))),
    );
    const registrationIndex = current?.registrationIndex ?? this.nextRegistrationIndex;
    const candidate: Reservation = {
      ownerId: request.ownerId,
      purpose: request.purpose,
      cells,
      activeStep: request.activeStep ?? false,
      registrationIndex,
    };
    const defeated = conflicts.filter((reservation) => this.compareReservations(candidate, reservation) > 0);
    if (defeated.length > 0) {
      return {
        accepted: true,
        granted: false,
        lostOwners: [],
        reason: "Reservation lost arbitration.",
      };
    }
    return {
      accepted: true,
      granted: true,
      reservation: cloneReservation(candidate),
      lostOwners: conflicts.map((reservation) => reservation.ownerId),
    };
  }

  requestReservation(request: ReservationRequest): ReservationDecision {
    const decision = this.previewReservation(request);
    if (!decision.granted || !decision.reservation) {
      return decision;
    }

    this.releaseReservation(request.ownerId);
    for (const ownerId of decision.lostOwners) {
      this.releaseReservation(ownerId);
    }
    if (this.reservations.get(request.ownerId)) {
      throw new Error(`Reservation owner remained after replacement: ${request.ownerId}`);
    }
    const reservation = {
      ...decision.reservation,
      registrationIndex:
        decision.reservation.registrationIndex === this.nextRegistrationIndex
          ? this.nextRegistrationIndex++
          : decision.reservation.registrationIndex,
    };
    this.reservations.set(request.ownerId, reservation);
    return { ...decision, reservation: cloneReservation(reservation) };
  }

  getReservation(ownerId: string): Reservation | undefined {
    const reservation = this.reservations.get(ownerId);
    return reservation ? cloneReservation(reservation) : undefined;
  }

  listReservations(): readonly Reservation[] {
    return [...this.reservations.values()].map(cloneReservation);
  }

  reservationAt(cell: Cell): Reservation | undefined {
    const reservation = [...this.reservations.values()].find((candidate) =>
      candidate.cells.some((reserved) => sameCell(reserved, cell)),
    );
    return reservation ? cloneReservation(reservation) : undefined;
  }

  isReserved(cell: Cell, excludingOwnerId?: string): boolean {
    const reservation = this.reservationAt(cell);
    return Boolean(reservation && reservation.ownerId !== excludingOwnerId);
  }

  releaseReservation(ownerId: string): boolean {
    return this.reservations.delete(ownerId);
  }

  setTelegraph(input: TelegraphInput): Telegraph {
    if (input.cells.length === 0 || hasDuplicateCells(input.cells)) {
      throw new Error("Telegraph cells must be unique and non-empty.");
    }
    if (!input.cells.every((cell) => this.geometry.isInBounds(cell))) {
      throw new Error("Telegraph cells must be inside the arena.");
    }
    const telegraph: Telegraph = {
      sourceId: input.sourceId,
      phase: input.phase,
      cells: input.cells.map(cloneCell),
      ...(input.remainingTicks !== undefined ? { remainingTicks: input.remainingTicks } : {}),
    };
    this.telegraphs.set(input.sourceId, telegraph);
    return cloneTelegraph(telegraph);
  }

  getTelegraph(sourceId: string): Telegraph | undefined {
    const telegraph = this.telegraphs.get(sourceId);
    return telegraph ? cloneTelegraph(telegraph) : undefined;
  }

  listTelegraphs(): readonly Telegraph[] {
    return [...this.telegraphs.values()].map(cloneTelegraph);
  }

  getTelegraphsAt(cell: Cell): readonly Telegraph[] {
    return [...this.telegraphs.values()]
      .filter((telegraph) => telegraph.cells.some((candidate) => sameCell(candidate, cell)))
      .map(cloneTelegraph);
  }

  clearTelegraph(sourceId: string): boolean {
    return this.telegraphs.delete(sourceId);
  }

  clearTelegraphs(): void {
    this.telegraphs.clear();
  }

  beginDisplacementTransaction(): DisplacementTransaction {
    const workingOccupancy = new Map(this.occupancy);
    const moves: { readonly id: EntityId; readonly to: Cell }[] = [];
    return {
      isFree: (cell) =>
        this.geometry.isLegalCell(cell) && !workingOccupancy.has(cellKey(cell)) && !this.reservationAt(cell),
      occupantIdAt: (cell) => workingOccupancy.get(cellKey(cell)),
      stageMove: (id, from, to) => {
        workingOccupancy.delete(cellKey(from));
        workingOccupancy.set(cellKey(to), id);
        moves.push({ id, to: cloneCell(to) });
      },
      moves,
    };
  }

  private compareReservations(a: Reservation, b: Reservation): number {
    const priorityA = purposePriority(a.purpose, a.activeStep);
    const priorityB = purposePriority(b.purpose, b.activeStep);
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const player = this.locator.playerCell();
    if (player) {
      const distanceA = manhattanDistance(this.locator.anchorCellOf(a.ownerId) ?? a.cells[0]!, player);
      const distanceB = manhattanDistance(this.locator.anchorCellOf(b.ownerId) ?? b.cells[0]!, player);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
    }
    return a.registrationIndex - b.registrationIndex;
  }
}
