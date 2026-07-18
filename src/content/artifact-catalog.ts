import { createArtifactContentCatalog } from "../core/content/artifact-schema";
import { artifactDefinitions } from "./artifacts/artifact-definitions";

export const artifactCatalog = createArtifactContentCatalog({ artifacts: artifactDefinitions });
