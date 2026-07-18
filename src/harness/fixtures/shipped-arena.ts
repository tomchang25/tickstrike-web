import { createShippedArena as createShippedArenaGeometry } from "../../core/world/arena";
import { World } from "../../core/world/world";
import type { Seed } from "../../core/model/types";

export const SHIPPED_SCENARIO_SEED = "tick-arena-foundation";

export function createShippedArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  return new World(createShippedArenaGeometry(), seed);
}

export function createFoundationArena(seed: Seed = SHIPPED_SCENARIO_SEED): World {
  const world = createShippedArena(seed);
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell: { x: 6, y: 6 },
    hp: 100,
  });
  world.spawn({
    id: "enemy-thrust",
    kind: "enemy",
    archetype: "thrust",
    cell: { x: 4, y: 6 },
    hp: 10,
  });
  world.spawn({
    id: "enemy-slash",
    kind: "enemy",
    archetype: "slash",
    cell: { x: 8, y: 6 },
    hp: 10,
  });
  world.spawn({
    id: "enemy-ranged",
    kind: "enemy",
    archetype: "ranged",
    cell: { x: 6, y: 4 },
    hp: 10,
  });
  return world;
}
