import type { CombatEvent } from "../events/combat-events";
import { isCardinalDirection, type Cell } from "../model/types";
import type { World } from "../world/world";
import type { GameCommand } from "./commands";
import { attackTarget, previewAttack, previewBasicHit, previewDash, previewSmash } from "./action-preview";

export interface ActionResolution {
  readonly accepted: boolean;
  readonly consumedTime?: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
  /** Full ordered event stream. `events` remains the gameplay-only compatibility view. */
  readonly semanticEvents?: readonly CombatEvent[];
}

function add(a: Cell, b: Cell): Cell {
  return { x: a.x + b.x, y: a.y + b.y };
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
    const hit = world.applyBasicHit(preview.hit);
    if (hit) {
      events[0] = { ...attackEvent, hit };
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

function finishAccepted(
  world: World,
  commandType: GameCommand["type"],
  events: readonly CombatEvent[],
): ActionResolution {
  const semanticEvents: CombatEvent[] = [
    {
      type: "command_resolved",
      commandType,
      accepted: true,
      consumedTime: true,
    },
    ...events,
    world.advancePlayerAction(),
  ];
  world.recordEvents(semanticEvents);
  return {
    accepted: true,
    consumedTime: true,
    events,
    semanticEvents,
  };
}

export function resolveCommand(world: World, command: GameCommand): ActionResolution {
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
