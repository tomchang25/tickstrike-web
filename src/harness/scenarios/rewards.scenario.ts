import { createRewardArena, REWARD_SCENARIO_SEED, rewardScenarioContext } from "../fixtures/reward-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "rewards",
    title: "Rewards / Supported Effect Walkthrough",
    description:
      "A minimal arena that pauses on a deterministic reward offer each wave clear: three-card " +
      "Minor offers on ordinary waves and a Major milestone offer every third wave, with a live " +
      "acquired-build HUD.",
    seed: REWARD_SCENARIO_SEED,
    waveContext: rewardScenarioContext,
    createWorld(seed) {
      return createRewardArena(seed ?? REWARD_SCENARIO_SEED);
    },
  },
];
