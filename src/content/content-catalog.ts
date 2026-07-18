import { createContentCatalog } from "../core/content/content-catalog";
import { actorContent } from "./actor-content";
import { artifactContent } from "./artifact-content";
import { waveContent } from "./wave-content";

export const contentCatalog = createContentCatalog({
  actor: actorContent,
  wave: waveContent,
  artifact: artifactContent,
});
