import type { GuardDefinition } from "@core/content/actor-schema";

export { attackDefinitions, enemyDefinitions } from "./features";

export const guardDefinitions: readonly GuardDefinition[] = [
  {
    id: "small",
    name: "Small",
    base: 32,
    lethalTierGain: 8,
    stagger: 3,
    protection: 5,
    protectionMultiplier: 0.5,
  },
  {
    id: "heavy",
    name: "Heavy",
    base: 64,
    lethalTierGain: 16,
    stagger: 3,
    protection: 5,
    protectionMultiplier: 0.5,
  },
];
