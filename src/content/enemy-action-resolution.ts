import { resolveAreaOffsets } from "@core/enemies/area-shapes";
import type { EnemyDefinition } from "@core/content/actor-schema";
import type { EnemyActionDefinition } from "@core/model/types";
import { actorCatalog } from "./actor-catalog";

/**
 * Single source of truth mapping an authored `EnemyDefinition` to the runtime
 * `EnemyActionDefinition` the world spawns with. Every spawn path — wave spawns,
 * fixed fixtures, and scenarios — must resolve through here so they cannot drift.
 *
 * Behavior is keyed on the enemy's authored role, never on attack geometry, so a
 * shape can never silently imply a different behavior.
 */
export function resolveEnemyActionDefinition(enemy: EnemyDefinition): EnemyActionDefinition {
  const attackId = enemy.attackIds[0];
  const attack = actorCatalog.attacks.find((candidate) => candidate.id === attackId);
  if (!attack) {
    throw new Error(`Enemy attack content is incomplete: ${enemy.id}`);
  }

  if (enemy.role === "charge") {
    if (attack.kind !== "charge" || attack.shape.shape !== "line") {
      throw new Error(`Charge enemy attack content is incomplete: ${enemy.id}`);
    }
    return {
      role: enemy.role,
      attackId: attack.id,
      kind: attack.kind,
      damage: attack.damage,
      warningTicks: attack.warningTicks,
      recoveryTicks: attack.recoveryTicks,
      offsets: [],
      chargeTuning: { maxRange: attack.shape.length },
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
