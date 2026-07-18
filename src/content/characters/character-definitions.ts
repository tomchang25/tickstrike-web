import type { CharacterDefinition } from "../../core/content/actor-schema";

export const characterDefinitions: readonly CharacterDefinition[] = [
  {
    id: "ninja",
    name: "Ninja",
    hp: 100,
    speedFill: 20,
    normalAttack: {
      damage: 20,
      range: 1,
      staggerMultiplier: 1,
    },
    mobility: {
      kind: "dash",
      damage: 30,
      range: 5,
      cooldown: 4,
      staggerMultiplier: 2,
    },
    presentation: { id: "character.ninja" },
    audio: { id: "player.combat" },
  },
  {
    id: "viking",
    name: "Viking",
    hp: 100,
    speedFill: 10,
    normalAttack: {
      damage: 20,
      range: 1,
      staggerMultiplier: 1,
    },
    mobility: {
      kind: "smash",
      damage: 30,
      range: 3,
      cooldown: 6,
      staggerMultiplier: 2,
    },
    presentation: { id: "character.viking" },
    audio: { id: "player.combat" },
  },
];
