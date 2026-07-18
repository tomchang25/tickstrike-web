import type { CombatEvent } from "../events/combat-events";
import { isCardinalDirection, type Cell } from "../model/types";
import type { World } from "../world/world";
import type { GameCommand } from "./commands";

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
  if (Math.abs(from.x - center.x) >= Math.abs(from.y - center.y)) {
    return { x: dx, y: 0 };
  }
  return { x: 0, y: dy };
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

function resolveSmash(world: World, command: Extract<GameCommand, { type: "smash" }>): ActionResolution {
  const actor = world.requireEntity(command.actorId);
  if (actor.phase !== "alive") {
    return { accepted: false, consumedTime: false, reason: "Actor is not active.", events: [] };
  }

  const events: CombatEvent[] = [{ type: "smash_impact", cell: command.target }];
  const centerEnemy = world.findAliveAt(command.target, "enemy");

  if (centerEnemy) {
    world.setPhase(centerEnemy.id, "dead");
    events.push({
      type: "enemy_crushed",
      enemyId: centerEnemy.id,
      cell: centerEnemy.cell,
    });
  }

  const nearbyEnemies = world
    .listAliveEnemiesAround(command.target, 1)
    .filter((enemy) => enemy.id !== centerEnemy?.id);

  for (const enemy of nearbyEnemies) {
    const direction = knockDirection(enemy.cell, command.target);
    if (direction.x === 0 && direction.y === 0) continue;

    const destination = add(enemy.cell, multiply(direction, 2));
    if (!world.isInside(destination) || world.tileAt(destination) === "wall") continue;

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
  }
}
