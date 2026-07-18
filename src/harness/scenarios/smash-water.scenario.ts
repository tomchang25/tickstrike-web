import { actorCatalog } from "../../content/actor-catalog";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "smash-water",
    title: "Smash / Displacement and Water",
    description: "A fixed Smash player crushes the impact victim, knocks back a land victim, blocks a reserved victim, and sends one victim into water.",
    seed: "smash-water-foundation",
    createWorld(seed) {
      const world = createTrainingArena(seed);
      const player = actorCatalog.characters.find((character) => character.id === "viking");
      const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
      if (!player || !guard) throw new Error("Shipped combat content is incomplete.");
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "viking",
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
        cell: { x: 4, y: 3 },
        hp: 100,
        guardDefinition: guard,
        facing: { x: 1, y: 0 },
      });
      world.spawn({
        id: "enemy-blocked",
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
      const reservation = world.requestReservation({
        ownerId: "smash-fixture-blocker",
        purpose: "movement",
        cells: [{ x: 4, y: 1 }],
      });
      if (!reservation.granted) throw new Error("Smash fixture reservation was not granted.");
      return world;
    },
  },
];
