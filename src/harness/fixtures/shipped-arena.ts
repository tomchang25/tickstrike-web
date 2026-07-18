import { createShippedArena as createShippedArenaGeometry } from "../../core/world/arena";
import { World } from "../../core/world/world";
import type { Seed } from "../../core/model/types";
import { actorCatalog } from "../../content/actor-catalog";

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
  if (!player || !thrust || !slash || !ranged) throw new Error("Shipped combat content is incomplete.");
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell: { x: 6, y: 6 },
    hp: player.hp,
    normalAttackDamage: player.normalAttack.damage,
    mobilityAttackDamage: player.mobility.damage,
  });
  world.spawn({
    id: "enemy-thrust",
    kind: "enemy",
    archetype: "thrust",
    cell: { x: 5, y: 6 },
    hp: thrust.hp,
  });
  world.spawn({
    id: "enemy-slash",
    kind: "enemy",
    archetype: "slash",
    cell: { x: 8, y: 6 },
    hp: slash.hp,
  });
  world.spawn({
    id: "enemy-ranged",
    kind: "enemy",
    archetype: "ranged",
    cell: { x: 6, y: 4 },
    hp: ranged.hp,
  });
  return world;
}
