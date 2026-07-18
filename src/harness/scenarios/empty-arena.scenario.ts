import { createShippedArena } from "../fixtures/shipped-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "empty-arena",
    title: "Arena / Movement",
    description: "The shipped twelve-by-twelve arena with no enemies.",
    createWorld() {
      const world = createShippedArena();
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "training-player",
        cell: { x: 6, y: 6 },
        hp: 100,
      });
      return world;
    },
  },
];
