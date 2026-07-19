import { actorCatalog } from "../../content/actor-catalog";
import type { EnemyActionDefinition, Seed, TileKind } from "../../core/model/types";
import { World } from "../../core/world/world";
import type { TestScenario } from "../types";

const WIDTH = 12;
const HEIGHT = 7;
const CHARGE_PREFERRED_MIN_RANGE = 2;

function chargeAction(): EnemyActionDefinition {
  const enemy = actorCatalog.enemies.find((candidate) => candidate.id === "charge_enemy");
  const attack = actorCatalog.attacks.find((candidate) => candidate.id === enemy?.attackIds[0]);
  if (!enemy || !attack || attack.shape.shape !== "line") {
    throw new Error("Charge enemy content is incomplete.");
  }
  return {
    role: enemy.role,
    attackId: attack.id,
    kind: attack.kind,
    damage: attack.damage,
    warningTicks: attack.warningTicks,
    recoveryTicks: attack.recoveryTicks,
    offsets: [],
    chargeTuning: { minRange: 1, maxRange: attack.shape.length, preferredMinRange: CHARGE_PREFERRED_MIN_RANGE },
  };
}

/**
 * Charge origin (8,3) and Player (3,3) share row y=3, five cells apart. Leaving the Player in
 * place resolves a blocked impact against `enemy-forward-block`; moving the Player two cells
 * east during warning retargets Charge to a free forward cell and resolves a normal impact.
 * `enemy-side-blocker` at (7,3) is always the first non-target path cell, so both runs also
 * exercise the alternating side-displacement rule.
 */
export function createChargeArena(seed?: Seed): World {
  const tiles: readonly TileKind[] = Array.from({ length: WIDTH * HEIGHT }, () => "floor");
  const world = new World(WIDTH, HEIGHT, tiles, seed ?? "charge-enemy-foundation");
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const heavyGuard = actorCatalog.guards.find((guard) => guard.id === "heavy");
  const charge = actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy");
  if (!player || !heavyGuard || !charge) throw new Error("Charge scenario content is incomplete.");

  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 3, y: 3 },
    hp: player.hp,
    normalAttackDamage: player.normalAttack.damage,
    mobility: {
      kind: player.mobility.kind,
      damage: player.mobility.damage,
      range: player.mobility.range,
      cooldown: player.mobility.cooldown,
      staggerMultiplier: player.mobility.staggerMultiplier,
    },
  });
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    presentationId: charge.presentation.id,
    cell: { x: 8, y: 3 },
    hp: charge.hp,
    defense: charge.defense,
    guardDefinition: heavyGuard,
    enemyAction: chargeAction(),
    facing: { x: -1, y: 0 },
  });
  world.spawn({
    id: "enemy-side-blocker",
    kind: "enemy",
    archetype: "training-grunt",
    cell: { x: 7, y: 3 },
    hp: 100,
  });
  world.spawn({
    id: "enemy-forward-block",
    kind: "enemy",
    archetype: "training-grunt",
    cell: { x: 2, y: 3 },
    hp: 100,
  });

  return world;
}

export const scenarios: readonly TestScenario[] = [
  {
    id: "charge-enemy",
    title: "Charge Enemy / Live Targeting and Impact",
    description: "A fixed Charge telegraphs a five-cell line at the Player: staying put resolves a blocked double-damage impact against a forward blocker, while stepping toward Charge during warning retargets to a free cell and resolves a normal knockback impact. A side blocker always demonstrates the alternating displacement rule.",
    seed: "charge-enemy-foundation",
    createWorld(seed) {
      return createChargeArena(seed ?? "charge-enemy-foundation");
    },
  },
];
