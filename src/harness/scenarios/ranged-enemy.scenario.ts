import { actorCatalog } from "@content/actor-catalog";
import { resolveEnemyActionDefinition } from "@content/enemy-action-resolution";
import { createShippedArena as createShippedArenaGeometry } from "@core/world/arena";
import type { Seed } from "@core/model/types";
import { World } from "@core/world/world";
import type { TestScenario } from "../types";

const RANGED_SCENARIO_SEED = "ranged-enemy-foundation";

/**
 * Player and one Ranged enemy alone on the shipped board. Ranged starts inside its
 * minimum distance so its first decision is to back off into the band, and nothing
 * else on the board can displace the Player mid-sequence — the band policy is what
 * this scenario observes, so no other enemy belongs in it.
 */
export function createRangedArena(seed: Seed = RANGED_SCENARIO_SEED): World {
  const world = new World(createShippedArenaGeometry(), seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const ranged = actorCatalog.enemies.find((enemy) => enemy.id === "ranged_enemy");
  const smallGuard = actorCatalog.guards.find((guard) => guard.id === "small");
  if (!player || !ranged || !smallGuard) {
    throw new Error("Ranged scenario content is incomplete.");
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
  return world;
}

export const scenarios: readonly TestScenario[] = [
  {
    id: "ranged-enemy",
    title: "Ranged Enemy / Distance Band",
    description:
      "One Ranged enemy inside its minimum distance backs off into its band, rests, then locks its Cross attack on the stationary Player.",
    seed: RANGED_SCENARIO_SEED,
    createWorld(seed) {
      return createRangedArena(seed ?? RANGED_SCENARIO_SEED);
    },
  },
];
