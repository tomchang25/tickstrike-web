import type { CombatEvent } from "../events/combat-events";
import type { World } from "../world/world";
import type { GameCommand } from "./commands";
import { resolveEnemyPhase } from "./enemy-phase";
import { resolvePlayerAction } from "./player-actions";

export interface ActionResolution {
  readonly accepted: boolean;
  readonly consumedTime?: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
}

function finishAccepted(
  world: World,
  commandType: GameCommand["type"],
  events: readonly CombatEvent[],
): ActionResolution {
  const advanced = world.advancePlayerAction();
  const enemyEvents = resolveEnemyPhase(world);
  const outcome = world.updateEncounterOutcome();
  const completeEvents: CombatEvent[] = [
    {
      type: "command_resolved",
      commandType,
      accepted: true,
      consumedTime: true,
    },
    ...events,
    ...enemyEvents,
    ...(outcome && outcome !== "running" ? [{ type: "encounter_ended", outcome } as const] : []),
    advanced,
  ];
  world.recordEvents(completeEvents);
  return {
    accepted: true,
    consumedTime: true,
    events: completeEvents,
  };
}

export function resolveCommand(world: World, command: GameCommand): ActionResolution {
  if (world.outcome !== "running") {
    return { accepted: false, consumedTime: false, reason: "Encounter has ended.", events: [] };
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

  return finishAccepted(world, command.type, playerResult.events);
}
