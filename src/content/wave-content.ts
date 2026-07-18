import { actorContent } from "./actor-content";
import { createWaveContentCatalog } from "../core/content/wave-content";
import {
  demoWaveDefinitions,
  endlessWaveDefinition,
  progressionProfile,
  spawnGroupDefinitions,
} from "./waves/wave-definitions";

export const waveContent = createWaveContentCatalog(
  {
    groups: spawnGroupDefinitions,
    demoWaves: demoWaveDefinitions,
    endlessTemplate: endlessWaveDefinition,
    progressionProfile,
  },
  actorContent,
);

export const waveCatalog = waveContent;
