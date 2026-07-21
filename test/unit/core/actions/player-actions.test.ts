import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { resolveSmashCancel } from "@core/actions/player-actions";
import { createTrainingArena } from "@harness/fixtures/training-arena";
import type { World } from "@core/world/world";

function armedSmashWorld(): World {
  const world = createTrainingArena();
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell: { x: 3, y: 3 },
    hp: 100,
    mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
  });
  const armed = resolveCommand(world, { type: "smash", actorId: "player", target: { x: 4, y: 3 } });
  expect(armed.accepted).toBe(true);
  expect(world.snapshot()).toMatchObject({ tick: 1, armedSmashTarget: { x: 4, y: 3 } });
  return world;
}

describe("resolveSmashCancel", () => {
  it("clears the armed windup without advancing the Tick or applying a cooldown", () => {
    const world = armedSmashWorld();

    const result = resolveSmashCancel(world);

    expect(result.accepted).toBe(true);
    expect(result.events).toEqual([{ type: "smash_cancelled", target: { x: 4, y: 3 } }]);
    const snapshot = world.snapshot();
    expect(snapshot.armedSmashTarget).toBeUndefined();
    expect(snapshot.tick).toBe(1);
    expect(snapshot.lastEvents).toEqual([{ type: "smash_cancelled", target: { x: 4, y: 3 } }]);
    const player = snapshot.entities.find((entity) => entity.id === "player");
    expect(player?.mobility?.remainingCooldown).toBe(0);
  });

  it("rejects with no state change when nothing is armed", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });

    const result = resolveSmashCancel(world);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.events).toEqual([]);
    expect(world.snapshot().armedSmashTarget).toBeUndefined();
  });

  it("allows re-arming after a cancel", () => {
    const world = armedSmashWorld();
    resolveSmashCancel(world);

    const rearmed = resolveCommand(world, { type: "smash", actorId: "player", target: { x: 4, y: 3 } });

    expect(rearmed.accepted).toBe(true);
    expect(world.snapshot()).toMatchObject({ armedSmashTarget: { x: 4, y: 3 } });
  });
});
