import { createMilestoneArena, MILESTONE_SCENARIO_SEED, milestoneScenarioContext } from "../fixtures/milestone-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "milestone",
    title: "Milestone / Shortened Run Lifecycle",
    description:
      "A two-wave run that reaches the milestone quickly: clear, reward, the End Run / Continue " +
      "Endless choice, and the endless continuation, each in a handful of commands for the run-lifecycle spec.",
    seed: MILESTONE_SCENARIO_SEED,
    waveContext: milestoneScenarioContext,
    createWorld(seed) {
      return createMilestoneArena(seed ?? MILESTONE_SCENARIO_SEED);
    },
  },
];
