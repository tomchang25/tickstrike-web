import { createWaveArena, runScenarioContext, WAVE_SCENARIO_SEED } from "../fixtures/wave-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "run",
    title: "Run / Full Authored Lifecycle",
    description:
      "The shipped arena driven as a complete run: authored waves, rewards, and the final-wave " +
      "End Run / Continue Endless milestone choice into the endless template.",
    seed: WAVE_SCENARIO_SEED,
    waveContext: runScenarioContext,
    createWorld(seed) {
      return createWaveArena(seed ?? WAVE_SCENARIO_SEED);
    },
  },
];
