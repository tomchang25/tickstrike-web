import { createTrainingArena } from "../fixtures/training-arena";
import { spawnTrainingEnemies } from "../fixtures/spawn-training-enemies";
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
        archetype: "training-player",
        cell: { x: 3, y: 3 },
        hp: 100,
      });
      spawnTrainingEnemies(world);
      return world;
    },
  },
];
