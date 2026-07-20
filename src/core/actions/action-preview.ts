import {
  isCardinalDirection,
  sameCell,
  type BasicHitResult,
  type Cell,
  type DirectionalHitResult,
  type EntityId,
  type EntityState,
  type MobilityKind,
  type SmashDisplacementKind,
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
  readonly victims: readonly SmashVictimPreview[];
  readonly reason?: string;
}

export interface MobilityHitPreview {
  readonly enemyId: EntityId;
  readonly origin: Cell;
  readonly victimCell: Cell;
  readonly hit: BasicHitResult | DirectionalHitResult;
}

export interface SmashVictimPreview {
  readonly enemyId: EntityId;
  readonly origin: Cell;
  readonly hit?: BasicHitResult | DirectionalHitResult;
  readonly displacement: SmashDisplacementKind;
  readonly destination?: Cell;
}

export type PreviewVictimOutcome = "kill" | "crush" | "knockback" | "water" | "blocked";

export interface PreviewVictimMarker {
  readonly enemyId: EntityId;
  readonly from: Cell;
  readonly to?: Cell;
  readonly outcome: PreviewVictimOutcome;
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

function entityAt(
  snapshot: WorldSnapshot,
  cell: Cell,
  kind?: EntityState["kind"],
): EntityState | undefined {
  return snapshot.entities.find((entity) => {
    if (entity.phase !== "alive" || (kind && entity.kind !== kind)) {
      return false;
    }
    return entity.footprint.some((occupied) => sameCell(occupied, cell));
  });
}

function isWalkable(snapshot: WorldSnapshot, cell: Cell, allowEnemyTraversal = false): boolean {
  if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    return false;
  }
  if (
    cell.x < 0 ||
    cell.y < 0 ||
    cell.x >= snapshot.arena.width ||
    cell.y >= snapshot.arena.height
  ) {
    return false;
  }
  if (snapshot.arena.terrain[cell.y * snapshot.arena.width + cell.x] !== "land") {
    return false;
  }
  if (
    snapshot.reservations.some((reservation) =>
      reservation.cells.some((reserved) => sameCell(reserved, cell)),
    )
  ) {
    return false;
  }
  const occupant = entityAt(snapshot, cell);
  return !occupant || (allowEnemyTraversal && occupant.kind === "enemy");
}

function activeMobility(actor: EntityState):
  | {
      readonly kind: MobilityKind;
      readonly damage: number;
      readonly range: number;
      readonly staggerMultiplier: number;
      readonly remainingCooldown: number;
    }
  | undefined {
  if (actor.mobility) {
    return actor.mobility;
  }
  return {
    kind: "dash",
    damage: actor.mobilityAttackDamage ?? 0,
    range: 3,
    staggerMultiplier: 1,
    remainingCooldown: 0,
  };
}

/** Only an actual Dash hit passes these; Smash and Normal Attack never consume either trigger. */
export interface DashHitTriggers {
  readonly guardShredder: boolean;
  readonly execution: boolean;
}

function previewMobilityHit(
  actor: EntityState,
  target: EntityState,
  origin: Cell,
  damage: number,
  staggerMultiplier: number,
  triggers?: DashHitTriggers,
): MobilityHitPreview {
  const directional = target.facing
    ? calculateDirectionalHit({
        attackerId: actor.id,
        attackerCell: origin,
        target,
        damage,
        staggerMultiplier,
        guardShredderTrigger: triggers?.guardShredder,
        executionTrigger: triggers?.execution,
      })
    : undefined;
  return {
    enemyId: target.id,
    origin,
    victimCell: target.cell,
    hit: directional ?? previewBasicHit(actor.id, target, damage),
  };
}

function knockDirection(from: Cell, center: Cell): Cell {
  const dx = Math.sign(from.x - center.x);
  const dy = Math.sign(from.y - center.y);
  if (dx === 0 && dy === 0) {
    return { x: 0, y: 0 };
  }
  if (Math.abs(from.x - center.x) > Math.abs(from.y - center.y)) {
    return { x: dx, y: 0 };
  }
  return { x: 0, y: dy };
}

function translatedFootprint(entity: EntityState, destination: Cell): readonly Cell[] {
  const dx = destination.x - entity.cell.x;
  const dy = destination.y - entity.cell.y;
  return entity.footprint.map((cell) => ({ x: cell.x + dx, y: cell.y + dy }));
}

function footprintKeys(cells: readonly Cell[]): readonly string[] {
  return cells.map((cell) => `${cell.x},${cell.y}`);
}

