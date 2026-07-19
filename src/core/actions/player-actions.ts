import type { CombatEvent } from "../events/combat-events";
import type { BasicHitResult, DirectionalHitResult } from "../model/types";
import { isCardinalDirection, type Cell } from "../model/types";
import type { World } from "../world/world";
import type { GameCommand } from "./commands";
import {
  attackTarget,
  previewAttack,
  previewDash,
  previewSmash,
  type MobilityHitPreview,
  type SmashVictimPreview,
} from "./action-preview";

export interface PlayerActionResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
}

function add(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y };
}

function isDirectionalHit(hit: BasicHitResult | DirectionalHitResult): hit is DirectionalHitResult {
  return "angle" in hit && "guardDamage" in hit;
}

function appendEnemyHitEvents(
  world: World,
  events: CombatEvent[],
  preview: MobilityHitPreview | { readonly hit: BasicHitResult | DirectionalHitResult },
): boolean {
  const targetBefore = world.requireEntity(preview.hit.targetId);
  const reservationBefore = world.getReservation(preview.hit.targetId);
  const telegraphBefore = world.getTelegraph(preview.hit.targetId);
  const hit = isDirectionalHit(preview.hit)
    ? world.applyDirectionalHit(preview.hit)
    : world.applyBasicHit(preview.hit);
  if (!hit) {
    return false;
  }

  const target = world.requireEntity(hit.targetId);
  if (isDirectionalHit(hit)) {
    events.push({
      type: "directional_hit",
      attackerId: hit.attackerId,
      targetId: hit.targetId,
      hit,
    });
    if (hit.guardDamage > 0 && target.guard) {
      events.push({
        type: "enemy_guard_damaged",
        enemyId: target.id,
        damage: hit.guardDamage,
        guard: target.guard.current,
        maxGuard: target.guard.max,
        ...(target.protectionTicks !== undefined
          ? { protectionTicks: target.protectionTicks }
          : {}),
      });
    }
  }
  events.push({
    type: "enemy_damaged",
    enemyId: target.id,
    hit,
    hp: target.hp,
    maxHp: target.maxHp,
  });
  if (isDirectionalHit(hit) && hit.guardBroken) {
    events.push({
      type: "enemy_guard_broken",
      enemyId: target.id,
      ...(target.staggerTicks !== undefined ? { staggerTicks: target.staggerTicks } : {}),
    });
    if (!hit.killed && hit.staggerBurst) {
      if (
        targetBefore.committedAttack ||
        targetBefore.recoveryTicks !== undefined ||
        reservationBefore ||
        telegraphBefore
      ) {
        events.push({ type: "enemy_attack_interrupted", enemyId: target.id });
      }
      const staggered = world.requireEntity(target.id);
      if (staggered.staggerTicks !== undefined) {
        events.push({
          type: "enemy_staggered",
          enemyId: target.id,
          ticks: staggered.staggerTicks,
        });
      }
    }
  }
  if (hit.killed) {
    events.push({
      type: "enemy_died",
      enemyId: target.id,
      attackerId: hit.attackerId,
      cell: target.cell,
    });
  }
  return true;
}

function resolveSmashVictim(world: World, events: CombatEvent[], victim: SmashVictimPreview): void {
  if (victim.displacement === "crush") {
    const enemy = world.requireEntity(victim.enemyId);
    if (victim.hit) {
      appendEnemyHitEvents(world, events, { hit: victim.hit });
    }
    if (world.requireEntity(enemy.id).phase === "alive") {
      world.setPhase(enemy.id, "dead");
    }
    events.push({ type: "enemy_crushed", enemyId: enemy.id, cell: victim.origin });
    return;
  }

  if (!victim.hit || !appendEnemyHitEvents(world, events, { hit: victim.hit })) {
    return;
  }
  if (
    (victim.displacement !== "knockback" && victim.displacement !== "water") ||
    !victim.destination
  ) {
    return;
  }

  const enemy = world.requireEntity(victim.enemyId);
  if (enemy.phase !== "alive") {
    return;
  }
  if (victim.displacement === "water") {
    world.moveEntityToPhase(enemy.id, victim.destination, "drowning");
    events.push({
      type: "enemy_entered_water",
      enemyId: enemy.id,
      from: victim.origin,
      waterCell: victim.destination,
    });
    return;
  }

  world.moveEntity(enemy.id, victim.destination);
  events.push({
    type: "enemy_knocked",
    enemyId: enemy.id,
    from: victim.origin,
    to: victim.destination,
  });
}

function resolveMove(
  world: World,
  command: Extract<GameCommand, { type: "move" }>,
): PlayerActionResult {
  const actor = world.requireEntity(command.actorId);
  const destination = add(actor.cell, command.direction);

  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, reason: "Direction must be cardinal.", events: [] };
  }
  if (!world.isWalkable(destination)) {
    return { accepted: false, reason: "Destination is blocked.", events: [] };
  }

  world.preparePlayerAction(actor.id);
  world.moveEntity(actor.id, destination);
  return {
    accepted: true,
    events: [
      {
        type: "actor_moved",
        entityId: actor.id,
        from: actor.cell,
        to: destination,
      },
    ],
  };
}

