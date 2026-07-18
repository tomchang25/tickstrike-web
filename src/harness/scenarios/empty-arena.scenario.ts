import { createTrainingArena } from "../../content/arenas/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "empty-arena",
    title: "Arena / Movement",
    description: "A minimal movement sandbox with no enemies.",
    createWorld() {
      const world = createTrainingArena();
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "viking",
        cell: { x: 3, y: 3 },
        hp: 100,
      });
      return world;
    },
  },
];
