import {
  createRewardArena,
  REWARD_SCENARIO_SEED,
  rewardScenarioContext,
} from "../fixtures/reward-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "rewards",
    title: "Rewards / First Attack Up Offer",
    description:
      "A minimal two-wave arena that pauses with a single attack_up reward offer once Wave 1 clears.",
    seed: REWARD_SCENARIO_SEED,
    waveContext: rewardScenarioContext,
    createWorld(seed) {
      return createRewardArena(seed ?? REWARD_SCENARIO_SEED);
    },
  },
];
