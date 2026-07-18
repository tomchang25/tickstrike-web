import { createArtifactContentCatalog } from "../core/content/artifact-content";
import { artifactDefinitions } from "./artifacts/artifact-definitions";

export const artifactContent = createArtifactContentCatalog({ artifacts: artifactDefinitions });

export const artifactCatalog = artifactContent;
