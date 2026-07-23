import rawCatalog from "./action-presentation-catalog.json";
import { parseActionPresentationCatalog, type ActionPresentationCatalog } from "./action-presentation-schema";

export {
  ACTION_DIRECTIONS,
  ACTION_STATE_KEYS,
  parseActionPresentationCatalog,
  type ActionDirection,
  type ActionDirectionalOffset,
  type ActionPresentation,
  type ActionPresentationCatalog,
  type ActionStateKey,
  type ActionStatePresentation,
  type ActionVec2,
} from "./action-presentation-schema";

export const actionPresentationCatalog = parseActionPresentationCatalog(rawCatalog);

let runtimeActionPresentationCatalog = actionPresentationCatalog;

export function resolveActionPresentation(actionId: string, catalog = runtimeActionPresentationCatalog) {
  const action = catalog.actions[actionId];
  if (!action) {
    throw new Error(`Unknown action presentation "${actionId}".`);
  }
  return action;
}

/** Replaces the in-memory catalog after the dev authoring endpoint validates a new JSON document. */
export function setRuntimeActionPresentationCatalog(catalog: ActionPresentationCatalog): void {
  runtimeActionPresentationCatalog = catalog;
}
