import { createTrainingArena } from "../../content/arenas/training-arena";
import { spawnTrainingEnemies } from "../../content/enemies/spawn-training-enemies";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "smash-water",
    title: "Smash / Knockback / Water",
    description: "Crush the center enemy, knock one aside, and throw one into water.",
    createWorld() {
      const world = createTrainingArena();
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "viking",
        cell: { x: 3, y: 3 },
        hp: 100,
      });
      spawnTrainingEnemies(world);
      return world;
    },
  },
];
