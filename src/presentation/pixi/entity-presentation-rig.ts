import { Container, type Graphics } from "pixi.js";
import { createEntityShadow } from "./entity-shadow";
import type { EntityPresentationProfile } from "./entity-presentation-profiles";

export const ENTITY_FRAME_SIZE = 16;

export interface EntityPresentationRig {
  readonly root: Container;
  readonly groundRoot: Container;
  readonly actorRoot: Container;
  readonly shadow: Graphics;
}

export function createEntityPresentationRig(profile: EntityPresentationProfile): EntityPresentationRig {
  const root = new Container();
  const groundRoot = new Container();
  const actorRoot = new Container();
  const shadow = createEntityShadow(profile.shadow);

  groundRoot.position.y = profile.groundY;
  groundRoot.addChild(shadow, actorRoot);
  root.addChild(groundRoot);

  return { root, groundRoot, actorRoot, shadow };
}
