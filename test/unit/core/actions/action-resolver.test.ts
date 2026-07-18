import { describe, expect, it } from "vitest";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import { spawnTrainingEnemies } from "../../../../src/harness/fixtures/spawn-training-enemies";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";

function createWorld() {
  const world = createTrainingArena();
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell: { x: 3, y: 3 },
    hp: 100,
  });
  spawnTrainingEnemies(world);
  return world;
}

describe("Smash action", () => {
  it("crushes the center, knocks one enemy, and sends one into water", () => {
    const world = createWorld();

    const result = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 4, y: 3 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "smash_impact",
      "enemy_crushed",
      "enemy_knocked",
      "enemy_entered_water",
    ]);
    expect(world.requireEntity("enemy-center").phase).toBe("dead");
    expect(world.requireEntity("enemy-right").cell).toEqual({ x: 7, y: 3 });
    expect(world.requireEntity("enemy-water")).toMatchObject({
      cell: { x: 4, y: 6 },
      phase: "drowning",
    });
    expect(world.getOccupantAt({ x: 4, y: 3 })).toBeUndefined();
    expect(world.getOccupantAt({ x: 4, y: 6 })).toBeUndefined();
    expect(world.listEntities()).toHaveLength(4);

    world.spawn({
      id: "replacement",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 3 },
      hp: 10,
    });
    expect(world.getOccupantAt({ x: 4, y: 3 })?.id).toBe("replacement");
    expect(world.snapshot().tick).toBe(1);
  });
});
