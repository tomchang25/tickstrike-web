import rawCatalog from "./entity-presentation-profile-catalog.json";
import {
  parseEntityPresentationProfileCatalog,
  resolveEntityPresentationProfileFromCatalog,
  type EntityPresentationProfile,
  type EntityPresentationProfileCatalog,
} from "./entity-presentation-profile-schema";

export {
  createEntityPresentationProfileOverride,
  parseEntityPresentationProfileCatalog,
  type EntityBodyFoot,
  type EntityPresentationProfile,
  type EntityPresentationProfileCatalog,
  type EntityPresentationProfileOverride,
} from "./entity-presentation-profile-schema";

export const entityPresentationProfileCatalog = parseEntityPresentationProfileCatalog(rawCatalog);
let runtimeEntityPresentationProfileCatalog = entityPresentationProfileCatalog;

export function resolveEntityPresentationProfile(
  profileId: string,
  catalog: EntityPresentationProfileCatalog = runtimeEntityPresentationProfileCatalog,
): EntityPresentationProfile {
  return resolveEntityPresentationProfileFromCatalog(profileId, catalog);
}

/** Replaces the in-memory catalog after the dev authoring endpoint validates a new JSON document. */
export function setRuntimeEntityPresentationProfileCatalog(catalog: EntityPresentationProfileCatalog): void {
  runtimeEntityPresentationProfileCatalog = catalog;
}
