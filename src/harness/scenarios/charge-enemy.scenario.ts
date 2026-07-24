import { actorCatalog } from "@content/actor-catalog";
import { resolveEnemyActionDefinition } from "@content/enemy-action-resolution";
import type { EnemyActionDefinition, Seed, TileKind } from "@core/model/types";
import { World } from "@core/world/world";
import type { TestScenario } from "../types";

const WIDTH = 12;
const HEIGHT = 7;

function chargeAction(): EnemyActionDefinition {
  const enemy = actorCatalog.enemies.find((candidate) => candidate.id === "charge_enemy");
  if (!enemy) {
    throw new Error("Charge enemy content is incomplete.");
  }
  return resolveEnemyActionDefinition(enemy);
}

/**
 * Charge origin (9,3) and Player (7,3) share a leftward path. Three left moves bring the
 * Player to (4,3); a fourth in-place command (Charge's 3-tick windup needs one more tick than
 * a plain move sequence provides) holds the Player there so the detonating command pushes the
 * Player sideways from (4,3) to (4,2) — the final-cell occupant is pushed like every other path
 * occupant, never knocked forward — and lands Charge from (9,3) to (4,3). `enemy-side-blocker`
 * at (8,3) exercises the same alternating side push, pushed to (8,2).
 */
export function createChargeArena(seed?: Seed): World {
  const tiles: readonly TileKind[] = Array.from({ length: WIDTH * HEIGHT }, () => "floor");
  const world = new World(WIDTH, HEIGHT, tiles, seed ?? "charge-enemy-foundation");
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const heavyGuard = actorCatalog.guards.find((guard) => guard.id === "heavy");
  const charge = actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy");
  if (!player || !heavyGuard || !charge) {
    throw new Error("Charge scenario content is incomplete.");
  }

  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 7, y: 3 },
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
    cell: { x: 9, y: 3 },
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
    cell: { x: 8, y: 3 },
    hp: 100,
  });
  return world;
}

export const scenarios: readonly TestScenario[] = [
  {
    id: "charge-enemy",
    title: "Charge Enemy / Live Targeting and Impact",
    description:
      "Three deterministic left moves plus a held in-place command end with same-direction Player movement and a Charge side push, while a side blocker and Charge landing move concurrently from their declared origins.",
    seed: "charge-enemy-foundation",
    createWorld(seed) {
      return createChargeArena(seed ?? "charge-enemy-foundation");
    },
  },
];
