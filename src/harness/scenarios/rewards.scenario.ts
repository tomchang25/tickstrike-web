import {
  createRewardArena,
  REWARD_SCENARIO_SEED,
  rewardScenarioContext,
} from "../fixtures/reward-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "rewards",
    title: "Rewards / Supported Effect Walkthrough",
    description:
      "A minimal arena that pauses on one deterministic reward offer per wave clear, walking " +
      "through every supported artifact effect in one continuous run.",
    seed: REWARD_SCENARIO_SEED,
    waveContext: rewardScenarioContext,
    createWorld(seed) {
      return createRewardArena(seed ?? REWARD_SCENARIO_SEED);
    },
  },
];
