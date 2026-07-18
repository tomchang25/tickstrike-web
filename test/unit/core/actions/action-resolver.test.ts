import { describe, expect, it } from "vitest";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { commandConsumesTime, type GameCommand } from "../../../../src/core/actions/commands";
import { createFoundationArena } from "../../../../src/harness/fixtures/shipped-arena";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";

describe("Smash action", () => {
  it("arms on the first action and releases the locked landing on the second", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobilityAttackDamage: 30,
    });
    world.spawn({ id: "enemy-center", kind: "enemy", archetype: "training-grunt", cell: { x: 3, y: 2 }, hp: 100 });
    world.spawn({ id: "enemy-right", kind: "enemy", archetype: "training-grunt", cell: { x: 5, y: 3 }, hp: 100 });
    world.spawn({ id: "enemy-water", kind: "enemy", archetype: "training-grunt", cell: { x: 4, y: 4 }, hp: 100 });

    const armed = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 4, y: 3 },
    });

    expect(armed.accepted).toBe(true);
    expect(armed.events).toEqual([
      { type: "smash_armed", actorId: "player", target: { x: 4, y: 3 } },
    ]);
    expect(world.snapshot()).toMatchObject({ tick: 1, armedSmashTarget: { x: 4, y: 3 } });

    const result = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 0, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "smash_impact",
      "enemy_damaged",
      "enemy_knocked",
      "enemy_damaged",
      "enemy_knocked",
      "enemy_damaged",
      "enemy_entered_water",
      "actor_moved",
    ]);
    expect(world.requireEntity("enemy-center").phase).toBe("alive");
    expect(world.requireEntity("enemy-center").hp).toBe(70);
    expect(world.requireEntity("enemy-center").cell).toEqual({ x: 3, y: 1 });
    expect(world.requireEntity("enemy-right").hp).toBe(70);
    expect(world.requireEntity("enemy-right").cell).toEqual({ x: 7, y: 3 });
    expect(world.requireEntity("enemy-water")).toMatchObject({
      cell: { x: 4, y: 6 },
      hp: 70,
      phase: "drowning",
    });
    expect(world.playerCell).toEqual({ x: 4, y: 3 });
    expect(world.getOccupantAt({ x: 4, y: 6 })).toBeUndefined();
    expect(world.listEntities()).toHaveLength(4);
    expect(world.snapshot().armedSmashTarget).toBeUndefined();
    expect(world.snapshot().tick).toBe(2);
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
      {
        type: "player_attacked",
        actorId: "player",
        target: { x: 5, y: 6 },
        hit: {
          attackerId: "player",
          targetId: "enemy-thrust",
          damage: 20,
          hpBefore: 100,
          hpAfter: 80,
          killed: false,
        },
      },
      {
        type: "enemy_damaged",
        enemyId: "enemy-thrust",
        hit: {
          attackerId: "player",
          targetId: "enemy-thrust",
          damage: 20,
          hpBefore: 100,
          hpAfter: 80,
          killed: false,
        },
        hp: 80,
        maxHp: 100,
      },
    ]);
    expect(occupied.semanticEvents?.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "enemy_damaged",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy-thrust")).toMatchObject({ hp: 80, phase: "alive" });
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

  it("kills an enemy on an overkill Normal Attack and releases its cell immediately", () => {
    const world = createFoundationArena();
    world.applyDamage("enemy-thrust", 95);

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "player_attacked",
      "enemy_damaged",
      "enemy_died",
    ]);
    expect(world.requireEntity("enemy-thrust")).toMatchObject({ hp: 0, maxHp: 100, phase: "dead" });
    expect(world.getOccupantAt({ x: 5, y: 6 })).toBeUndefined();
    expect(world.snapshot().tick).toBe(1);
  });

  it("dashes through an enemy and lands on the farthest later empty cell", () => {
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
        to: { x: 9, y: 6 },
        path: [{ x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 }],
      },
      {
        type: "enemy_damaged",
        enemyId: "enemy-slash",
        hit: {
          attackerId: "player",
          targetId: "enemy-slash",
          damage: 30,
          hpBefore: 100,
          hpAfter: 70,
          killed: false,
        },
        hp: 70,
        maxHp: 100,
      },
    ]);
    expect(world.playerCell).toEqual({ x: 9, y: 6 });
    expect(world.getOccupantAt({ x: 8, y: 6 })?.id).toBe("enemy-slash");
    expect(world.requireEntity("enemy-slash")).toMatchObject({ hp: 70, phase: "alive" });
    expect(world.snapshot().tick).toBe(1);
  });

  it("keeps Smash armed when its locked landing becomes blocked", () => {
    const world = createFoundationArena();
    const armed = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 7, y: 7 },
    });
    expect(armed.accepted).toBe(true);

    world.spawn({ id: "smash-blocker", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 7 }, hp: 10 });
    const beforeRelease = world.snapshot();
    const release = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 0, y: 0 },
    });

    expect(release).toMatchObject({
      accepted: false,
      consumedTime: false,
      reason: "Smash landing is blocked.",
      events: [],
    });
    expect(world.snapshot()).toMatchObject({
      tick: beforeRelease.tick,
      armedSmashTarget: { x: 7, y: 7 },
    });
  });

  it("rejects a Dash when every traversed cell is occupied by an enemy", () => {
    const world = createFoundationArena();
    world.removeEntity("enemy-thrust");
    world.removeEntity("enemy-slash");
    world.removeEntity("enemy-ranged");
    world.spawn({ id: "enemy-a", kind: "enemy", archetype: "training-grunt", cell: { x: 5, y: 6 }, hp: 10 });
    world.spawn({ id: "enemy-b", kind: "enemy", archetype: "training-grunt", cell: { x: 4, y: 6 }, hp: 10 });
    world.spawn({ id: "enemy-c", kind: "enemy", archetype: "training-grunt", cell: { x: 3, y: 6 }, hp: 10 });
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
