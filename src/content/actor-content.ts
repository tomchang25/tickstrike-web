import { createActorContentCatalog } from "../core/content/actor-content";
import { characterDefinitions } from "./characters/character-definitions";
import {
  attackDefinitions,
  enemyDefinitions,
  guardDefinitions,
} from "./enemies/enemy-definitions";

export const actorContent = createActorContentCatalog({
  characters: characterDefinitions,
  guards: guardDefinitions,
  attacks: attackDefinitions,
  enemies: enemyDefinitions,
});

export const actorCatalog = actorContent;
