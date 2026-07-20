import { actorCatalog } from "./actor-catalog";
import { createWaveContentCatalog } from "@core/content/wave-schema";
import {
  demoWaveDefinitions,
  endlessWaveDefinition,
  progressionProfile,
  spawnGroupDefinitions,
} from "./waves/wave-definitions";

export const waveCatalog = createWaveContentCatalog(
  {
    groups: spawnGroupDefinitions,
    demoWaves: demoWaveDefinitions,
    endlessTemplate: endlessWaveDefinition,
    progressionProfile,
  },
  actorCatalog,
);
