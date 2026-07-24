import type { CombatEvent } from "../events/combat-events";
import { collectTerminalEntityIds } from "../events/terminal-entities";
import { isTerminalPhase } from "../model/types";
import type { World } from "../world/world";
import type { WavePhaseContext } from "./wave-phase";
import { resolveWavePhase } from "./wave-phase";
import type { GameCommand } from "./commands";
import { resolveEnemyPhaseSlots, type EnemyPhaseSlotResult } from "./enemy-phase";
import { resolvePlayerAction } from "./player-actions";

export interface TurnPlayback {
  readonly player: {
    readonly actorId: string;
    readonly events: readonly CombatEvent[];
  };
  readonly enemies: readonly EnemyPhaseSlotResult[];
  readonly trailingEvents: readonly CombatEvent[];
}

export interface ActionResolution {
  readonly accepted: boolean;
  readonly consumedTime?: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
  /** Session-only playback grouping; flat `events` remains the authoritative semantic stream. */
  readonly turnPlayback?: TurnPlayback;
}

/**
 * Finalizes an accepted command by removing every entity its own event batch resolved terminally.
 * This runs after the outcome decision so the legacy all-enemies-terminal victory scan still sees
 * them, and after `recordEvents` so the emitted batch still describes what was removed. Entities
 * made terminal outside a command (direct `setPhase`/`applyDamage` in focused tests or fixtures)
 * have no terminal event here and are deliberately left in place.
 */
function purgeTerminalEntities(world: World, events: readonly CombatEvent[]): void {
  for (const id of collectTerminalEntityIds(events)) {
    const entity = world.getEntity(id);
    if (entity && isTerminalPhase(entity.phase)) {
      world.removeEntity(id);
    }
  }
}

function finishAccepted(
  world: World,
  command: GameCommand,
  events: readonly CombatEvent[],
  waveContext: WavePhaseContext | undefined,
): ActionResolution {
  const advanced = world.advancePlayerAction();
  const enemySlots = resolveEnemyPhaseSlots(world);
  world.clearMobilityInvulnerability(command.actorId);
  const waveResult = resolveWavePhase(world, waveContext);
  const outcome = world.updateEncounterOutcome(
    world.waveRuntime ? { victoryReady: waveResult.victoryReady } : undefined,
  );
  const playerEvents: CombatEvent[] = [
    {
      type: "command_resolved",
      commandType: command.type,
      accepted: true,
      consumedTime: true,
    },
    ...events,
  ];
  const trailingEvents: CombatEvent[] = [
    ...waveResult.events,
    ...(outcome && outcome !== "running" ? [{ type: "encounter_ended", outcome } as const] : []),
    advanced,
  ];
  const completeEvents: CombatEvent[] = [
    ...playerEvents,
    ...enemySlots.flatMap((slot) => slot.events),
    ...trailingEvents,
  ];
  world.recordEvents(completeEvents);
  purgeTerminalEntities(world, completeEvents);
  return {
    accepted: true,
    consumedTime: true,
    events: completeEvents,
    turnPlayback: {
      player: { actorId: command.actorId, events: playerEvents },
      enemies: enemySlots,
      trailingEvents,
    },
  };
}

export function resolveCommand(world: World, command: GameCommand, waveContext?: WavePhaseContext): ActionResolution {
  if (world.outcome !== "running") {
    return { accepted: false, consumedTime: false, reason: "Encounter has ended.", events: [] };
  }
  if (world.pendingRewardOffer) {
    return {
      accepted: false,
      consumedTime: false,
      reason: "A reward selection is pending.",
      events: [],
    };
  }
  if (world.pendingMilestoneDecision) {
    return {
      accepted: false,
      consumedTime: false,
      reason: "A milestone decision is pending.",
      events: [],
    };
  }

  const playerResult = resolvePlayerAction(world, command);
  if (!playerResult.accepted) {
    return {
      accepted: false,
      consumedTime: false,
      reason: playerResult.reason,
      events: [],
    };
  }

  return finishAccepted(world, command, playerResult.events, waveContext);
}
