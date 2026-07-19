import { createShippedArena as createShippedArenaGeometry } from "../../core/world/arena";
import { World } from "../../core/world/world";
import type { EnemyActionDefinition, Seed } from "../../core/model/types";
import { actorCatalog } from "../../content/actor-catalog";

export const SHIPPED_SCENARIO_SEED = "tick-arena-foundation";

export function createShippedArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  return new World(createShippedArenaGeometry(), seed);
}

const CHARGE_PREFERRED_MIN_RANGE = 2;

export function createFoundationArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  const world = createShippedArena(seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const thrust = actorCatalog.enemies.find((enemy) => enemy.id === "thrust_enemy");
  const slash = actorCatalog.enemies.find((enemy) => enemy.id === "slash_enemy");
  const ranged = actorCatalog.enemies.find((enemy) => enemy.id === "ranged_enemy");
  const charge = actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy");
  const smallGuard = actorCatalog.guards.find((guard) => guard.id === "small");
  const heavyGuard = actorCatalog.guards.find((guard) => guard.id === "heavy");
  if (!player || !thrust || !slash || !ranged || !charge || !smallGuard || !heavyGuard) {
    throw new Error("Shipped combat content is incomplete.");
  }
  const actionFor = (enemy: typeof thrust | typeof slash | typeof ranged): EnemyActionDefinition => {
    const attackId = enemy.attackIds[0];
    const attack = actorCatalog.attacks.find((candidate) => candidate.id === attackId);
    if (!attack || attack.shape.shape !== "custom-offsets") {
      throw new Error(`Basic enemy attack content is incomplete: ${enemy.id}`);
    }
    return {
      role: enemy.role,
      attackId: attack.id,
      kind: attack.kind,
      damage: attack.damage,
      warningTicks: attack.warningTicks,
      recoveryTicks: attack.recoveryTicks,
      offsets: attack.shape.offsets,
      ...(enemy.roleTuning?.type === "ranged"
        ? { rangedTuning: { minDistance: enemy.roleTuning.minDistance, maxDistance: enemy.roleTuning.maxDistance } }
        : {}),
    };
  };
  const chargeAction = ((): EnemyActionDefinition => {
    const attackId = charge.attackIds[0];
    const attack = actorCatalog.attacks.find((candidate) => candidate.id === attackId);
    if (!attack || attack.shape.shape !== "line") {
      throw new Error(`Charge enemy attack content is incomplete: ${charge.id}`);
    }
    return {
      role: charge.role,
      attackId: attack.id,
      kind: attack.kind,
      damage: attack.damage,
      warningTicks: attack.warningTicks,
      recoveryTicks: attack.recoveryTicks,
      offsets: [],
      chargeTuning: { minRange: 1, maxRange: attack.shape.length, preferredMinRange: CHARGE_PREFERRED_MIN_RANGE },
    };
  })();
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 6, y: 6 },
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
    id: "enemy-thrust",
    kind: "enemy",
    archetype: "thrust",
    presentationId: thrust.presentation.id,
    cell: { x: 5, y: 6 },
    hp: thrust.hp,
    defense: thrust.defense,
    guardDefinition: smallGuard,
    enemyAction: actionFor(thrust),
    facing: { x: 1, y: 0 },
  });
  world.spawn({
    id: "enemy-slash",
    kind: "enemy",
    archetype: "slash",
    presentationId: slash.presentation.id,
    cell: { x: 8, y: 6 },
    hp: slash.hp,
    defense: slash.defense,
    guardDefinition: smallGuard,
    enemyAction: actionFor(slash),
    facing: { x: -1, y: 0 },
  });
  world.spawn({
    id: "enemy-ranged",
    kind: "enemy",
    archetype: "ranged",
    presentationId: ranged.presentation.id,
    cell: { x: 6, y: 4 },
    hp: ranged.hp,
    defense: ranged.defense,
    guardDefinition: smallGuard,
    enemyAction: actionFor(ranged),
    facing: { x: 0, y: 1 },
  });
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    presentationId: charge.presentation.id,
    cell: { x: 6, y: 9 },
    hp: charge.hp,
    defense: charge.defense,
    guardDefinition: heavyGuard,
    enemyAction: chargeAction,
    facing: { x: 0, y: -1 },
  });
  return world;
}
