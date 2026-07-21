import { createShippedArena as createShippedArenaGeometry } from "@core/world/arena";
import { World } from "@core/world/world";
import type { Seed } from "@core/model/types";
import { actorCatalog } from "@content/actor-catalog";
import { resolveEnemyActionDefinition } from "@content/enemy-action-resolution";

export const SHIPPED_SCENARIO_SEED = "tick-arena-foundation";

export function createShippedArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  return new World(createShippedArenaGeometry(), seed);
}

export function createFoundationArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  const world = createShippedArena(seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const thrust = actorCatalog.enemies.find((enemy) => enemy.id === "thrust_enemy");
  const slash = actorCatalog.enemies.find((enemy) => enemy.id === "slash_enemy");
  const ranged = actorCatalog.enemies.find((enemy) => enemy.id === "ranged_enemy");
  const charge = actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy");
  const bomb = actorCatalog.enemies.find((enemy) => enemy.id === "bomb_enemy");
  const smallGuard = actorCatalog.guards.find((guard) => guard.id === "small");
  const heavyGuard = actorCatalog.guards.find((guard) => guard.id === "heavy");
  if (!player || !thrust || !slash || !ranged || !charge || !bomb || !smallGuard || !heavyGuard) {
    throw new Error("Shipped combat content is incomplete.");
  }
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 6, y: 6 },
    hp: player.hp,
    normalAttackDamage: player.normalAttack.damage,
    mobility: {
      kind: player.mobility.kind,
      damage: player.mobility.damage,
      range: player.mobility.range,
      cooldown: player.mobility.cooldown,
      staggerMultiplier: player.mobility.staggerMultiplier,
    },
  });
  world.spawn({
    id: "enemy-thrust",
    kind: "enemy",
    archetype: "thrust",
    presentationId: thrust.presentation.id,
    cell: { x: 5, y: 6 },
    hp: thrust.hp,
    defense: thrust.defense,
    guardDefinition: smallGuard,
    enemyAction: resolveEnemyActionDefinition(thrust),
    facing: { x: 1, y: 0 },
  });
  world.spawn({
    id: "enemy-slash",
    kind: "enemy",
    archetype: "slash",
    presentationId: slash.presentation.id,
    cell: { x: 8, y: 6 },
    hp: slash.hp,
    defense: slash.defense,
    guardDefinition: smallGuard,
    enemyAction: resolveEnemyActionDefinition(slash),
    facing: { x: -1, y: 0 },
  });
  world.spawn({
    id: "enemy-ranged",
    kind: "enemy",
    archetype: "ranged",
    presentationId: ranged.presentation.id,
    cell: { x: 6, y: 4 },
    hp: ranged.hp,
    defense: ranged.defense,
    guardDefinition: smallGuard,
    enemyAction: resolveEnemyActionDefinition(ranged),
    facing: { x: 0, y: 1 },
  });
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    presentationId: charge.presentation.id,
    cell: { x: 6, y: 9 },
    hp: charge.hp,
    defense: charge.defense,
    guardDefinition: heavyGuard,
    enemyAction: resolveEnemyActionDefinition(charge),
    facing: { x: 0, y: -1 },
  });
  const bombGuard = bomb.guardId ? actorCatalog.guards.find((guard) => guard.id === bomb.guardId) : undefined;
  world.spawn({
    id: "enemy-bomb",
    kind: "enemy",
    archetype: "bomb",
    presentationId: bomb.presentation.id,
    cell: { x: 9, y: 9 },
    hp: bomb.hp,
    defense: bomb.defense,
    ...(bombGuard ? { guardDefinition: bombGuard } : {}),
    enemyAction: resolveEnemyActionDefinition(bomb),
    facing: { x: -1, y: 0 },
  });
  return world;
}
