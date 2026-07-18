import { createShippedArena as createShippedArenaGeometry } from "../../core/world/arena";
import { World } from "../../core/world/world";

export function createShippedArena(): World {
  return new World(createShippedArenaGeometry());
}
