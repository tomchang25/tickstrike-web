import type { World } from "../../core/world/world";

export function spawnTrainingEnemies(world: World): void {
  world.spawn({
    id: "enemy-center",
    kind: "enemy",
    archetype: "grunt",
    cell: { x: 4, y: 3 },
    hp: 10,
  });
  world.spawn({
    id: "enemy-right",
    kind: "enemy",
    archetype: "grunt",
    cell: { x: 5, y: 3 },
    hp: 10,
  });
  world.spawn({
    id: "enemy-water",
    kind: "enemy",
    archetype: "grunt",
    cell: { x: 4, y: 4 },
    hp: 10,
  });
}
