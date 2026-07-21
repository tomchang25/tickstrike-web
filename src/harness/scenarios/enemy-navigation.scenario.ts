import { createEnemyNavigationArena } from "../fixtures/enemy-navigation-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "enemy-navigation",
    title: "Enemy Navigation / 20-Unit Grid",
    description: "A 10x10 damage-immune Dash testbed with ten Thrust and ten Slash pathfinding agents.",
    seed: "enemy-navigation-testbed",
    createWorld(seed) {
      return createEnemyNavigationArena(seed);
    },
  },
];
