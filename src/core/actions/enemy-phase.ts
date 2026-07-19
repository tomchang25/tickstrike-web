import type { CombatEvent } from "../events/combat-events";
import { sameCell, type EntityState } from "../model/types";
import type { World } from "../world/world";
import {
  committedAttackFromDecision,
  decideEnemyAction,
  type EnemyActionDecision,
} from "../enemies/enemy-actions";

function enabledEnemies(world: World): readonly EntityState[] {
  return world.listEntities().filter(
    (entity) => entity.kind === "enemy" && entity.enemyAction !== undefined,
  );
}

interface EnemyDecisionRecord {
  readonly enemy: EntityState;
  readonly decision: EnemyActionDecision;
}

type MovementDecision = EnemyDecisionRecord & {
  readonly decision: Extract<EnemyActionDecision, { type: "move" }>;
};

interface PendingMovement {
  readonly enemy: EntityState;
  readonly decision: Extract<EnemyActionDecision, { type: "move" }>;
  nextCandidate: number;
}

export function resolveEnemyPhase(world: World): CombatEvent[] {
  const enemies = enabledEnemies(world);
  const readyAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "ready").map((enemy) => enemy.id),
  );
  const recoveringAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "recovering").map((enemy) => enemy.id),
  );
  const restingAtStart = new Set(
    enemies.filter((enemy) => enemy.phase === "alive" && enemy.activity === "resting").map((enemy) => enemy.id),
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
    if (!restingAtStart.has(enemy.id)) continue;
    world.advanceEnemyRest(enemy.id);
  }

  for (const enemy of enemies) {
    if (!readyAtStart.has(enemy.id) && !recoveredThisPhase.has(enemy.id)) continue;
    const current = world.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "ready") continue;
    const decision = decideEnemyAction({
      enemy: current,
      playerCell: world.playerCell,
      isInside: (cell) => world.isInside(cell),
      canMove: (destination) => destination.x !== world.playerCell?.x || destination.y !== world.playerCell?.y
        ? world.isWalkable(destination)
        : false,
      canPathThrough: (cell) => world.isLegalCell(cell)
        && (world.playerCell === undefined || !sameCell(cell, world.playerCell)),
      canEndAt: (cell) => world.isWalkable(cell),
    });
    decisions.push({ enemy: current, decision });
  }

  const movementDecisions = decisions.filter(
    (candidate): candidate is MovementDecision => candidate.decision.type === "move",
  );
  const pendingMovements = new Map<string, PendingMovement>(
    movementDecisions.map(({ enemy, decision }) => [enemy.id, { enemy, decision, nextCandidate: 0 }]),
  );

  while (pendingMovements.size > 0) {
    const claims: PendingMovement[] = [];
    for (const pending of pendingMovements.values()) {
      while (
        pending.nextCandidate < pending.decision.candidates.length
        && !world.isWalkable(pending.decision.candidates[pending.nextCandidate]!.destination)
      ) {
        pending.nextCandidate += 1;
      }
      if (pending.nextCandidate < pending.decision.candidates.length) claims.push(pending);
    }

    if (claims.length === 0) {
      for (const pending of pendingMovements.values()) {
        movementEvents.set(pending.enemy.id, { type: "enemy_waited", enemyId: pending.enemy.id });
      }
      pendingMovements.clear();
      break;
    }

    const reservations = world.requestMovementReservations(
      claims.map((pending) => ({
        ownerId: pending.enemy.id,
        purpose: "movement" as const,
        activeStep: true as const,
        cells: [pending.decision.candidates[pending.nextCandidate]!.destination],
      })),
    );
    const winners: PendingMovement[] = [];
    for (const [index, pending] of claims.entries()) {
      if (reservations[index]?.granted) {
        winners.push(pending);
      } else {
        pending.nextCandidate += 1;
      }
    }

    try {
      for (const pending of winners) {
        const current = world.getEntity(pending.enemy.id);
        if (!current || current.phase !== "alive") {
          movementEvents.set(pending.enemy.id, { type: "enemy_waited", enemyId: pending.enemy.id });
          continue;
        }
        const candidate = pending.decision.candidates[pending.nextCandidate]!;
        const from = current.cell;
        world.setEnemyFacing(current.id, candidate.facing);
        world.setEnemyDecision(current.id, "move");
        world.moveEntity(current.id, candidate.destination);
        if (current.enemyAction?.role === "ranged") world.setEnemyResting(current.id);
        movementEvents.set(current.id, {
          type: "enemy_moved",
          enemyId: current.id,
          from,
          to: candidate.destination,
        });
      }
    } finally {
      for (const claim of claims) world.releaseReservation(claim.enemy.id);
    }

    for (const winner of winners) pendingMovements.delete(winner.enemy.id);
    for (const pending of [...pendingMovements.values()]) {
      if (pending.nextCandidate >= pending.decision.candidates.length) {
        movementEvents.set(pending.enemy.id, { type: "enemy_waited", enemyId: pending.enemy.id });
        pendingMovements.delete(pending.enemy.id);
      }
    }
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
