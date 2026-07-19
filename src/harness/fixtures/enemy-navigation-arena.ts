import { actorCatalog } from "../../content/actor-catalog";
import type { EnemyActionDefinition, Seed, TileKind } from "../../core/model/types";
import { World } from "../../core/world/world";

const WIDTH = 10;
const HEIGHT = 10;

const THRUST_CELLS = [
  { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }, { x: 7, y: 1 }, { x: 8, y: 2 },
  { x: 8, y: 3 }, { x: 8, y: 5 }, { x: 8, y: 7 }, { x: 6, y: 8 }, { x: 4, y: 8 },
] as const;

const SLASH_CELLS = [
  { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }, { x: 7, y: 2 }, { x: 1, y: 4 },
  { x: 1, y: 6 }, { x: 1, y: 8 }, { x: 3, y: 8 }, { x: 5, y: 8 }, { x: 7, y: 8 },
] as const;

const DEBUG_RESERVATION_CELLS = [
  { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
  { x: 2, y: 5 }, { x: 7, y: 5 },
] as const;

function actionFor(enemyId: "thrust_enemy" | "slash_enemy"): EnemyActionDefinition {
  const enemy = actorCatalog.enemies.find((candidate) => candidate.id === enemyId);
  const attackId = enemy?.attackIds[0];
  const attack = actorCatalog.attacks.find((candidate) => candidate.id === attackId);
  if (!enemy || !attack || attack.shape.shape !== "custom-offsets") {
    throw new Error(`Navigation content is incomplete for ${enemyId}.`);
  }
  return {
    role: enemy.role,
    attackId: attack.id,
    kind: attack.kind,
    damage: attack.damage,
    warningTicks: attack.warningTicks,
    recoveryTicks: attack.recoveryTicks,
    offsets: attack.shape.offsets,
  };
}

export function createEnemyNavigationArena(seed?: Seed): World {
  const tiles: readonly TileKind[] = Array.from({ length: WIDTH * HEIGHT }, () => "floor");
  const world = new World(WIDTH, HEIGHT, tiles, seed ?? "enemy-navigation-testbed");
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
  const thrust = actorCatalog.enemies.find((enemy) => enemy.id === "thrust_enemy");
  const slash = actorCatalog.enemies.find((enemy) => enemy.id === "slash_enemy");
  if (!player || !guard || !thrust || !slash) throw new Error("Navigation scenario content is incomplete.");

  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 5, y: 5 },
    hp: player.hp,
    damageImmune: true,
    normalAttackDamage: player.normalAttack.damage,
    mobility: {
      kind: "dash",
      damage: player.mobility.damage,
      range: player.mobility.range,
      cooldown: 0,
      staggerMultiplier: player.mobility.staggerMultiplier,
    },
  });

  const spawnEnemies = (
    prefix: "thrust" | "slash",
    archetype: typeof thrust | typeof slash,
    action: EnemyActionDefinition,
    cells: readonly { readonly x: number; readonly y: number }[],
  ): void => {
    cells.forEach((cell, index) => {
      world.spawn({
        id: `enemy-${prefix}-${String(index + 1).padStart(2, "0")}`,
        kind: "enemy",
        archetype: prefix,
        cell,
        hp: archetype.hp,
        defense: archetype.defense,
        guardDefinition: guard,
        enemyAction: action,
        facing: { x: 0, y: 1 },
      });
    });
  };

  spawnEnemies("thrust", thrust, actionFor("thrust_enemy"), THRUST_CELLS);
  spawnEnemies("slash", slash, actionFor("slash_enemy"), SLASH_CELLS);

  DEBUG_RESERVATION_CELLS.forEach((cell, index) => {
    world.requestReservation({
      ownerId: `debug-reservation-${String(index + 1).padStart(2, "0")}`,
      purpose: "navigation-blocker",
      cells: [cell],
    });
  });

  return world;
}
