import type { CombatEvent } from "../events/combat-events";
import type { BasicHitResult, DirectionalHitResult, EntityId, EntityState, WorldSnapshot } from "../model/types";
import { isCardinalDirection, type Cell } from "../model/types";
import type { CombatOperations, GridBoard, WorldView } from "../world/world";
import type { GameCommand } from "./commands";
import {
  attackTarget,
  previewAttack,
  previewDash,
  previewSmash,
  type MobilityHitPreview,
  type SmashVictimPreview,
} from "./action-preview";

/**
 * The capability handle the player action phase receives instead of the whole
 * `World` (hardening spec d): the read-only {@link WorldView} plus the `board`
 * and `combat` subsystems it reads and applies hits through, `snapshot()` for
 * the pure-read previews, and the world-owned orchestration a player action
 * performs. It cannot reach wave, run, or enemy-combat lifecycle state. `World`
 * satisfies it structurally, so `action-resolver` passes a `World` directly.
 */
export interface PlayerActionContext extends WorldView {
  readonly board: GridBoard;
  readonly combat: CombatOperations;
  snapshot(): WorldSnapshot;
  moveEntity(id: EntityId, to: Cell): void;
  moveEntityToPhase(id: EntityId, to: Cell, phase: EntityState["phase"]): void;
  setPhase(id: EntityId, phase: EntityState["phase"]): void;
  preparePlayerAction(id: EntityId): void;
  beginMobilityInvulnerability(id: EntityId): void;
  setMobilityCooldown(id: EntityId, cooldown: number): void;
  armSmash(target: Cell): void;
  clearArmedSmash(): void;
}

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
  context: PlayerActionContext,
  events: CombatEvent[],
  preview: MobilityHitPreview | { readonly hit: BasicHitResult | DirectionalHitResult },
): boolean {
  const targetBefore = context.requireEntity(preview.hit.targetId);
  const reservationBefore = context.board.getReservation(preview.hit.targetId);
  const telegraphBefore = context.board.getTelegraph(preview.hit.targetId);
  const hit = isDirectionalHit(preview.hit)
    ? context.combat.applyDirectionalHit(preview.hit)
    : context.combat.applyBasicHit(preview.hit);
  if (!hit) {
    return false;
  }

  const target = context.requireEntity(hit.targetId);
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
        ...(target.protectionTicks !== undefined ? { protectionTicks: target.protectionTicks } : {}),
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
      const staggered = context.requireEntity(target.id);
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

function resolveSmashVictim(context: PlayerActionContext, events: CombatEvent[], victim: SmashVictimPreview): void {
  if (victim.displacement === "crush") {
    const enemy = context.requireEntity(victim.enemyId);
    if (victim.hit) {
      appendEnemyHitEvents(context, events, { hit: victim.hit });
    }
    if (context.requireEntity(enemy.id).phase === "alive") {
      context.setPhase(enemy.id, "dead");
    }
    events.push({ type: "enemy_crushed", enemyId: enemy.id, cell: victim.origin });
    return;
  }

  if (!victim.hit || !appendEnemyHitEvents(context, events, { hit: victim.hit })) {
    return;
  }
  if ((victim.displacement !== "knockback" && victim.displacement !== "water") || !victim.destination) {
    return;
  }

  const enemy = context.requireEntity(victim.enemyId);
  if (enemy.phase !== "alive") {
    return;
  }
  if (victim.displacement === "water") {
    context.moveEntityToPhase(enemy.id, victim.destination, "drowning");
    events.push({
      type: "enemy_entered_water",
      enemyId: enemy.id,
      from: victim.origin,
      waterCell: victim.destination,
    });
    return;
  }

  context.moveEntity(enemy.id, victim.destination);
  events.push({
    type: "enemy_knocked",
    enemyId: enemy.id,
    from: victim.origin,
    to: victim.destination,
  });
}

function resolveMove(
  context: PlayerActionContext,
  command: Extract<GameCommand, { type: "move" }>,
): PlayerActionResult {
  const actor = context.requireEntity(command.actorId);
  const destination = add(actor.cell, command.direction);

  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, reason: "Direction must be cardinal.", events: [] };
  }
  if (!context.board.isWalkable(destination)) {
    return { accepted: false, reason: "Destination is blocked.", events: [] };
  }

  context.preparePlayerAction(actor.id);
  context.moveEntity(actor.id, destination);
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
  context: PlayerActionContext,
  command: Extract<GameCommand, { type: "attack" }>,
): PlayerActionResult {
  const actor = context.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, reason: "Direction must be cardinal.", events: [] };
  }

  const preview = previewAttack(context, actor.id, command.direction);
  context.preparePlayerAction(actor.id);
  const attackEvent: CombatEvent = {
    type: "player_attacked",
    actorId: actor.id,
    direction: command.direction,
    target: attackTarget(actor.cell, command.direction),
  };
  const events: CombatEvent[] = [attackEvent];

  if (preview.hit) {
    const targetBefore = context.requireEntity(preview.hit.targetId);
    const reservationBefore = context.board.getReservation(preview.hit.targetId);
    const telegraphBefore = context.board.getTelegraph(preview.hit.targetId);
    const hit = isDirectionalHit(preview.hit)
      ? context.combat.applyDirectionalHit(preview.hit)
      : context.combat.applyBasicHit(preview.hit);
    if (hit) {
      events[0] = { ...attackEvent, hit };
      const target = context.requireEntity(hit.targetId);
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
            ...(target.protectionTicks !== undefined ? { protectionTicks: target.protectionTicks } : {}),
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
          const staggered = context.requireEntity(target.id);
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
  context: PlayerActionContext,
  command: Extract<GameCommand, { type: "dash" }>,
): PlayerActionResult {
  const actor = context.requireEntity(command.actorId);
  if (actor.mobility && actor.mobility.kind !== "dash") {
    return { accepted: false, reason: "Active Mobility is not Dash.", events: [] };
  }
  if (actor.mobility && actor.mobility.remainingCooldown > 0) {
    return { accepted: false, reason: "Mobility is on cooldown.", events: [] };
  }
  const preview = previewDash(context, command.actorId, command.direction, command.distance);
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
  context.preparePlayerAction(actor.id);
  context.beginMobilityInvulnerability(actor.id);
  for (const victim of preview.victims) {
    appendEnemyHitEvents(context, events, victim);
  }
  context.moveEntity(actor.id, landing);
  if (actor.mobility) {
    context.setMobilityCooldown(actor.id, actor.mobility.cooldown);
  }
  return { accepted: true, events };
}

function resolveSmash(
  context: PlayerActionContext,
  command: Extract<GameCommand, { type: "smash" }>,
): PlayerActionResult {
  const actor = context.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, reason: "Actor is not active.", events: [] };
  }
  if (actor.mobility && actor.mobility.kind !== "smash") {
    return { accepted: false, reason: "Active Mobility is not Smash.", events: [] };
  }
  if (actor.mobility && actor.mobility.remainingCooldown > 0) {
    return { accepted: false, reason: "Mobility is on cooldown.", events: [] };
  }

  const armedTarget = context.armedSmashTarget;
  if (!armedTarget) {
    const preview = previewSmash(context, command.actorId, command.target);
    if (!preview.accepted) {
      return { accepted: false, reason: preview.reason, events: [] };
    }
    context.preparePlayerAction(actor.id);
    context.armSmash(preview.target);
    return {
      accepted: true,
      events: [{ type: "smash_armed", actorId: actor.id, target: preview.target }],
    };
  }

  const releasePreview = previewSmash(context, command.actorId, armedTarget);
  if (!releasePreview.accepted) {
    return { accepted: false, reason: releasePreview.reason, events: [] };
  }
  context.clearArmedSmash();
  context.preparePlayerAction(actor.id);
  context.beginMobilityInvulnerability(actor.id);

  const events: CombatEvent[] = [{ type: "smash_impact", cell: armedTarget }];
  for (const victim of releasePreview.victims) {
    resolveSmashVictim(context, events, victim);
  }

  context.setMobilityCooldown(actor.id, actor.mobility?.cooldown ?? 0);
  context.moveEntity(actor.id, armedTarget);
  events.push({
    type: "actor_moved",
    entityId: actor.id,
    from: actor.cell,
    to: armedTarget,
  });

  return { accepted: true, events };
}

export function resolvePlayerAction(context: PlayerActionContext, command: GameCommand): PlayerActionResult {
  switch (command.type) {
    case "move":
      return resolveMove(context, command);
    case "attack":
      return resolveAttack(context, command);
    case "dash":
      return resolveDash(context, command);
    case "smash":
      return resolveSmash(context, command);
  }
}
