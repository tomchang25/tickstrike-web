import type { CombatEvent } from "../events/combat-events";
import { sameCell, type DamageResult, type EntityId, type EntityState } from "../model/types";
import type { ChargeAttackResolution, World } from "../world/world";
import {
  chargeLiveRetarget,
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

function damageEventsFor(
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
    if (damage.killed) events.push({ type: "player_died", playerId: targetId, cell: target.cell });
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
  if (damage.killed) events.push({ type: "enemy_died", enemyId: targetId, attackerId, cell: target.cell });
  return events;
}

function chargeResolutionEvents(
  world: World,
  enemyId: EntityId,
  resolution: ChargeAttackResolution,
): CombatEvent[] {
  const events: CombatEvent[] = [
    { type: "enemy_attack_detonated", enemyId, attack: resolution.attack, target: resolution.impact.cell },
  ];

  for (const displacement of resolution.displacements) {
    if (displacement.blocked && displacement.damage) {
      events.push(...damageEventsFor(world, enemyId, displacement.entityId, displacement.damage));
    }
  }

  if (resolution.impact.targetId) {
    events.push({
      type: "charge_impact",
      enemyId,
      targetId: resolution.impact.targetId,
      cell: resolution.impact.cell,
      outcome: resolution.impact.outcome,
    });
    if (resolution.impact.damage) {
      events.push(...damageEventsFor(world, enemyId, resolution.impact.targetId, resolution.impact.damage));
    }
  } else {
    events.push({ type: "charge_impact", enemyId, cell: resolution.impact.cell, outcome: "empty" });
  }

  for (const displacement of resolution.displacements) {
    if (!displacement.blocked && displacement.to) {
      events.push({
        type: "entity_displaced",
        entityId: displacement.entityId,
        from: displacement.from,
        to: displacement.to,
        cause: "charge_side_push",
      });
    }
  }
  if (resolution.impact.outcome === "normal" && resolution.impact.targetId && resolution.impact.to) {
    events.push({
      type: "entity_displaced",
      entityId: resolution.impact.targetId,
      from: resolution.impact.from!,
      to: resolution.impact.to,
      cause: "charge_target_knockback",
    });
  }

  events.push({ type: "charge_landed", enemyId, from: resolution.landing.from, to: resolution.landing.to });
  events.push({ type: "telegraph_changed", sourceId: enemyId, cleared: true });
  events.push({ type: "enemy_recovering", enemyId, recoveryTicks: resolution.attack.recoveryTicks });
  return events;
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

    if (current.enemyAction?.role === "charge") {
      const retarget = chargeLiveRetarget(current, world.playerCell, (cell) => world.isLegalCell(cell));
      if (retarget) {
        const result = world.retargetChargeAttack(current.id, retarget.path, retarget.facing);
        if (result.changed && result.telegraph) {
          events.push({ type: "telegraph_changed", sourceId: current.id, telegraph: result.telegraph, cleared: false });
        }
      }
    }

    const telegraph = world.getTelegraph(enemy.id);
    const attack = world.decrementEnemyAttackWarning(enemy.id);
    if (!attack || attack.warningTicks > 0) continue;

    if (current.enemyAction?.role === "charge") {
      const chargeResolution = world.resolveChargeAttack(enemy.id);
      if (!chargeResolution) continue;
      events.push(...chargeResolutionEvents(world, enemy.id, chargeResolution));
      continue;
    }

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
      isLegalTerrain: (cell) => world.isLegalCell(cell),
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
