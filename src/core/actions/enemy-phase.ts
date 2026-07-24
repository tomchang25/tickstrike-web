import type { CombatEvent } from "../events/combat-events";
import { sameCell, type CommittedAttack, type EntityState } from "../model/types";
import type { EnemyPhaseContext } from "../enemies/enemy-behavior";
import { committedAttackFromDecision, decideEnemyAction, type EnemyActionDecision } from "../enemies/enemy-actions";
import { getEnemyBehavior } from "../enemies/behaviors";
import { genericDetonationEvents } from "../enemies/attack-resolution-events";

export type { EnemyPhaseContext } from "../enemies/enemy-behavior";

function enabledEnemies(context: EnemyPhaseContext): readonly EntityState[] {
  return context.listEntities().filter((entity) => entity.kind === "enemy" && entity.enemyAction !== undefined);
}

/**
 * Telegraphing enemies detonate in ascending commit-tick order — whoever wound up first hits
 * first — tie-broken by the stable entity order `Array.prototype.sort` already preserves. An
 * attack committed outside `enemy-phase` (harness/test injection) carries no stamp and sorts
 * as earliest, matching today's unstamped stable-order behavior. Written as explicit branches
 * rather than subtracting a sentinel so two unstamped attacks compare equal outright instead
 * of relying on how `sort` coerces a non-finite difference.
 */
