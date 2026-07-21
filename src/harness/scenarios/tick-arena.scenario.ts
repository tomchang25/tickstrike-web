import { createFoundationArena, SHIPPED_SCENARIO_SEED } from "../fixtures/shipped-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "tick-arena",
    title: "Tick Arena / Foundation",
    description: "The deterministic twelve-by-twelve arena with one player and three enemy fixtures.",
    seed: SHIPPED_SCENARIO_SEED,
    createWorld(seed) {
      return createFoundationArena(seed ?? SHIPPED_SCENARIO_SEED);
    },
  },
];
