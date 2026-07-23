import { actorCatalog } from "@content/actor-catalog";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "dash-kill-terminal",
    title: "Dash-Kill Terminal / Ranged",
    description: "A single Dash kills the Ranged profile and retains its body-split terminal view.",
    seed: "dash-kill-terminal-seed",
    createWorld(seed) {
      const world = createTrainingArena(seed);
      const player = actorCatalog.characters.find((character) => character.id === "ninja");
      const enemy = actorCatalog.enemies.find((candidate) => candidate.id === "ranged_enemy");
      if (!player || !enemy) {
        throw new Error("Dash-kill terminal scenario content is incomplete.");
      }

      world.spawn({
        id: "player",
        kind: "player",
        archetype: "ninja",
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
        id: "enemy-victim",
        kind: "enemy",
        archetype: enemy.role,
        presentationId: enemy.presentation.id,
        cell: { x: 4, y: 3 },
        hp: 1,
        defense: enemy.defense,
      });
      return world;
    },
  },
];
