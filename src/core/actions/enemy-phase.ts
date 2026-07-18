import type { CombatEvent } from "../events/combat-events";
import type { EntityState } from "../model/types";
import type { World } from "../world/world";
import {
  committedAttackFromDecision,
  decideBasicEnemyAction,
} from "../enemies/basic-enemy-actions";

function enabledBasicEnemies(world: World): readonly EntityState[] {
  return world.listEntities().filter(
    (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
  );
}

export function resolveEnemyPhase(world: World): CombatEvent[] {
  const enemies = enabledBasicEnemies(world);
  const readyAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "ready").map((enemy) => enemy.id),
  );
  const recoveringAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "recovering").map((enemy) => enemy.id),
  );
  const recoveredThisPhase = new Set<string>();
  const events: CombatEvent[] = [];

  for (const enemy of enemies) {
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "telegraphing") continue;
    const attack = world.decrementEnemyAttackWarning(enemy.id);
    if (!attack || attack.warningTicks > 0) continue;

    const resolution = world.resolveCommittedEnemyAttack(enemy.id);
    if (!resolution) continue;
    const telegraph = world.getTelegraph(enemy.id);
    events.push({
      type: "enemy_attack_detonated",
      enemyId: enemy.id,
      attack: resolution.attack,
      target: resolution.target,
      ...(resolution.damage ? { hit: resolution.damage } : {}),
    });
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
    events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: true });
    events.push({ type: "enemy_recovering", enemyId: enemy.id, recoveryTicks: resolution.attack.recoveryTicks });
  }

  events.push(...world.advanceEnemyStatuses());

  for (const enemy of enemies) {
    if (!recoveringAtStart.has(enemy.id)) continue;
    if (world.advanceEnemyRecovery(enemy.id)) {
      recoveredThisPhase.add(enemy.id);
      events.push({ type: "enemy_recovered", enemyId: enemy.id });
    }
  }

  for (const enemy of enemies) {
    if (!readyAtStart.has(enemy.id) && !recoveredThisPhase.has(enemy.id)) continue;
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "ready") continue;
    const decision = decideBasicEnemyAction({
      enemy: current,
      playerCell: world.playerCell,
      canMove: (destination) => destination.x !== world.playerCell?.x || destination.y !== world.playerCell?.y
        ? world.isWalkable(destination)
        : false,
    });

    switch (decision.type) {
      case "move": {
        const from = current.cell;
        const reservation = world.requestReservation({
          ownerId: enemy.id,
          purpose: "movement",
          activeStep: true,
          cells: [decision.destination],
        });
        if (!reservation.granted) {
          world.setEnemyDecision(enemy.id, "wait");
          events.push({ type: "enemy_waited", enemyId: enemy.id });
          break;
        }
        world.setEnemyFacing(enemy.id, decision.facing);
        world.setEnemyDecision(enemy.id, "move");
        world.moveEntity(enemy.id, decision.destination);
        world.releaseReservation(enemy.id);
        events.push({ type: "enemy_moved", enemyId: enemy.id, from, to: decision.destination });
        break;
      }
      case "attack": {
        const cells = decision.cells.filter((cell) => world.isInside(cell));
        world.setEnemyFacing(enemy.id, decision.facing);
        world.setEnemyDecision(enemy.id, "attack");
        const committed = world.commitEnemyAttack(
          enemy.id,
          committedAttackFromDecision({ ...decision, cells }),
        );
        events.push({ type: "enemy_attack_committed", enemyId: enemy.id, attack: committed });
        const telegraph = world.getTelegraph(enemy.id);
        if (telegraph) events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: false });
        break;
      }
      case "wait":
        world.setEnemyDecision(enemy.id, "wait");
        events.push({ type: "enemy_waited", enemyId: enemy.id });
        break;
    }
  }

  return events;
}
