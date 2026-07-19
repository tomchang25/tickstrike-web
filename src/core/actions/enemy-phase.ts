import type { CombatEvent } from "../events/combat-events";
import type { EntityState } from "../model/types";
import type { World } from "../world/world";
import {
  committedAttackFromDecision,
  decideEnemyAction,
  type EnemyDecision,
} from "../enemies/basic-enemy-actions";

function enabledEnemies(world: World): readonly EntityState[] {
  return world.listEntities().filter(
    (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
  );
}

interface EnemyDecisionRecord {
  readonly enemy: EntityState;
  readonly decision: EnemyDecision;
}

type MovementDecision = EnemyDecisionRecord & {
  readonly decision: Extract<EnemyDecision, { type: "move" }>;
};

export function resolveEnemyPhase(world: World): CombatEvent[] {
  const enemies = enabledEnemies(world);
  const readyAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "ready").map((enemy) => enemy.id),
  );
  const recoveringAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "recovering").map((enemy) => enemy.id),
  );
  const recoveredThisPhase = new Set<string>();
  const events: CombatEvent[] = [];
  const decisions: EnemyDecisionRecord[] = [];
  const movementEvents = new Map<string, Extract<CombatEvent, { type: "enemy_moved" | "enemy_waited" }>>();

  for (const enemy of enemies) {
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "telegraphing") continue;
    const telegraph = world.getTelegraph(enemy.id);
    const attack = world.decrementEnemyAttackWarning(enemy.id);
    if (!attack || attack.warningTicks > 0) continue;

    const resolution = world.resolveCommittedEnemyAttack(enemy.id);
    if (!resolution) continue;
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
    const decision = decideEnemyAction({
      enemy: current,
      playerCell: world.playerCell,
      canMove: (destination) => destination.x !== world.playerCell?.x || destination.y !== world.playerCell?.y
        ? world.isWalkable(destination)
        : false,
    });
    decisions.push({ enemy: current, decision });
  }

  const movementDecisions = decisions.filter(
    (candidate): candidate is MovementDecision => candidate.decision.type === "move",
  );
  const movementReservations = world.requestMovementReservations(
    movementDecisions.map(({ enemy, decision }) => ({
      ownerId: enemy.id,
      purpose: "movement" as const,
      activeStep: true as const,
      cells: [decision.destination],
    })),
  );

  try {
    for (const [index, candidate] of movementDecisions.entries()) {
      const reservation = movementReservations[index];
      if (!reservation?.granted) {
        movementEvents.set(candidate.enemy.id, { type: "enemy_waited", enemyId: candidate.enemy.id });
        continue;
      }
      const current = world.getEntity(candidate.enemy.id);
      if (!current || current.phase !== "alive") {
        movementEvents.set(candidate.enemy.id, { type: "enemy_waited", enemyId: candidate.enemy.id });
        continue;
      }
      const from = current.cell;
      world.setEnemyFacing(current.id, candidate.decision.facing);
      world.setEnemyDecision(current.id, "move");
      world.moveEntity(current.id, candidate.decision.destination);
      movementEvents.set(current.id, {
        type: "enemy_moved",
        enemyId: current.id,
        from,
        to: candidate.decision.destination,
      });
    }
  } finally {
    for (const candidate of movementDecisions) world.releaseReservation(candidate.enemy.id);
  }

  for (const { enemy, decision } of decisions) {
    switch (decision.type) {
      case "move": {
        const movementEvent = movementEvents.get(enemy.id);
        if (movementEvent) {
          if (movementEvent.type === "enemy_waited") world.setEnemyDecision(enemy.id, "wait");
          events.push(movementEvent);
        }
        break;
      }
      case "attack": {
        const cells = decision.cells.filter((cell) => world.isInside(cell));
        if (cells.length === 0) {
          world.setEnemyDecision(enemy.id, "wait");
          events.push({ type: "enemy_waited", enemyId: enemy.id });
          break;
        }
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