function resolveAttack(
  world: World,
  command: Extract<GameCommand, { type: "attack" }>,
): PlayerActionResult {
  const actor = world.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, reason: "Direction must be cardinal.", events: [] };
  }

  const preview = previewAttack(world, actor.id, command.direction);
  world.preparePlayerAction(actor.id);
  const attackEvent: CombatEvent = {
    type: "player_attacked",
    actorId: actor.id,
    direction: command.direction,
    target: attackTarget(actor.cell, command.direction),
  };
  const events: CombatEvent[] = [attackEvent];

  if (preview.hit) {
    const targetBefore = world.requireEntity(preview.hit.targetId);
    const reservationBefore = world.getReservation(preview.hit.targetId);
    const telegraphBefore = world.getTelegraph(preview.hit.targetId);
    const hit = isDirectionalHit(preview.hit)
      ? world.applyDirectionalHit(preview.hit)
      : world.applyBasicHit(preview.hit);
    if (hit) {
      events[0] = { ...attackEvent, hit };
      const target = world.requireEntity(hit.targetId);
      if (isDirectionalHit(hit)) {
        events.push({
          type: "directional_hit",
          attackerId: hit.attackerId,
          targetId: hit.targetId,
          hit,
        });
        if (hit.guardDamage > 0 && target.guard) {
          events.push({
            type: "enemy_guard_damaged",
            enemyId: target.id,
            damage: hit.guardDamage,
            guard: target.guard.current,
            maxGuard: target.guard.max,
            ...(target.protectionTicks !== undefined
              ? { protectionTicks: target.protectionTicks }
              : {}),
          });
        }
      }
      events.push({
        type: "enemy_damaged",
        enemyId: target.id,
        hit,
        hp: target.hp,
        maxHp: target.maxHp,
      });
      if (isDirectionalHit(hit) && hit.guardBroken) {
        events.push({
          type: "enemy_guard_broken",
          enemyId: target.id,
          ...(target.staggerTicks !== undefined ? { staggerTicks: target.staggerTicks } : {}),
        });
        if (!hit.killed && hit.staggerBurst) {
          if (
            targetBefore.committedAttack ||
            targetBefore.recoveryTicks !== undefined ||
            reservationBefore ||
            telegraphBefore
          ) {
            events.push({ type: "enemy_attack_interrupted", enemyId: target.id });
          }
          const staggered = world.requireEntity(target.id);
          if (staggered.staggerTicks !== undefined) {
            events.push({
              type: "enemy_staggered",
              enemyId: target.id,
              ticks: staggered.staggerTicks,
            });
          }
        }
      }
      if (hit.killed) {
        events.push({
          type: "enemy_died",
          enemyId: target.id,
          attackerId: hit.attackerId,
          cell: target.cell,
        });
      }
    }
  }
  return { accepted: true, events };
}

function resolveDash(
  world: World,
  command: Extract<GameCommand, { type: "dash" }>,
): PlayerActionResult {
  const actor = world.requireEntity(command.actorId);
  if (actor.mobility && actor.mobility.kind !== "dash") {
    return { accepted: false, reason: "Active Mobility is not Dash.", events: [] };
  }
  if (actor.mobility && actor.mobility.remainingCooldown > 0) {
    return { accepted: false, reason: "Mobility is on cooldown.", events: [] };
  }
  const preview = previewDash(world, command.actorId, command.direction, command.distance);
  if (!preview.accepted || !preview.landing) {
    return { accepted: false, reason: preview.reason, events: [] };
  }

  const landing = preview.landing;
  const events: CombatEvent[] = [
    {
      type: "player_dashed",
      actorId: actor.id,
      from: actor.cell,
      to: landing,
      path: preview.path,
    },
  ];
  world.preparePlayerAction(actor.id);
  world.beginMobilityInvulnerability(actor.id);
  for (const victim of preview.victims) {
    appendEnemyHitEvents(world, events, victim);
  }
  world.moveEntity(actor.id, landing);
  if (actor.mobility) {
    world.setMobilityCooldown(actor.id, actor.mobility.cooldown);
  }
  return { accepted: true, events };
}

function resolveSmash(
  world: World,
  command: Extract<GameCommand, { type: "smash" }>,
): PlayerActionResult {
  const actor = world.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (actor.mobility && actor.mobility.kind !== "smash") {
    return { accepted: false, reason: "Active Mobility is not Smash.", events: [] };
  }
  if (actor.mobility && actor.mobility.remainingCooldown > 0) {
    return { accepted: false, reason: "Mobility is on cooldown.", events: [] };
  }

  const armedTarget = world.armedSmashTarget;
  if (!armedTarget) {
    const preview = previewSmash(world, command.actorId, command.target);
    if (!preview.accepted) {
      return { accepted: false, reason: preview.reason, events: [] };
    }
    world.preparePlayerAction(actor.id);
    world.armSmash(preview.target);
    return {
      accepted: true,
      events: [{ type: "smash_armed", actorId: actor.id, target: preview.target }],
    };
  }

  const releasePreview = previewSmash(world, command.actorId, armedTarget);
  if (!releasePreview.accepted) {
    return { accepted: false, reason: releasePreview.reason, events: [] };
  }
  world.clearArmedSmash();
  world.preparePlayerAction(actor.id);
  world.beginMobilityInvulnerability(actor.id);

  const events: CombatEvent[] = [{ type: "smash_impact", cell: armedTarget }];
  for (const victim of releasePreview.victims) {
    resolveSmashVictim(world, events, victim);
  }

  world.setMobilityCooldown(actor.id, actor.mobility?.cooldown ?? 0);
  world.moveEntity(actor.id, armedTarget);
  events.push({
    type: "actor_moved",
    entityId: actor.id,
    from: actor.cell,
    to: armedTarget,
  });

  return { accepted: true, events };
}

export function resolvePlayerAction(world: World, command: GameCommand): PlayerActionResult {
  switch (command.type) {
    case "move":
      return resolveMove(world, command);
    case "attack":
      return resolveAttack(world, command);
    case "dash":
      return resolveDash(world, command);
    case "smash":
      return resolveSmash(world, command);
  }
}