function displacementCandidate(
  snapshot: WorldSnapshot,
  entity: EntityState,
  destination: Cell,
  occupied: ReadonlySet<string>,
): boolean {
  const footprint = translatedFootprint(entity, destination);
  return footprint.every((cell) => {
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= snapshot.arena.width ||
      cell.y >= snapshot.arena.height
    ) {
      return false;
    }
    if (snapshot.arena.tiles[cell.y * snapshot.arena.width + cell.x] === "wall") {
      return false;
    }
    if (
      snapshot.reservations.some((reservation) =>
        reservation.cells.some((reserved) => sameCell(reserved, cell)),
      )
    ) {
      return false;
    }
    return !occupied.has(`${cell.x},${cell.y}`);
  });
}

function smashVictimPreviews(
  snapshot: WorldSnapshot,
  actor: EntityState,
  target: Cell,
  mobility: { readonly damage: number; readonly staggerMultiplier: number },
): readonly SmashVictimPreview[] {
  const victimsById = new Map<string, EntityState>();
  for (const cell of smashArea(target)) {
    const enemy = entityAt(snapshot, cell, "enemy");
    if (enemy) {
      victimsById.set(enemy.id, enemy);
    }
  }

  const victims = [...victimsById.values()].sort((a, b) => {
    const aCenter = sameCell(a.cell, target) ? 0 : 1;
    const bCenter = sameCell(b.cell, target) ? 0 : 1;
    return aCenter - bCenter || a.id.localeCompare(b.id);
  });
  const occupied = new Set(
    snapshot.entities
      .filter((entity) => entity.phase === "alive")
      .flatMap((entity) => footprintKeys(entity.footprint)),
  );
  const results: SmashVictimPreview[] = [];

  for (const enemy of victims) {
    for (const key of footprintKeys(enemy.footprint)) {
      occupied.delete(key);
    }
    const direction = knockDirection(enemy.cell, target);
    const hit =
      mobility.damage > 0
        ? previewMobilityHit(actor, enemy, target, mobility.damage, mobility.staggerMultiplier).hit
        : undefined;
    if (direction.x === 0 && direction.y === 0) {
      results.push({
        enemyId: enemy.id,
        origin: enemy.cell,
        ...(hit ? { hit } : {}),
        displacement: hit?.killed ? "none" : "crush",
      });
      continue;
    }

    if (!hit || hit.killed) {
      results.push({
        enemyId: enemy.id,
        origin: enemy.cell,
        ...(hit ? { hit } : {}),
        displacement: "none",
      });
      continue;
    }

    let destination: Cell | undefined;
    for (const distance of [2, 1]) {
      const candidate = add(enemy.cell, multiply(direction, distance));
      if (displacementCandidate(snapshot, enemy, candidate, occupied)) {
        destination = candidate;
        break;
      }
    }
    if (!destination) {
      for (const key of footprintKeys(enemy.footprint)) {
        occupied.add(key);
      }

      results.push({ enemyId: enemy.id, origin: enemy.cell, hit, displacement: "blocked" });
      continue;
    }

    const isWater =
      snapshot.arena.tiles[destination.y * snapshot.arena.width + destination.x] === "water";

    if (!isWater) {
      for (const key of footprintKeys(translatedFootprint(enemy, destination))) {
        occupied.add(key);
      }
    }

    results.push({
      enemyId: enemy.id,
      origin: enemy.cell,
      hit,
      displacement: isWater ? "water" : "knockback",
      destination,
    });
  }

  return results;
}

export function attackTarget(origin: Cell, direction: Cell): Cell {
  return add(origin, direction);
}

