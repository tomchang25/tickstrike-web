import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { requireScenario } from "@harness/scenario-registry";

describe("Charge motion ownership scenario", () => {
  it("produces same-direction Player movement, knockback, side push, and landing", () => {
    const scenario = requireScenario("charge-enemy");
    const world = scenario.createWorld(scenario.seed);
    const moveLeft = { type: "move" as const, actorId: "player", direction: { x: -1, y: 0 } };

    resolveCommand(world, moveLeft);
    resolveCommand(world, moveLeft);
    const result = resolveCommand(world, moveLeft);

    expect(result.events.map((event) => event.type)).toContain("actor_moved");
    expect(result.events).toContainEqual({
      type: "actor_moved",
      entityId: "player",
      from: { x: 5, y: 3 },
      to: { x: 4, y: 3 },
    });
    expect(result.events).toContainEqual({
      type: "entity_displaced",
      entityId: "player",
      from: { x: 4, y: 3 },
      to: { x: 3, y: 3 },
      cause: "charge_target_knockback",
    });
    expect(result.events).toContainEqual({
      type: "entity_displaced",
      entityId: "enemy-side-blocker",
      from: { x: 8, y: 3 },
      to: { x: 8, y: 2 },
      cause: "charge_side_push",
    });
    expect(result.events).toContainEqual({
      type: "charge_landed",
      enemyId: "enemy-charge",
      from: { x: 9, y: 3 },
      to: { x: 4, y: 3 },
    });
    expect(world.requireEntity("player").cell).toEqual({ x: 3, y: 3 });
  });
});
