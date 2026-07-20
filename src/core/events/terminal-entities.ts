import type { EntityId } from "../model/types";
import type { CombatEvent } from "./combat-events";

/**
 * Collects the entities an event batch has terminally resolved. This is the single
 * event-to-lifecycle handoff: the accepted-command resolver removes exactly these entities from
 * the world, and presentation retains exactly these views as ghosts. A self-destructing bomb
 * reports both `enemy_self_destructed` and `enemy_died` for the same id, so the set deduplicates
 * rather than yielding one entry per terminal event.
 */
export function collectTerminalEntityIds(events: readonly CombatEvent[]): ReadonlySet<EntityId> {
  const ids = new Set<EntityId>();
  for (const event of events) {
    switch (event.type) {
      case "enemy_died":
      case "enemy_self_destructed":
      case "enemy_crushed":
      case "enemy_entered_water":
        ids.add(event.enemyId);
        break;
      case "player_died":
        ids.add(event.playerId);
        break;
      default:
        break;
    }
  }
  return ids;
}
