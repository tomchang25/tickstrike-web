import type { CombatEvent } from "../events/combat-events";
import { sameCell, type EntityState } from "../model/types";
import type { EnemyPhaseContext } from "../enemies/enemy-behavior";
import { committedAttackFromDecision, decideEnemyAction, type EnemyActionDecision } from "../enemies/enemy-actions";
import { getEnemyBehavior } from "../enemies/behaviors";
import { genericDetonationEvents } from "../enemies/attack-resolution-events";

export type { EnemyPhaseContext } from "../enemies/enemy-behavior";

export interface EnemyPhaseSlotResult {
  readonly actorId: string;
  readonly events: readonly CombatEvent[];
  readonly postSlotState?: EntityState;
}

function enabledEnemies(context: EnemyPhaseContext): readonly EntityState[] {
  return context
    .listEntities()
    .filter((entity) => entity.kind === "enemy" && entity.enemyAction !== undefined && entity.phase === "alive");
}

function resolveTelegraphingSlot(context: EnemyPhaseContext, enemy: EntityState): CombatEvent[] {
  const events: CombatEvent[] = [];
  const behavior = getEnemyBehavior(enemy.enemyAction!.role);
  if (behavior.retarget) {
    events.push(...behavior.retarget(context, enemy));
  }

  const telegraph = context.board.getTelegraph(enemy.id);
  const attack = context.combat.decrementEnemyAttackWarning(enemy.id);
  if (!attack || attack.warningTicks > 0) {
    return events;
  }

  const resolved = behavior.resolveAttack
    ? behavior.resolveAttack(context, enemy.id, telegraph)
    : genericDetonationEvents(context, enemy.id, telegraph);
  if (resolved) {
    events.push(...resolved);
  }
  return events;
}

function decideAtSlot(context: EnemyPhaseContext, enemy: EntityState): EnemyActionDecision {
  const otherCommittedAttacks = context
    .listEntities()
    .flatMap((entity) => (entity.id !== enemy.id && entity.committedAttack ? [entity.committedAttack] : []));

  return decideEnemyAction({
    enemy,
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
}

function applyDecisionAtSlot(
  context: EnemyPhaseContext,
  enemy: EntityState,
  decision: EnemyActionDecision,
): CombatEvent[] {
  switch (decision.type) {
    case "move": {
      const candidate = decision.candidates.find(({ destination }) => context.board.isWalkable(destination));
      if (!candidate) {
        context.combat.setEnemyDecision(enemy.id, "wait");
        return [{ type: "enemy_waited", enemyId: enemy.id }];
      }

      context.combat.setEnemyFacing(enemy.id, candidate.facing);
      context.combat.setEnemyDecision(enemy.id, "move");
      context.moveEntity(enemy.id, candidate.destination);
      if (getEnemyBehavior(enemy.enemyAction!.role).restsAfterMove) {
        context.combat.setEnemyResting(enemy.id);
      }
      return [
        {
          type: "enemy_moved",
          enemyId: enemy.id,
          from: enemy.cell,
          to: candidate.destination,
        },
      ];
    }
    case "attack": {
      const cells = decision.cells.filter((cell) => context.board.isInside(cell));
      if (cells.length === 0) {
        context.combat.setEnemyDecision(enemy.id, "wait");
        return [{ type: "enemy_waited", enemyId: enemy.id }];
      }

      context.combat.setEnemyFacing(enemy.id, decision.facing);
      context.combat.setEnemyDecision(enemy.id, "attack");
      const committed = context.combat.commitEnemyAttack(enemy.id, committedAttackFromDecision({ ...decision, cells }));
      const events: CombatEvent[] = [{ type: "enemy_attack_committed", enemyId: enemy.id, attack: committed }];
      const telegraph = context.board.getTelegraph(enemy.id);
      if (telegraph) {
        events.push({ type: "telegraph_changed", sourceId: enemy.id, telegraph, cleared: false });
      }
      return events;
    }
    case "wait":
      context.combat.setEnemyDecision(enemy.id, "wait");
      return [{ type: "enemy_waited", enemyId: enemy.id }];
  }
}

export function resolveEnemyPhaseSlots(context: EnemyPhaseContext): readonly EnemyPhaseSlotResult[] {
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
  const slots: EnemyPhaseSlotResult[] = [];

  for (const enemy of enemies) {
    const events: CombatEvent[] = [];
    let current = context.getEntity(enemy.id);
    if (!current?.enemyAction || current.phase !== "alive") {
      slots.push({
        actorId: enemy.id,
        events,
        postSlotState: current ? structuredClone(current) : undefined,
      });
      continue;
    }

    const activityAtSlot = current.activity;
    if (activityAtSlot === "telegraphing") {
      events.push(...resolveTelegraphingSlot(context, current));
    }

    events.push(...context.combat.advanceEnemyStatus(enemy.id));
    current = context.getEntity(enemy.id);
    if (!current?.enemyAction || current.phase !== "alive") {
      slots.push({
        actorId: enemy.id,
        events,
        postSlotState: current ? structuredClone(current) : undefined,
      });
      continue;
    }
    if (activityAtSlot === "staggered") {
      slots.push({ actorId: enemy.id, events, postSlotState: structuredClone(current) });
      continue;
    }

    let recoveredThisSlot = false;
    if (current.activity === "recovering" && recoveringAtStart.has(enemy.id)) {
      recoveredThisSlot = context.combat.advanceEnemyRecovery(enemy.id);
      if (recoveredThisSlot) {
        events.push({ type: "enemy_recovered", enemyId: enemy.id });
      }
    }

    current = context.getEntity(enemy.id);
    if (!current?.enemyAction || current.phase !== "alive") {
      slots.push({
        actorId: enemy.id,
        events,
        postSlotState: current ? structuredClone(current) : undefined,
      });
      continue;
    }
    if (current.activity === "resting" && restingAtStart.has(enemy.id)) {
      context.combat.advanceEnemyRest(enemy.id);
      current = context.getEntity(enemy.id);
      slots.push({
        actorId: enemy.id,
        events,
        postSlotState: current ? structuredClone(current) : undefined,
      });
      continue;
    }
    if (current.activity !== "ready" || (!readyAtStart.has(enemy.id) && !recoveredThisSlot)) {
      slots.push({ actorId: enemy.id, events, postSlotState: structuredClone(current) });
      continue;
    }

    events.push(...applyDecisionAtSlot(context, current, decideAtSlot(context, current)));
    current = context.getEntity(enemy.id);
    slots.push({
      actorId: enemy.id,
      events,
      postSlotState: current ? structuredClone(current) : undefined,
    });
  }

  return slots;
}

export function resolveEnemyPhase(context: EnemyPhaseContext): CombatEvent[] {
  return resolveEnemyPhaseSlots(context).flatMap((slot) => slot.events);
}
