import type { CombatEvent } from "../events/combat-events";
import type { DamageResult, EntityId, Telegraph } from "../model/types";
import type { EnemyAttackResolution, World } from "../world/world";

/** Standard damage/death event pair for either target kind, read after damage was applied. */
export function damageEventsFor(
  world: World,
  attackerId: EntityId,
  targetId: EntityId,
  damage: DamageResult,
): CombatEvent[] {
  const target = world.requireEntity(targetId);
  if (target.kind === "player") {
    const events: CombatEvent[] = [
      { type: "player_damaged", playerId: targetId, damage, hp: target.hp, maxHp: target.maxHp },
    ];
    if (damage.killed) {
      events.push({ type: "player_died", playerId: targetId, cell: target.cell });
    }
    return events;
  }
  const events: CombatEvent[] = [
    {
      type: "enemy_damaged",
      enemyId: targetId,
      hit: { ...damage, attackerId },
      hp: target.hp,
      maxHp: target.maxHp,
    },
  ];
  if (damage.killed) {
    events.push({ type: "enemy_died", enemyId: targetId, attackerId, cell: target.cell });
  }
  return events;
}

/** Detonation announcement plus any Player damage/death for a shared committed-attack resolution. */
export function committedAttackDetonationEvents(
  world: World,
  enemyId: EntityId,
  resolution: EnemyAttackResolution,
): CombatEvent[] {
  const events: CombatEvent[] = [
    {
      type: "enemy_attack_detonated",
      enemyId,
      attack: resolution.attack,
      target: resolution.target,
      ...(resolution.damage ? { hit: resolution.damage } : {}),
    },
  ];
  if (resolution.damage) {
    const player = world.requireEntity(resolution.damage.targetId);
    events.push({
      type: "player_damaged",
      playerId: player.id,
      damage: resolution.damage,
      hp: player.hp,
      maxHp: player.maxHp,
    });
    if (resolution.damage.killed) {
      events.push({ type: "player_died", playerId: player.id, cell: player.cell });
    }
  }
  return events;
}

/**
 * The shared detonation used by every behavior without a `resolveAttack` hook:
 * resolve the committed cells against the Player, then clear the telegraph and
 * enter recovery.
 */
export function genericDetonationEvents(
  world: World,
  enemyId: EntityId,
  telegraph: Telegraph | undefined,
): CombatEvent[] | undefined {
  const resolution = world.resolveCommittedEnemyAttack(enemyId);
  if (!resolution) {
    return undefined;
  }
  const events = committedAttackDetonationEvents(world, enemyId, resolution);
  events.push({ type: "telegraph_changed", sourceId: enemyId, telegraph, cleared: true });
  events.push({
    type: "enemy_recovering",
    enemyId,
    recoveryTicks: resolution.attack.recoveryTicks,
  });
  return events;
}
