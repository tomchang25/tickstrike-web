import type { WaveEnemySpawnRequest } from "../core/actions/wave-phase";
import type { EnemyDefinition, GuardDefinition } from "../core/content/actor-schema";
import { projectEnemyLevel } from "../core/waves/enemy-level-progression";
import type { SpawnEntityInput } from "../core/world/world";
import { actorCatalog } from "./actor-catalog";
import { resolveEnemyActionDefinition } from "./enemy-action-resolution";

export type { WaveEnemySpawnRequest };
export { resolveEnemyActionDefinition };

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
