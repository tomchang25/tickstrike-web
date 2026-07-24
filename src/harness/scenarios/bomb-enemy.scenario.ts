import { actorCatalog } from "@content/actor-catalog";
import { resolveEnemyActionDefinition } from "@content/enemy-action-resolution";
import { createShippedArena as createShippedArenaGeometry } from "@core/world/arena";
import type { Seed } from "@core/model/types";
import { World } from "@core/world/world";
import type { TestScenario } from "../types";

const BOMB_SCENARIO_SEED = "bomb-enemy-foundation";

/**
 * Player and one Bomb enemy alone on the shipped board, with Bomb spawned orthogonally adjacent so
 * its first decision is to commit its self-destruct from the adjacent ring — no approach needed.
 * The bomb spec then only advances the fuse with in-place commands, which keeps it a focused
 * presentation-and-cleanup test instead of a pathfinding walk. See
 * dev/standards/test_economy_standard.md.
 */
export function createBombArena(seed: Seed = BOMB_SCENARIO_SEED): World {
  const world = new World(createShippedArenaGeometry(), seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const bomb = actorCatalog.enemies.find((enemy) => enemy.id === "bomb_enemy");
  if (!player || !bomb) {
    throw new Error("Bomb scenario content is incomplete.");
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
    id: "enemy-bomb",
    kind: "enemy",
    archetype: "bomb",
    presentationId: bomb.presentation.id,
    cell: { x: 7, y: 6 },
    hp: bomb.hp,
    defense: bomb.defense,
    enemyAction: resolveEnemyActionDefinition(bomb),
    facing: { x: -1, y: 0 },
  });
  return world;
}

export const scenarios: readonly TestScenario[] = [
  {
    id: "bomb-enemy",
    title: "Bomb Enemy / Adjacent Self-Destruct",
    description:
      "One Bomb enemy spawned adjacent to the Player commits its self-destruct on the first command, then counts its fuse down to detonation.",
    seed: BOMB_SCENARIO_SEED,
    createWorld(seed) {
      return createBombArena(seed ?? BOMB_SCENARIO_SEED);
    },
  },
];
