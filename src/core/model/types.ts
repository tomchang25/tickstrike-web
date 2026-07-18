export type EntityId = string;
export type Seed = number | string;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type TerrainKind = "land" | "sea";
export type TileKind = "floor" | "wall" | "water";
export type EntityKind = "player" | "enemy";
export type EntityPhase = "alive" | "drowning" | "dead";
export type TerminalEntityPhase = Exclude<EntityPhase, "alive">;
export type EncounterOutcome = "running" | "victory" | "defeat";
export type EnemyActivity = "ready" | "telegraphing" | "recovering" | "staggered";
export type EnemyDecision = "move" | "attack" | "wait";
export type ReservationPurpose = "movement" | "attack" | "spawn" | string;
export type TelegraphPhase = "warning" | "active" | "resolved" | "cancelled" | string;
export type HitAngle = "front" | "side" | "back";
export type HitFeedback = "guarded" | "guard_break" | "staggered" | "unblocked";

export interface BasicEnemyActionDefinition {
  readonly role: "thrust" | "slash";
  readonly attackId: string;
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  /** Local attack coordinates where x is forward and y is lateral. */
  readonly offsets: readonly Cell[];
}

export interface CommittedAttack {
  readonly attackId: string;
  readonly cells: readonly Cell[];
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
}

export interface GuardRuntime {
  readonly id: string;
  readonly current: number;
  readonly max: number;
  readonly staggerDuration: number;
  readonly protectionDuration: number;
  readonly protectionMultiplier: number;
}

export interface EntityState {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly archetype: string;
  readonly cell: Cell;
  /** Absolute logical cells claimed by the entity while it is active. */
  readonly footprint: readonly Cell[];
  readonly hp: number;
  readonly maxHp: number;
  readonly defense?: number;
  readonly guard?: GuardRuntime;
  readonly staggerTicks?: number;
  readonly protectionTicks?: number;
  /** Authored player Normal Attack damage, when this entity is the player. */
  readonly normalAttackDamage?: number;
  /** Authored player Mobility damage, when this entity is the player. */
  readonly mobilityAttackDamage?: number;
  /** Immutable authored runtime data for an enabled basic enemy. */
  readonly enemyAction?: BasicEnemyActionDefinition;
  readonly activity?: EnemyActivity;
  readonly lastDecision?: EnemyDecision;
  readonly facing?: Cell;
  readonly recoveryTicks?: number;
  readonly committedAttack?: CommittedAttack;
  readonly phase: EntityPhase;
}

export interface DamageResult {
  readonly targetId: EntityId;
  readonly damage: number;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly killed: boolean;
}

export interface BasicHitResult extends DamageResult {
  readonly attackerId: EntityId;
}

export interface DirectionalHitResult extends BasicHitResult {
  readonly angle: HitAngle;
  readonly baseDamage: number;
  readonly guardDamage: number;
  readonly guardBefore: number;
  readonly guardAfter: number;
  readonly hpDamage: number;
  readonly defenseAdjustedDamage: number;
  readonly guardBroken: boolean;
  readonly staggerBurst: boolean;
  readonly feedback: HitFeedback;
}

export interface Reservation {
  readonly ownerId: string;
  readonly purpose: ReservationPurpose;
  readonly cells: readonly Cell[];
  /** True for the currently executing movement step. */
  readonly activeStep: boolean;
  /** Stable world-local order used as the final arbitration tie-breaker. */
  readonly registrationIndex: number;
}

export interface Telegraph {
  readonly sourceId: string;
  readonly phase: TelegraphPhase;
  readonly cells: readonly Cell[];
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
  readonly outcome: EncounterOutcome;
  readonly arena: ArenaState;
  readonly playerCell: Cell | undefined;
  readonly armedSmashTarget: Cell | undefined;
  readonly entities: readonly EntityState[];
  readonly reservations: readonly Reservation[];
  readonly telegraphs: readonly Telegraph[];
  readonly seed: number;
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