export function previewBasicHit(
  attackerId: EntityId,
  target: EntityState,
  damage: number,
): BasicHitResult {
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

export function previewAttackVictimMarkers(preview: AttackPreview): readonly PreviewVictimMarker[] {
  return preview.accepted && preview.hit?.killed
    ? [{ enemyId: preview.hit.targetId, from: preview.target, outcome: "kill" }]
    : [];
}

export function previewDashVictimMarkers(preview: DashPreview): readonly PreviewVictimMarker[] {
  return preview.accepted
    ? preview.victims
        .filter((victim) => victim.hit.killed)
        .map((victim) => ({ enemyId: victim.enemyId, from: victim.victimCell, outcome: "kill" }))
    : [];
}

export function previewSmashVictimMarkers(preview: SmashPreview): readonly PreviewVictimMarker[] {
  return preview.accepted
    ? preview.victims.flatMap((victim): readonly PreviewVictimMarker[] => {
        if (victim.displacement === "crush") {
          return [{ enemyId: victim.enemyId, from: victim.origin, outcome: "crush" as const }];
        }
        if (victim.displacement === "knockback" || victim.displacement === "water") {
          return victim.destination
            ? [
                {
                  enemyId: victim.enemyId,
                  from: victim.origin,
                  to: victim.destination,
                  outcome: victim.displacement,
                },
              ]
            : [];
        }
        if (victim.displacement === "blocked") {
          return [{ enemyId: victim.enemyId, from: victim.origin, outcome: "blocked" as const }];
        }
        return victim.hit?.killed
          ? [{ enemyId: victim.enemyId, from: victim.origin, outcome: "kill" as const }]
          : [];
      })
    : [];
}

export function previewAttack(
  source: PreviewSource,
  actorId: string,
  direction: Cell,
): AttackPreview {
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
  const hit =
    targetEntity && actor.normalAttackDamage && actor.normalAttackDamage > 0
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
    return {
      accepted: false,
      direction,
      path: [],
      victims: [],
      reason: "Direction must be cardinal.",
    };
  }
  if (!mobility || mobility.kind !== "dash") {
    return {
      accepted: false,
      direction,
      path: [],
      victims: [],
      reason: "Active Mobility is not Dash.",
    };
  }
  if (mobility.remainingCooldown > 0) {
    return {
      accepted: false,
      direction,
      path: [],
      victims: [],
      reason: "Mobility is on cooldown.",
    };
  }
  const requestedDistance = distance ?? mobility.range;
  if (
    !Number.isInteger(requestedDistance) ||
    requestedDistance < 1 ||
    requestedDistance > mobility.range
  ) {
    return {
      accepted: false,
      direction,
      path: [],
      victims: [],
      reason: `Dash distance must be between one and ${mobility.range} cells.`,
    };
  }

  // Acquired build triggers apply only to this actual Dash's hits; Smash's shared preview helper
  // never receives them.
  const triggers: DashHitTriggers = {
    guardShredder: snapshot.runBuild.triggers.includes("guard-shredder"),
    execution: snapshot.runBuild.triggers.includes("execution"),
  };

  const path: Cell[] = [];
  const victims: Array<{ readonly step: number; readonly preview: MobilityHitPreview }> = [];
  let landing: Cell | undefined;
  let landingStep = -1;
  for (let step = 1; step <= requestedDistance; step += 1) {
    const candidate = add(actor.cell, multiply(direction, step));
    if (!isWalkable(snapshot, candidate, true)) {
      break;
    }
    path.push(candidate);
    const enemy = entityAt(snapshot, candidate, "enemy");
    if (enemy) {
      if (mobility.damage > 0) {
        victims.push({
          step,
          preview: previewMobilityHit(
            actor,
            enemy,
            add(enemy.cell, multiply(direction, -1)),
            mobility.damage,
            mobility.staggerMultiplier,
            triggers,
          ),
        });
      }
    } else {
      landing = candidate;
      landingStep = step;
    }
  }

  if (!landing) {
    return {
      accepted: false,
      direction,
      path,
      victims: victims.map(({ preview }) => preview),
      reason: "Dash has no legal landing cell.",
    };
  }

  const travelPath = path.slice(0, landingStep);

  return {
    accepted: true,
    direction,
    path: travelPath,
    landing,
    victims: victims.filter(({ step }) => step <= landingStep).map(({ preview }) => preview),
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
  if (
    Math.abs(target.x - actor.cell.x) > mobility.range ||
    Math.abs(target.y - actor.cell.y) > mobility.range
  ) {
    return { accepted: false, target, area, victims: [], reason: "Smash target is out of range." };
  }
  const landingOccupant = entityAt(snapshot, target);
  const landingReserved = snapshot.reservations.some((reservation) =>
    reservation.cells.some((cell) => sameCell(cell, target)),
  );
  const targetTile = snapshot.arena.tiles[target.y * snapshot.arena.width + target.x];
  const landingLegal =
    Number.isInteger(target.x) &&
    Number.isInteger(target.y) &&
    target.x >= 0 &&
    target.y >= 0 &&
    target.x < snapshot.arena.width &&
    target.y < snapshot.arena.height &&
    targetTile !== "wall" &&
    targetTile !== "water" &&
    !landingReserved &&
    (!landingOccupant || landingOccupant.kind === "enemy");
  if (!landingLegal) {
    return { accepted: false, target, area, victims: [], reason: "Smash landing is blocked." };
  }
  const victims = smashVictimPreviews(snapshot, actor, target, mobility);
  return { accepted: true, target, area, victims };
}
