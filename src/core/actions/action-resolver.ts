import type { CombatEvent } from "../events/combat-events";
import type { BasicHitResult, DirectionalHitResult } from "../model/types";
import {
  isCardinalDirection,
  type Cell,
  type EntityState,
} from "../model/types";
import type { World } from "../world/world";
import type { GameCommand } from "./commands";
import { attackTarget, previewAttack, previewBasicHit, previewDash, previewSmash } from "./action-preview";
import {
  committedAttackFromDecision,
  decideBasicEnemyAction,
} from "../enemies/basic-enemy-actions";

export interface ActionResolution {
  readonly accepted: boolean;
  readonly consumedTime?: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
}

function add(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y };
}

function isDirectionalHit(hit: BasicHitResult | DirectionalHitResult): hit is DirectionalHitResult {
  return "angle" in hit && "guardDamage" in hit;
}

function multiply(cell: Cell, amount: number): Cell {
  return { x: cell.x * amount, y: cell.y * amount };
}

function knockDirection(from: Cell, center: Cell): Cell {
  const dx = Math.sign(from.x - center.x);
  const dy = Math.sign(from.y - center.y);

  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  if (Math.abs(from.x - center.x) > Math.abs(from.y - center.y)) {
    return { x: dx, y: 0 };
  }
  return { x: 0, y: dy };
}

function knockbackDestination(world: World, from: Cell, direction: Cell): Cell | undefined {
  for (const distance of [2, 1]) {
    const destination = add(from, multiply(direction, distance));
    if (!world.isInside(destination) || world.tileAt(destination) === "wall") continue;
    if (world.findAliveAt(destination)) continue;
    return destination;
  }
  return undefined;
}

