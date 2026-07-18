import { describe, expect, it } from "vitest";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { commandConsumesTime, type GameCommand } from "../../../../src/core/actions/commands";
import { createFoundationArena } from "../../../../src/harness/fixtures/shipped-arena";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import { spawnTrainingEnemies } from "../../../../src/harness/fixtures/spawn-training-enemies";

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

describe("player verbs", () => {
  it("accepts an occupied-cell Normal Attack and an empty-cell whiff", () => {
    const world = createFoundationArena();

    const occupied = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(occupied.accepted).toBe(true);
    expect(occupied.events).toEqual([
      { type: "player_attacked", actorId: "player", target: { x: 5, y: 6 } },
    ]);
    expect(occupied.semanticEvents?.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy-thrust").phase).toBe("alive");
    expect(world.snapshot().tick).toBe(1);
    expect(world.snapshot().lastEvents).toEqual(occupied.semanticEvents);

    const whiff = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: -1 },
    });

    expect(whiff.accepted).toBe(true);
    expect(whiff.events).toEqual([
      { type: "player_attacked", actorId: "player", target: { x: 6, y: 5 } },
    ]);
    expect(world.snapshot().tick).toBe(2);
  });

  it("dashes through legal cells and stops before an occupied cell", () => {
    const world = createFoundationArena();

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events).toEqual([
      {
        type: "player_dashed",
        actorId: "player",
        from: { x: 6, y: 6 },
        to: { x: 7, y: 6 },
        path: [{ x: 7, y: 6 }],
      },
    ]);
    expect(world.playerCell).toEqual({ x: 7, y: 6 });
    expect(world.getOccupantAt({ x: 8, y: 6 })?.id).toBe("enemy-slash");
    expect(world.snapshot().tick).toBe(1);
  });

  it("rejects a Dash with no legal first cell and preserves the snapshot", () => {
    const world = createFoundationArena();
    const before = world.snapshot();

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result).toMatchObject({
      accepted: false,
      consumedTime: false,
      reason: "Dash has no legal landing cell.",
      events: [],
    });
    expect(world.snapshot()).toEqual(before);
  });

  it("limits Dash to three legal cells", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 1, y: 1 },
      hp: 100,
    });

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(world.playerCell).toEqual({ x: 4, y: 1 });
    expect(result.events[0]).toMatchObject({
      type: "player_dashed",
      path: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
    });
    expect(world.snapshot().tick).toBe(1);
  });

  it("rejects non-cardinal Attack and Dash directions without advancing", () => {
    const world = createFoundationArena();
    const before = world.snapshot();

    const attack = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 1, y: 1 },
    });
    const dash = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 0, y: 0 },
    });

    expect(attack.accepted).toBe(false);
    expect(dash.accepted).toBe(false);
    expect(world.snapshot()).toEqual(before);
  });
});

describe("player-clocked action boundary", () => {
  it("advances once after an accepted action and not after rejection", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 1, y: 2 },
      hp: 100,
    });

    const rejected = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });
    expect(rejected.accepted).toBe(false);
    expect(world.snapshot().tick).toBe(0);

    const accepted = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.semanticEvents?.map((event) => event.type)).toEqual([
      "command_resolved",
      "actor_moved",
      "world_advanced",
    ]);
    expect(world.snapshot().tick).toBe(1);
  });

  it("marks every player verb as time-consuming", () => {
    const commands: readonly GameCommand[] = [
      { type: "move", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "attack", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "dash", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "smash", actorId: "player", target: { x: 2, y: 2 } },
    ];
    expect(commands.every(commandConsumesTime)).toBe(true);
  });
});
