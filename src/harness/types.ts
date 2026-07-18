import type { World } from "../core/world/world";
import type { Seed } from "../core/model/types";
import type { ContentInspection } from "./content-inspection";

export interface TestScenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly commandsEnabled?: boolean;
  readonly seed?: Seed;
  readonly inspection?: ContentInspection;
  createWorld(seed?: Seed): World;
}

export interface ScenarioModule {
  readonly scenarios: readonly TestScenario[];
}
