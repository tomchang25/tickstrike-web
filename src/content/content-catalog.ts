import { createContentCatalog } from "../core/content/content-schema";
import { actorCatalog } from "./actor-catalog";
import { artifactCatalog } from "./artifact-catalog";
import { waveCatalog } from "./wave-catalog";

export const contentCatalog = createContentCatalog({
  actor: actorCatalog,
  wave: waveCatalog,
  artifact: artifactCatalog,
});
