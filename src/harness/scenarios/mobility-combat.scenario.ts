import { actorCatalog } from "@content/actor-catalog";
import { createTrainingArena } from "../fixtures/training-arena";
import type { TestScenario } from "../types";

export const scenarios: readonly TestScenario[] = [
  {
    id: "mobility-combat",
    title: "Mobility / Guard / I-frame",
    description: "Dash crosses a guarded victim while an already committed enemy attack is ignored during release.",
    seed: "mobility-combat-foundation",
    createWorld(seed) {
      const world = createTrainingArena(seed);
      const player = actorCatalog.characters.find((character) => character.id === "ninja");
      const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
      const thrust = actorCatalog.enemies.find((enemy) => enemy.id === "thrust_enemy");
      const attack = actorCatalog.attacks.find((candidate) => candidate.id === "thrust");
      if (!player || !guard || !thrust || !attack || attack.shape.shape !== "custom-offsets") {
        throw new Error("Mobility combat content is incomplete.");
      }

      world.spawn({
        id: "player",
        kind: "player",
        archetype: "ninja",
        cell: { x: 1, y: 3 },
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
        archetype: "training-guard",
        cell: { x: 2, y: 3 },
        hp: 100,
        guardDefinition: guard,
        facing: { x: 1, y: 0 },
      });
      world.spawn({
        id: "enemy-threat",
        kind: "enemy",
        archetype: thrust.id,
        cell: { x: 5, y: 3 },
        hp: thrust.hp,
        enemyAction: {
          role: "thrust",
          attackId: attack.id,
          damage: attack.damage,
          warningTicks: attack.warningTicks,
          recoveryTicks: attack.recoveryTicks,
          offsets: attack.shape.offsets,
        },
        facing: { x: -1, y: 0 },
      });
      world.commitEnemyAttack("enemy-threat", {
        attackId: attack.id,
        cells: [{ x: 4, y: 3 }],
        damage: attack.damage,
        warningTicks: 0,
        recoveryTicks: attack.recoveryTicks,
      });
      return world;
    },
  },
];