function byCommitOrder(a: EntityState, b: EntityState): number {
  const aTick = a.committedAttack?.commitTick;
  const bTick = b.committedAttack?.commitTick;
  if (aTick === bTick) {
    return 0;
  }
  if (aTick === undefined) {
    return -1;
  }
  if (bTick === undefined) {
    return 1;
  }
  return aTick - bTick;
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

export function resolveEnemyPhase(context: EnemyPhaseContext): CombatEvent[] {
  const enemies = enabledEnemies(context);
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

  for (const enemy of [...enemies].sort(byCommitOrder)) {
    const current = context.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "telegraphing") {
      continue;
    }

    const behavior = current.enemyAction ? getEnemyBehavior(current.enemyAction.role) : undefined;
    if (behavior?.retarget) {
      events.push(...behavior.retarget(context, current));
    }

    const telegraph = context.board.getTelegraph(enemy.id);
    const attack = context.combat.decrementEnemyAttackWarning(enemy.id);
    if (!attack || attack.warningTicks > 0) {
      continue;
    }

    const resolved = behavior?.resolveAttack
      ? behavior.resolveAttack(context, enemy.id, telegraph)
      : genericDetonationEvents(context, enemy.id, telegraph);
    if (resolved) {
      events.push(...resolved);
    }
  }

  events.push(...context.combat.advanceEnemyStatuses());

  for (const enemy of enemies) {
    if (!recoveringAtStart.has(enemy.id)) {
      continue;
    }
    if (context.combat.advanceEnemyRecovery(enemy.id)) {
      recoveredThisPhase.add(enemy.id);
      events.push({ type: "enemy_recovered", enemyId: enemy.id });
    }
  }

  for (const enemy of enemies) {
    if (!restingAtStart.has(enemy.id)) {
      continue;
    }
    context.combat.advanceEnemyRest(enemy.id);
  }

  // Pre-existing commitments are read once: nothing commits between here and the apply loop
  // below, so this set is static for the whole decision pass and re-reading it per enemy would
  // just re-clone every entity.
  const standingCommitments = context
    .listEntities()
    .filter((entity) => entity.committedAttack)
    .map((entity) => ({ ownerId: entity.id, attack: entity.committedAttack! }));

  // Accumulates this phase's own attack decisions as they're made, so a later enemy in
  // iteration order sees an earlier same-tick sibling's claim — "first to decide claims it" —
  // alongside every already-telegraphing enemy's pre-existing committed attack.
  const decidedAttacksThisPhase: CommittedAttack[] = [];

  for (const enemy of enemies) {
    if (!readyAtStart.has(enemy.id) && !recoveredThisPhase.has(enemy.id)) {
      continue;
    }
    const current = context.getEntity(enemy.id);
    if (!current || current.phase !== "alive" || current.activity !== "ready") {
      continue;
    }
    const otherCommittedAttacks: CommittedAttack[] = [
      ...decidedAttacksThisPhase,
      ...standingCommitments.filter((held) => held.ownerId !== current.id).map((held) => held.attack),
    ];
    const decision = decideEnemyAction({
      enemy: current,
      playerCell: context.playerCell,
      isInside: (cell) => context.board.isInside(cell),
      canMove: (destination) =>
        destination.x !== context.playerCell?.x || destination.y !== context.playerCell?.y
          ? context.board.isWalkable(destination)
          : false,
      canPathThrough: (cell) =>
        context.board.isLegalCell(cell) && (context.playerCell === undefined || !sameCell(cell, context.playerCell)),
      canEndAt: (cell) => context.board.isWalkable(cell),
      isLegalTerrain: (cell) => context.board.isLegalCell(cell),
      otherCommittedAttacks,
    });
    if (decision.type === "attack") {
      // Same off-board trim and skip-if-empty the apply loop performs, so a recorded claim can
      // never name cells the eventual commitment does not.
      const claimedCells = decision.cells.filter((cell) => context.board.isInside(cell));
      if (claimedCells.length > 0) {
        decidedAttacksThisPhase.push(committedAttackFromDecision({ ...decision, cells: claimedCells }));
      }
    }
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
        pending.nextCandidate < pending.decision.candidates.length &&
        !context.board.isWalkable(pending.decision.candidates[pending.nextCandidate]!.destination)
      ) {
        pending.nextCandidate += 1;
      }
      if (pending.nextCandidate < pending.decision.candidates.length) {
        claims.push(pending);
      }
    }

    if (claims.length === 0) {
      for (const pending of pendingMovements.values()) {
        movementEvents.set(pending.enemy.id, { type: "enemy_waited", enemyId: pending.enemy.id });
      }
      pendingMovements.clear();
      break;
    }

    const reservations = context.board.requestMovementReservations(
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
        const current = context.getEntity(pending.enemy.id);
        if (!current || current.phase !== "alive") {
          movementEvents.set(pending.enemy.id, { type: "enemy_waited", enemyId: pending.enemy.id });
          continue;
        }
        const candidate = pending.decision.candidates[pending.nextCandidate]!;
        const from = current.cell;
        context.combat.setEnemyFacing(current.id, candidate.facing);
        context.combat.setEnemyDecision(current.id, "move");
        context.moveEntity(current.id, candidate.destination);
        if (current.enemyAction && getEnemyBehavior(current.enemyAction.role).restsAfterMove) {
          context.combat.setEnemyResting(current.id);
        }
        movementEvents.set(current.id, {
          type: "enemy_moved",
          enemyId: current.id,
          from,
          to: candidate.destination,
        });
      }
    } finally {
      for (const claim of claims) {
        context.board.releaseReservation(claim.enemy.id);
      }
    }

    for (const winner of winners) {
      pendingMovements.delete(winner.enemy.id);
    }
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
          if (movementEvent.type === "enemy_waited") {
            context.combat.setEnemyDecision(enemy.id, "wait");
          }
          events.push(movementEvent);
        }
        break;
      }
      case "attack": {
        const cells = decision.cells.filter((cell) => context.board.isInside(cell));
        if (cells.length === 0) {
          context.combat.setEnemyDecision(enemy.id, "wait");
          events.push({ type: "enemy_waited", enemyId: enemy.id });
          break;
        }
        context.combat.setEnemyFacing(enemy.id, decision.facing);
        context.combat.setEnemyDecision(enemy.id, "attack");
        const committed = context.combat.commitEnemyAttack(enemy.id, {
          ...committedAttackFromDecision({ ...decision, cells }),
          commitTick: context.tick,
        });
        events.push({ type: "enemy_attack_committed", enemyId: enemy.id, attack: committed });
        const telegraph = context.board.getTelegraph(enemy.id);
        if (telegraph) {
          events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: false });
        }
        break;
      }
      case "wait":
        context.combat.setEnemyDecision(enemy.id, "wait");
        events.push({ type: "enemy_waited", enemyId: enemy.id });
        break;
    }
  }

  return events;
}
