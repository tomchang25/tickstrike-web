import { createActorContentCatalog } from "../core/content/actor-schema";
import { characterDefinitions } from "./characters/character-definitions";
import {
  attackDefinitions,
  enemyDefinitions,
  guardDefinitions,
} from "./enemies/enemy-definitions";

export const actorCatalog = createActorContentCatalog({
  characters: characterDefinitions,
  guards: guardDefinitions,
  attacks: attackDefinitions,
  enemies: enemyDefinitions,
});
