import { describe, expect, it } from "vitest";
import {
  decideBasicEnemyAction,
  rotatedAttackCells,
  rotateLocalOffset,
} from "../../../../src/core/enemies/basic-enemy-actions";
import type { BasicEnemyActionDefinition, EntityState } from "../../../../src/core/model/types";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { createShippedArena } from "../../../../src/harness/fixtures/shipped-arena";

const thrust: BasicEnemyActionDefinition = {
  role: "thrust",
  attackId: "thrust",
  damage: 10,
  warningTicks: 1,
  recoveryTicks: 1,
  offsets: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
};

function enemy(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "enemy",
    kind: "enemy",
    archetype: "thrust",
    cell: { x: 3, y: 3 },
    footprint: [{ x: 3, y: 3 }],
    hp: 100,
    maxHp: 100,
    enemyAction: thrust,
    activity: "ready",
    facing: { x: 1, y: 0 },
    phase: "alive",
    ...overrides,
  };
}

describe("basic enemy action decisions", () => {
  it("rotates local offsets for every cardinal facing", () => {
    expect(rotateLocalOffset({ x: 2, y: 1 }, { x: 1, y: 0 })).toEqual({ x: 2, y: 1 });
    expect(rotateLocalOffset({ x: 2, y: 1 }, { x: 0, y: 1 })).toEqual({ x: -1, y: 2 });
    expect(rotateLocalOffset({ x: 2, y: 1 }, { x: -1, y: 0 })).toEqual({ x: -2, y: -1 });
    expect(rotateLocalOffset({ x: 2, y: 1 }, { x: 0, y: -1 })).toEqual({ x: 1, y: -2 });
    expect(rotatedAttackCells({ x: 3, y: 3 }, { x: 1, y: 0 }, thrust.offsets)).toEqual([
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 6, y: 3 },
    ]);
  });

  it("uses exactly one move, attack, or wait decision", () => {
    expect(decideBasicEnemyAction({ enemy: enemy(), playerCell: { x: 3, y: 1 }, canMove: () => true })).toEqual({
      type: "attack",
      attack: thrust,
      cells: [{ x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }],
      facing: { x: 0, y: -1 },
    });
    expect(decideBasicEnemyAction({ enemy: enemy({ facing: { x: 0, y: -1 } }), playerCell: { x: 3, y: -1 }, canMove: () => true })).toEqual({
      type: "move",
      destination: { x: 3, y: 2 },
      facing: { x: 0, y: -1 },
    });
    expect(decideBasicEnemyAction({ enemy: enemy(), playerCell: { x: 6, y: 4 }, canMove: (destination) => destination.y === 2 })).toEqual({
      type: "move",
      destination: { x: 3, y: 2 },
      facing: { x: 0, y: -1 },
    });
    expect(decideBasicEnemyAction({ enemy: enemy({ facing: { x: 0, y: -1 } }), playerCell: { x: 6, y: 4 }, canMove: (destination) => destination.y === 2 })).toEqual({
      type: "move",
      destination: { x: 3, y: 2 },
      facing: { x: 0, y: -1 },
    });
    expect(decideBasicEnemyAction({ enemy: enemy(), playerCell: { x: 4, y: 3 }, canMove: () => true })).toMatchObject({
      type: "attack",
      cells: [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }],
    });
    expect(decideBasicEnemyAction({ enemy: enemy({ facing: { x: 0, y: -1 } }), playerCell: { x: 3, y: -1 }, canMove: () => false })).toEqual({
      type: "wait",
    });
  });
});

describe("basic enemy tick lifecycle", () => {
  function createWorld() {
    const world = createShippedArena();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 6, y: 6 }, hp: 100 });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "thrust",
      cell: { x: 5, y: 6 },
      hp: 100,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    return world;
  }

  it("locks committed cells, resolves once, and can act when recovery ends", () => {
    const world = createWorld();
    const committed = resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

    expect(committed.accepted).toBe(true);
    expect(world.requireEntity("enemy")).toMatchObject({
      activity: "telegraphing",
      committedAttack: {
        attackId: "thrust",
        cells: [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }],
        warningTicks: 1,
        damage: 10,
      },
    });
    expect(world.getTelegraph("enemy")).toMatchObject({ cells: [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }] });

    const dodge = resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: -1 } });
    expect(dodge.events.map((event) => event.type)).toEqual([
      "actor_moved",
      "enemy_attack_detonated",
      "telegraph_changed",
      "enemy_recovering",
    ]);
    expect(world.requireEntity("player")).toMatchObject({ hp: 100, cell: { x: 6, y: 5 } });
    expect(world.requireEntity("enemy")).toMatchObject({ activity: "recovering", recoveryTicks: 1 });
    expect(world.getTelegraph("enemy")).toBeUndefined();

    const recovered = resolveCommand(world, { type: "move", actorId: "player", direction: { x: -1, y: 0 } });
    expect(recovered.events.map((event) => event.type)).toEqual([
      "actor_moved",
      "enemy_recovered",
      "enemy_attack_committed",
      "telegraph_changed",
    ]);
    expect(world.requireEntity("enemy")).toMatchObject({ activity: "telegraphing", lastDecision: "attack" });
  });

  it("uses the committed damage when the player remains in the telegraph", () => {
    const world = createWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    const result = resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

    expect(result.events.map((event) => event.type)).toEqual([
      "player_attacked",
      "enemy_attack_detonated",
      "player_damaged",
      "telegraph_changed",
      "enemy_recovering",
    ]);
    expect(world.requireEntity("player")).toMatchObject({ hp: 90, phase: "alive" });
    expect(world.requireEntity("enemy").committedAttack).toBeUndefined();
  });

  it("does not let rejected commands advance enemy state", () => {
    const world = createWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    const before = world.snapshot();

    const rejected = resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 1, y: 1 } });

    expect(rejected).toMatchObject({ accepted: false, consumedTime: false, events: [] });
    expect(world.snapshot()).toEqual(before);
  });

  it("cancels a committed attack and telegraph on terminal transition", () => {
    const world = createWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

    world.setPhase("enemy", "dead");

    expect(world.requireEntity("enemy")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy")).toBeUndefined();
    expect(world.getOccupantAt({ x: 5, y: 6 })).toBeUndefined();
  });
});
