import { describe, expect, it } from "vitest";
import { resolveCommand } from "../../../src/core/actions/action-resolver";
import { createEnemyNavigationArena } from "../../../src/harness/fixtures/enemy-navigation-arena";

describe("enemy navigation testbed scenario", () => {
  it("creates the deterministic 10x10 twenty-enemy pathfinding arena", () => {
    const world = createEnemyNavigationArena("enemy-navigation-test");
    const entities = world.listEntities();
    const enemies = entities.filter((entity) => entity.kind === "enemy");

    expect(world.snapshot().arena).toMatchObject({ width: 10, height: 10 });
    expect(enemies).toHaveLength(20);
    expect(enemies.filter((enemy) => enemy.archetype === "slash")).toHaveLength(10);
    expect(enemies.filter((enemy) => enemy.archetype === "thrust")).toHaveLength(10);
    expect(world.snapshot().reservations).toHaveLength(7);
    expect(world.requireEntity("player")).toMatchObject({
      damageImmune: true,
      mobility: { kind: "dash", cooldown: 0, remainingCooldown: 0 },
    });
    expect(world.applyDamage("player", 999)).toBeUndefined();
    expect(world.requireEntity("player").hp).toBe(100);
    expect(world.snapshot().outcome).toBe("running");
  });

  it("keeps Dash available after every accepted navigation probe", () => {
    const world = createEnemyNavigationArena("enemy-navigation-dash-test");
    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 1,
    });

    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player").mobility).toMatchObject({ cooldown: 0, remainingCooldown: 0 });
  });
});
