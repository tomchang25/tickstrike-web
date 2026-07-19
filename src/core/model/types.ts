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
export type EnemyActivity = "ready" | "telegraphing" | "recovering" | "resting" | "staggered";
export type EnemyDecisionKind = "move" | "attack" | "wait";
export type EnemyActionRole = string;
export type EnemyAttackKind = string;

export interface RangedEnemyTuning {
  readonly minDistance: number;
  readonly maxDistance: number;
}

export interface ChargeEnemyTuning {
  readonly minRange: number;
  readonly maxRange: number;
  readonly preferredMinRange: number;
}

/** Locked committed-attack metadata for a guardless Bomb self-destruct. */
export interface BombAttackMetadata {
  readonly center: Cell;
  readonly selfDestruct: true;
}
export type ReservationPurpose = "movement" | "attack" | "spawn" | string;
export type TelegraphPhase = "warning" | "active" | "resolved" | "cancelled" | string;
export type HitAngle = "front" | "side" | "back";
export type HitFeedback = "guarded" | "guard_break" | "staggered" | "unblocked";
export type MobilityKind = "dash" | "smash";
export type SmashDisplacementKind = "crush" | "knockback" | "water" | "blocked" | "none";

export interface PlayerMobilityDefinition {
  readonly kind: MobilityKind;
  readonly damage: number;
  readonly range: number;
  readonly cooldown: number;
  readonly staggerMultiplier: number;
}

export interface PlayerMobilityState extends PlayerMobilityDefinition {
  readonly remainingCooldown: number;
  readonly invulnerable: boolean;
}

export interface EnemyActionDefinition {
  readonly role: EnemyActionRole;
  readonly attackId: string;
  readonly kind?: EnemyAttackKind;
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  /** Local attack coordinates where x is forward and y is lateral. */
  readonly offsets: readonly Cell[];
  /** Normalized tuning for the Ranged distance-band policy. */
  readonly rangedTuning?: RangedEnemyTuning;
  /** Normalized tuning for the Charge live cardinal range policy. */
  readonly chargeTuning?: ChargeEnemyTuning;
  /** Locked role data, such as an attack center or a landing direction. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EnemyMovementCandidate {
  /** The one cell that may be applied during the current enemy action. */
  readonly destination: Cell;
  /** The complete planned route, including destination and its final goal. */
  readonly path: readonly Cell[];
  /** The attack-origin or approach cell reached by the planned route. */
  readonly goal: Cell;
  /** Facing used when the first movement step is applied. */
  readonly facing: Cell;
}

export interface CommittedAttack {
  readonly attackId: string;
  readonly role?: EnemyActionRole;
  readonly kind?: EnemyAttackKind;
  readonly cells: readonly Cell[];
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  /** Locked role data copied at commitment and never recomputed during warning. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GuardRuntime {
  readonly id: string;
  readonly current: number;
  readonly max: number;
  readonly staggerDuration: number;
  readonly protectionDuration: number;
  readonly protectionMultiplier: number;
}

/** Data shared by entity creation inputs and normalized world state. */
export interface EntitySpawnData {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly archetype: string;
  /** Authored semantic presentation profile resolved by the presentation layer. */
  readonly presentationId?: string;
  readonly cell: Cell;
  readonly hp: number;
  /** Harness-only damage immunity for deterministic presentation scenarios. */
  readonly damageImmune?: boolean;
  readonly defense?: number;
  /** Authored player Normal Attack damage, when this entity is the player. */
  readonly normalAttackDamage?: number;
  /** Authored player Mobility damage, when this entity is the player. */
  readonly mobilityAttackDamage?: number;
  readonly mobility?: PlayerMobilityDefinition;
  /** Immutable authored runtime data for an enabled enemy action. */
  readonly enemyAction?: EnemyActionDefinition;
  readonly facing?: Cell;
}

export interface EntityState extends EntitySpawnData {
  /** Absolute logical cells claimed by the entity while it is active. */
  readonly footprint: readonly Cell[];
  readonly maxHp: number;
  readonly guard?: GuardRuntime;
  readonly staggerTicks?: number;
  readonly protectionTicks?: number;
  /** Authored and runtime Mobility state, when this entity is the player. */
  readonly mobility?: PlayerMobilityState;
  readonly activity?: EnemyActivity;
  readonly lastDecision?: EnemyDecisionKind;
  readonly recoveryTicks?: number;
  readonly restTicks?: number;
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

/** The unit cardinal direction from `from` to `to` when they share a row or column, at any distance. */
export function cardinalLineDirection(from: Cell, to: Cell): Cell | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  if (dx !== 0 && dy !== 0) {
    return undefined;
  }
  return dx !== 0 ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}
