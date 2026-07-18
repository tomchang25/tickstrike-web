import { actorCatalog } from "../../content/actor-catalog";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "smash-water",
    title: "Smash / Directional Guard",
    description: "A fixed Smash player previews and commits a 3x3 directional Guard hit.",
    seed: "smash-water-foundation",
    createWorld(seed) {
      const world = createTrainingArena(seed);
      const player = actorCatalog.characters.find((character) => character.id === "viking");
      const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
      if (!player || !guard) throw new Error("Shipped combat content is incomplete.");
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "training-player",
        cell: { x: 3, y: 3 },
        hp: player.hp,
        mobility: {
          kind: player.mobility.kind,
          damage: player.mobility.damage,
          range: player.mobility.range,
          cooldown: player.mobility.cooldown,
          staggerMultiplier: player.mobility.staggerMultiplier,
        },
      });
      world.spawn({
        id: "enemy-center",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 2 },
        hp: 100,
        guardDefinition: guard,
        facing: { x: 1, y: 0 },
      });
      world.spawn({
        id: "enemy-right",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 5, y: 3 },
        hp: 100,
        guardDefinition: guard,
        facing: { x: 1, y: 0 },
      });
      world.spawn({
        id: "enemy-water",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 4 },
        hp: 100,
        guardDefinition: guard,
        facing: { x: 1, y: 0 },
      });
      return world;
    },
  },
];
