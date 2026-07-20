import { createWaveArena, WAVE_SCENARIO_SEED, waveScenarioContext } from "../fixtures/wave-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "waves",
    title: "Waves / Authored Spawn Scenario",
    description:
      "The shipped arena with the regular player and Wave 1 installed, no fixture enemies — spawns arrive only through the wave phase.",
    seed: WAVE_SCENARIO_SEED,
    waveContext: waveScenarioContext,
    createWorld(seed) {
      return createWaveArena(seed ?? WAVE_SCENARIO_SEED);
    },
  },
];
