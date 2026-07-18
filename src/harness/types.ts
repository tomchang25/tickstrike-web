import type { World } from "../core/world/world";
import type { ContentInspection } from "./content-inspection";

export interface TestScenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly commandsEnabled?: boolean;
  readonly inspection?: ContentInspection;
  createWorld(): World;
}

export interface ScenarioModule {
  readonly scenarios: readonly TestScenario[];
}
