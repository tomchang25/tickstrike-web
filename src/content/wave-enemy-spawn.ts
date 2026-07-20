import type { WaveEnemySpawnRequest } from "../core/actions/wave-phase";
import { resolveAreaOffsets } from "../core/enemies/area-shapes";
import type { EnemyDefinition, GuardDefinition } from "../core/content/actor-schema";
import { projectEnemyLevel } from "../core/waves/enemy-level-progression";
import type { EnemyActionDefinition } from "../core/model/types";
import type { SpawnEntityInput } from "../core/world/world";
import { actorCatalog } from "./actor-catalog";

export type { WaveEnemySpawnRequest };

const CHARGE_PREFERRED_MIN_RANGE = 2;

/**
 * Resolves an authored `EnemyDefinition`'s enabled action into the runtime
 * `EnemyActionDefinition` the world spawns with — the same resolution
 * `createFoundationArena` inlines for the fixed fixture, factored out so the
 * wave spawn path and the fixed fixture cannot drift.
 */
export function resolveEnemyActionDefinition(enemy: EnemyDefinition): EnemyActionDefinition {
  const attackId = enemy.attackIds[0];
  const attack = actorCatalog.attacks.find((candidate) => candidate.id === attackId);
  if (!attack) {
    throw new Error(`Enemy attack content is incomplete: ${enemy.id}`);
  }

  if (attack.shape.shape === "line") {
    return {
      role: enemy.role,
      attackId: attack.id,
      kind: attack.kind,
      damage: attack.damage,
      warningTicks: attack.warningTicks,
      recoveryTicks: attack.recoveryTicks,
      offsets: [],
      chargeTuning: {
        minRange: 1,
        maxRange: attack.shape.length,
        preferredMinRange: CHARGE_PREFERRED_MIN_RANGE,
      },
    };
  }

  const offsets =
    attack.shape.shape === "custom-offsets"
      ? attack.shape.offsets
      : attack.shape.shape === "manhattan"
        ? resolveAreaOffsets(attack.shape)
        : undefined;
  if (!offsets) {
    throw new Error(`Unsupported enemy attack shape: ${enemy.id}`);
  }
  return {
    role: enemy.role,
    attackId: attack.id,
    kind: attack.kind,
    damage: attack.damage,
    warningTicks: attack.warningTicks,
    recoveryTicks: attack.recoveryTicks,
    offsets,
    ...(enemy.roleTuning?.type === "ranged"
      ? {
          rangedTuning: {
            minDistance: enemy.roleTuning.minDistance,
            maxDistance: enemy.roleTuning.maxDistance,
          },
        }
      : {}),
  };
}

function findEnemyDefinition(enemyId: string): EnemyDefinition {
  const enemy = actorCatalog.enemies.find((candidate) => candidate.id === enemyId);
  if (!enemy) {
    throw new Error(`Unknown wave enemy id: ${enemyId}`);
  }
  return enemy;
}

function findGuardDefinition(guardId: string | null): GuardDefinition | null {
  if (!guardId) {
    return null;
  }
  const guard = actorCatalog.guards.find((candidate) => candidate.id === guardId);
  if (!guard) {
    throw new Error(`Unknown guard id: ${guardId}`);
  }
  return guard;
}

/**
 * Builds a wave-spawned enemy's `SpawnEntityInput` from authored content plus Child A's level
 * projection. HP and guard are floored at 1 so a projection can never produce a zero-stat enemy.
 */
export function buildEnemySpawnInput(request: WaveEnemySpawnRequest): SpawnEntityInput {
  const enemy = findEnemyDefinition(request.enemyId);
  const guardDefinition = findGuardDefinition(enemy.guardId);
  const projection = projectEnemyLevel(
    enemy,
    guardDefinition,
    request.level,
    request.waveNumber,
    request.profile,
  );

  const baseAction = resolveEnemyActionDefinition(enemy);

  return {
    id: request.id,
    kind: "enemy",
    archetype: enemy.id,
    presentationId: enemy.presentation.id,
    cell: request.cell,
    hp: Math.max(1, Math.round(projection.maxHp)),
    defense: Math.round(projection.defense),
    enemyAction: {
      ...baseAction,
      damage: Math.round(baseAction.damage * projection.damageMultiplier),
    },
    facing: { x: 1, y: 0 },
    ...(guardDefinition
      ? { guardDefinition: { ...guardDefinition, base: Math.max(1, Math.round(projection.maxGuard)) } }
      : {}),
  };
}
