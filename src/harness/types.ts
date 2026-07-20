import type { WavePhaseContext } from "@core/actions/wave-phase";
import type { World } from "@core/world/world";
import type { Seed } from "@core/model/types";
import type { ContentInspection } from "./content-inspection";

export interface TestScenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly commandsEnabled?: boolean;
  readonly seed?: Seed;
  readonly inspection?: ContentInspection;
  /** Supplied only by a wave-driven scenario; omitted scenarios run the wave phase as a no-op. */
  readonly waveContext?: WavePhaseContext;
  createWorld(seed?: Seed): World;
}

export interface ScenarioModule {
  readonly scenarios: readonly TestScenario[];
}
