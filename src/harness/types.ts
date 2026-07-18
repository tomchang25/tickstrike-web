import type { World } from "../core/world/world";

export interface TestScenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  createWorld(): World;
}

export interface ScenarioModule {
  readonly scenarios: readonly TestScenario[];
}
