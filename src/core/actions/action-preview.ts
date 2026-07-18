import {
  isCardinalDirection,
  sameCell,
  type BasicHitResult,
  type Cell,
  type DirectionalHitResult,
  type EntityId,
  type EntityState,
  type MobilityKind,
  type WorldSnapshot,
} from "../model/types";
import { calculateDirectionalHit } from "../combat/directional-hit";
import type { World } from "../world/world";

export interface AttackPreview {
  readonly accepted: boolean;
  readonly direction: Cell;
  readonly target: Cell;
  readonly hasTarget: boolean;
  readonly hit?: BasicHitResult | DirectionalHitResult;
  readonly reason?: string;
}

export interface DashPreview {
  readonly accepted: boolean;
  readonly direction: Cell;
  readonly path: readonly Cell[];
  readonly landing?: Cell;
  readonly victims: readonly MobilityHitPreview[];
  readonly reason?: string;
}

export interface SmashPreview {
  readonly accepted: boolean;
  readonly target: Cell;
  readonly area: readonly Cell[];
  readonly victims: readonly MobilityHitPreview[];
  readonly reason?: string;
}

export interface MobilityHitPreview {
  readonly enemyId: EntityId;
  readonly origin: Cell;
  readonly hit: BasicHitResult | DirectionalHitResult;
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

function activeMobility(actor: EntityState): {
  readonly kind: MobilityKind;
  readonly damage: number;
  readonly range: number;
  readonly staggerMultiplier: number;
  readonly remainingCooldown: number;
} | undefined {
  if (actor.mobility) return actor.mobility;
  return {
    kind: "dash",
    damage: actor.mobilityAttackDamage ?? 0,
    range: 3,
    staggerMultiplier: 1,
    remainingCooldown: 0,
  };
}

function previewMobilityHit(
  actor: EntityState,
  target: EntityState,
  origin: Cell,
  damage: number,
  staggerMultiplier: number,
): MobilityHitPreview {
  const directional = target.facing
    ? calculateDirectionalHit({
        attackerId: actor.id,
        attackerCell: origin,
        target,
        damage,
        staggerMultiplier,
      })
    : undefined;
  return {
    enemyId: target.id,
    origin,
    hit: directional ?? previewBasicHit(actor.id, target, damage),
  };
}

export function attackTarget(origin: Cell, direction: Cell): Cell {
  return add(origin, direction);
}

export function previewBasicHit(attackerId: EntityId, target: EntityState, damage: number): BasicHitResult {
  const hpAfter = Math.max(0, target.hp - damage);
  return {
    attackerId,
    targetId: target.id,
    damage,
    hpBefore: target.hp,
    hpAfter,
    killed: hpAfter === 0,
  };
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
  const targetEntity = entityAt(snapshot, target, "enemy");
  const hit = targetEntity && actor.normalAttackDamage && actor.normalAttackDamage > 0
    ? targetEntity.enemyAction
      ? calculateDirectionalHit({
          attackerId: actor.id,
          attackerCell: actor.cell,
          target: targetEntity,
          damage: actor.normalAttackDamage,
        })
      : previewBasicHit(actor.id, targetEntity, actor.normalAttackDamage)
    : undefined;
  return {
    accepted: true,
    direction,
    target,
    hasTarget: Boolean(targetEntity),
    ...(hit ? { hit } : {}),
  };
}

export function previewDash(
  source: PreviewSource,
  actorId: string,
  direction: Cell,
  distance?: number,
): DashPreview {
  const snapshot = snapshotOf(source);
  const actor = snapshot.entities.find((entity) => entity.id === actorId);
  const mobility = actor ? activeMobility(actor) : undefined;
  if (!actor || actor.phase !== "alive") {
    return { accepted: false, direction, path: [], victims: [], reason: "Actor is not active." };
  }
  if (!isCardinalDirection(direction)) {
    return { accepted: false, direction, path: [], victims: [], reason: "Direction must be cardinal." };
  }
  if (!mobility || mobility.kind !== "dash") {
    return { accepted: false, direction, path: [], victims: [], reason: "Active Mobility is not Dash." };
  }
  if (mobility.remainingCooldown > 0) {
    return { accepted: false, direction, path: [], victims: [], reason: "Mobility is on cooldown." };
  }
  const requestedDistance = distance ?? mobility.range;
  if (!Number.isInteger(requestedDistance) || requestedDistance < 1 || requestedDistance > mobility.range) {
    return {
      accepted: false,
      direction,
      path: [],
      victims: [],
      reason: `Dash distance must be between one and ${mobility.range} cells.`,
    };
  }

  const path: Cell[] = [];
  const victims: MobilityHitPreview[] = [];
  let landing: Cell | undefined;
  for (let step = 1; step <= requestedDistance; step += 1) {
    const candidate = add(actor.cell, multiply(direction, step));
    if (!isWalkable(snapshot, candidate, true)) break;
    path.push(candidate);
    const enemy = entityAt(snapshot, candidate, "enemy");
    if (enemy) {
      if (mobility.damage > 0) {
        victims.push(previewMobilityHit(actor, enemy, add(enemy.cell, multiply(direction, -1)), mobility.damage, mobility.staggerMultiplier));
      }
    } else {
      landing = candidate;
    }
  }

  if (!landing) {
    return { accepted: false, direction, path, victims, reason: "Dash has no legal landing cell." };
  }

  return {
    accepted: true,
    direction,
    path,
    landing,
    victims,
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
  const mobility = actor ? activeMobility(actor) : undefined;
  if (!actor || actor.phase !== "alive") {
    return { accepted: false, target, area, victims: [], reason: "Actor is not active." };
  }
  if (!mobility || (actor.mobility && mobility.kind !== "smash")) {
    return { accepted: false, target, area, victims: [], reason: "Active Mobility is not Smash." };
  }
  if (mobility.remainingCooldown > 0) {
    return { accepted: false, target, area, victims: [], reason: "Mobility is on cooldown." };
  }
  if (Math.abs(target.x - actor.cell.x) > mobility.range || Math.abs(target.y - actor.cell.y) > mobility.range) {
    return { accepted: false, target, area, victims: [], reason: "Smash target is out of range." };
  }
  if (!isWalkable(snapshot, target)) {
    return { accepted: false, target, area, victims: [], reason: "Smash landing is blocked." };
  }
  const victims = area.flatMap((cell) => {
    const enemy = entityAt(snapshot, cell, "enemy");
    return enemy && mobility.damage > 0
      ? [previewMobilityHit(actor, enemy, target, mobility.damage, mobility.staggerMultiplier)]
      : [];
  });
  return { accepted: true, target, area, victims };
}