function appendEnemyDamageEvents(
  world: World,
  events: CombatEvent[],
  attackerId: string,
  enemyId: string,
  damage: number,
): boolean {
  const enemy = world.requireEntity(enemyId);
  const preview = previewBasicHit(attackerId, enemy, damage);
  const hit = world.applyBasicHit(preview);
  if (!hit) return false;

  const target = world.requireEntity(hit.targetId);
  events.push({
    type: "enemy_damaged",
    enemyId: target.id,
    hit,
    hp: target.hp,
    maxHp: target.maxHp,
  });
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

function resolveMove(world: World, command: Extract<GameCommand, { type: "move" }>): ActionResolution {
  const actor = world.requireEntity(command.actorId);
  const destination = add(actor.cell, command.direction);

  if (actor.phase !== "alive") {
    return { accepted: false, consumedTime: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, consumedTime: false, reason: "Direction must be cardinal.", events: [] };
  }
  if (!world.isWalkable(destination)) {
    return { accepted: false, consumedTime: false, reason: "Destination is blocked.", events: [] };
  }

  world.moveEntity(actor.id, destination);
  const events: readonly CombatEvent[] = [
    {
      type: "actor_moved",
      entityId: actor.id,
      from: actor.cell,
      to: destination,
    },
  ];
  return finishAccepted(world, command.type, events);
}

function resolveAttack(world: World, command: Extract<GameCommand, { type: "attack" }>): ActionResolution {
  const actor = world.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, consumedTime: false, reason: "Actor is not active.", events: [] };
  }
  if (!isCardinalDirection(command.direction)) {
    return { accepted: false, consumedTime: false, reason: "Direction must be cardinal.", events: [] };
  }

  const preview = previewAttack(world, actor.id, command.direction);
  const attackEvent: CombatEvent = {
    type: "player_attacked",
    actorId: actor.id,
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
          if (targetBefore.committedAttack || targetBefore.recoveryTicks !== undefined || reservationBefore || telegraphBefore) {
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
  return finishAccepted(world, command.type, events);
}

function resolveDash(world: World, command: Extract<GameCommand, { type: "dash" }>): ActionResolution {
  const actor = world.requireEntity(command.actorId);
  const preview = previewDash(world, command.actorId, command.direction);
  if (!preview.accepted || !preview.landing) {
    return { accepted: false, consumedTime: false, reason: preview.reason, events: [] };
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
  if (actor.mobilityAttackDamage && actor.mobilityAttackDamage > 0) {
    const hitIds = new Set<string>();
    for (const cell of preview.path) {
      const enemy = world.findAliveAt(cell, "enemy");
      if (!enemy || hitIds.has(enemy.id)) continue;
      hitIds.add(enemy.id);
      appendEnemyDamageEvents(world, events, actor.id, enemy.id, actor.mobilityAttackDamage);
    }
  }
  world.moveEntity(actor.id, landing);
  return finishAccepted(world, command.type, events);
}

function resolveSmash(world: World, command: Extract<GameCommand, { type: "smash" }>): ActionResolution {
  const actor = world.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, consumedTime: false, reason: "Actor is not active.", events: [] };
  }

  const armedTarget = world.armedSmashTarget;
  if (!armedTarget) {
    const preview = previewSmash(world, command.actorId, command.target);
    if (!preview.accepted) {
      return { accepted: false, consumedTime: false, reason: preview.reason, events: [] };
    }
    world.armSmash(preview.target);
    return finishAccepted(world, command.type, [
      { type: "smash_armed", actorId: actor.id, target: preview.target },
    ]);
  }

  const releasePreview = previewSmash(world, command.actorId, armedTarget);
  if (!releasePreview.accepted) {
    return { accepted: false, consumedTime: false, reason: releasePreview.reason, events: [] };
  }
  world.clearArmedSmash();

  const events: CombatEvent[] = [{ type: "smash_impact", cell: armedTarget }];
  const centerEnemy = world.findAliveAt(armedTarget, "enemy");

  if (centerEnemy) {
    world.setPhase(centerEnemy.id, "dead");
    events.push({
      type: "enemy_crushed",
      enemyId: centerEnemy.id,
      cell: centerEnemy.cell,
    });
  }

  const nearbyEnemies = world
    .listAliveEnemiesAround(armedTarget, 1)
    .filter((enemy) => enemy.id !== centerEnemy?.id);

  for (const enemy of nearbyEnemies) {
    if (actor.mobilityAttackDamage && actor.mobilityAttackDamage > 0) {
      appendEnemyDamageEvents(world, events, actor.id, enemy.id, actor.mobilityAttackDamage);
      if (world.requireEntity(enemy.id).phase !== "alive") continue;
    }
    const direction = knockDirection(enemy.cell, armedTarget);
    if (direction.x === 0 && direction.y === 0) continue;

    const destination = knockbackDestination(world, enemy.cell, direction);
    if (!destination) continue;

    if (world.tileAt(destination) === "water") {
      world.moveEntityToPhase(enemy.id, destination, "drowning");
      events.push({
        type: "enemy_entered_water",
        enemyId: enemy.id,
        from: enemy.cell,
        waterCell: destination,
      });
      continue;
    }

    if (!world.findAliveAt(destination)) {
      world.moveEntity(enemy.id, destination);
      events.push({
        type: "enemy_knocked",
        enemyId: enemy.id,
        from: enemy.cell,
        to: destination,
      });
    }
  }

  world.moveEntity(actor.id, armedTarget);
  events.push({
    type: "actor_moved",
    entityId: actor.id,
    from: actor.cell,
    to: armedTarget,
  });

  return finishAccepted(world, command.type, events);
}

