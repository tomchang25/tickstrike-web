import { actorCatalog } from "@content/actor-catalog";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

const WATER_ENEMIES = [
  { id: "water-thrust", enemyId: "thrust_enemy" },
  { id: "water-slash", enemyId: "slash_enemy" },
  { id: "water-charge", enemyId: "charge_enemy" },
  { id: "water-ranged", enemyId: "ranged_enemy" },
  { id: "water-bomb", enemyId: "bomb_enemy" },
] as const;

function createWaterAnimationScenario(
  id: string,
  enemyId: (typeof WATER_ENEMIES)[number]["enemyId"],
): TestScenario {
  return {
    id,
    title: `Water Animation / ${enemyId}`,
    description: "A fixed Smash sends one authored enemy profile into the training-water cell.",
    seed: `${id}-seed`,
    createWorld(seed) {
      const world = createTrainingArena(seed);
      const player = actorCatalog.characters.find((character) => character.id === "viking");
      const enemy = actorCatalog.enemies.find((candidate) => candidate.id === enemyId);
      const guard = enemy?.guardId
        ? actorCatalog.guards.find((candidate) => candidate.id === enemy.guardId)
        : undefined;
      if (!player || !enemy || (enemy.guardId && !guard)) {
        throw new Error("Water animation scenario content is incomplete.");
      }
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "viking",
        cell: { x: 3, y: 3 },
        hp: player.hp,
        mobility: {
          kind: player.mobility.kind,
          damage: player.mobility.damage,
          range: player.mobility.range,
          cooldown: player.mobility.cooldown,
          staggerMultiplier: player.mobility.staggerMultiplier,
        },
      });
      world.spawn({
        id: "smash-center",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 3 },
        hp: 100,
      });
      world.spawn({
        id: "enemy-water",
        kind: "enemy",
        archetype: enemy.role,
        presentationId: enemy.presentation.id,
        cell: { x: 4, y: 4 },
        hp: enemy.hp,
        defense: enemy.defense,
        ...(guard ? { guardDefinition: guard } : {}),
      });
      return world;
    },
  };
}

export const scenarios: readonly TestScenario[] = WATER_ENEMIES.map(({ id, enemyId }) =>
  createWaterAnimationScenario(id, enemyId),
);