function enabledBasicEnemies(world: World): readonly EntityState[] {
  return world.listEntities().filter(
    (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
  );
}

function resolveEnemyPhase(world: World): CombatEvent[] {
  const enemies = enabledBasicEnemies(world);
  const readyAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "ready").map((enemy) => enemy.id),
  );
  const recoveringAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "recovering").map((enemy) => enemy.id),
  );
  const recoveredThisPhase = new Set<string>();
  const events: CombatEvent[] = [];

  for (const enemy of enemies) {
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "telegraphing") continue;
    const attack = world.decrementEnemyAttackWarning(enemy.id);
    if (!attack || attack.warningTicks > 0) continue;

    const resolution = world.resolveCommittedEnemyAttack(enemy.id);
    if (!resolution) continue;
    const telegraph = world.getTelegraph(enemy.id);
    events.push({
      type: "enemy_attack_detonated",
      enemyId: enemy.id,
      attack: resolution.attack,
      target: resolution.target,
      ...(resolution.damage ? { hit: resolution.damage } : {}),
    });
    if (resolution.damage) {
      const player = world.requireEntity(resolution.damage.targetId);
      events.push({
        type: "player_damaged",
        playerId: player.id,
        damage: resolution.damage,
        hp: player.hp,
        maxHp: player.maxHp,
      });
      if (resolution.damage.killed) {
        events.push({ type: "player_died", playerId: player.id, cell: player.cell });
      }
    }
    events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: true });
    events.push({ type: "enemy_recovering", enemyId: enemy.id, recoveryTicks: resolution.attack.recoveryTicks });
  }

  events.push(...world.advanceEnemyStatuses());

  for (const enemy of enemies) {
    if (!recoveringAtStart.has(enemy.id)) continue;
    if (world.advanceEnemyRecovery(enemy.id)) {
      recoveredThisPhase.add(enemy.id);
      events.push({ type: "enemy_recovered", enemyId: enemy.id });
    }
  }

  for (const enemy of enemies) {
    if (!readyAtStart.has(enemy.id) && !recoveredThisPhase.has(enemy.id)) continue;
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "ready") continue;
    const decision = decideBasicEnemyAction({
      enemy: current,
      playerCell: world.playerCell,
      canMove: (destination) => destination.x !== world.playerCell?.x || destination.y !== world.playerCell?.y
        ? world.isWalkable(destination)
        : false,
    });

    switch (decision.type) {
      case "move": {
        const from = current.cell;
        const reservation = world.requestReservation({
          ownerId: enemy.id,
          purpose: "movement",
          activeStep: true,
          cells: [decision.destination],
        });
        if (!reservation.granted) {
          world.setEnemyDecision(enemy.id, "wait");
          events.push({ type: "enemy_waited", enemyId: enemy.id });
          break;
        }
        world.setEnemyFacing(enemy.id, decision.facing);
        world.setEnemyDecision(enemy.id, "move");
        world.moveEntity(enemy.id, decision.destination);
        world.releaseReservation(enemy.id);
        events.push({ type: "enemy_moved", enemyId: enemy.id, from, to: decision.destination });
        break;
      }
      case "attack": {
        const cells = decision.cells.filter((cell) => world.isInside(cell));
        world.setEnemyFacing(enemy.id, decision.facing);
        world.setEnemyDecision(enemy.id, "attack");
        const committed = world.commitEnemyAttack(
          enemy.id,
          committedAttackFromDecision({ ...decision, cells }),
        );
        events.push({ type: "enemy_attack_committed", enemyId: enemy.id, attack: committed });
        const telegraph = world.getTelegraph(enemy.id);
        if (telegraph) events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: false });
        break;
      }
      case "wait":
        world.setEnemyDecision(enemy.id, "wait");
        events.push({ type: "enemy_waited", enemyId: enemy.id });
        break;
    }
  }

  return events;
}

function finishAccepted(
  world: World,
  commandType: GameCommand["type"],
  events: readonly CombatEvent[],
): ActionResolution {
  const advanced = world.advancePlayerAction();
  const enemyEvents = resolveEnemyPhase(world);
  const outcome = world.updateEncounterOutcome();
  const completeEvents: CombatEvent[] = [
    {
      type: "command_resolved",
      commandType,
      accepted: true,
      consumedTime: true,
    },
    ...events,
    ...enemyEvents,
    ...(outcome && outcome !== "running" ? [{ type: "encounter_ended", outcome } as const] : []),
    advanced,
  ];
  world.recordEvents(completeEvents);
  return {
    accepted: true,
    consumedTime: true,
    events: completeEvents,
  };
}

export function resolveCommand(world: World, command: GameCommand): ActionResolution {
  if (world.outcome !== "running") {
    return { accepted: false, consumedTime: false, reason: "Encounter has ended.", events: [] };
  }

  switch (command.type) {
    case "move":
      return resolveMove(world, command);
    case "smash":
      return resolveSmash(world, command);
    case "attack":
      return resolveAttack(world, command);
    case "dash":
      return resolveDash(world, command);
  }
}
