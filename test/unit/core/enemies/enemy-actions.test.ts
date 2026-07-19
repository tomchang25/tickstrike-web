import { describe, expect, it } from "vitest";
import {
  attackOriginCellsFromShape,
  decideEnemyAction,
  rotatedAttackCells,
  rotateLocalOffset,
} from "../../../../src/core/enemies/enemy-actions";
import type { EnemyActionDefinition, EntityState } from "../../../../src/core/model/types";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { createShippedArena } from "../../../../src/harness/fixtures/shipped-arena";

const thrust: EnemyActionDefinition = {
  role: "thrust",
  attackId: "thrust",
  kind: "tile",
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

function testBounds(cell: { x: number; y: number }): boolean {
  return cell.x >= 0 && cell.x < 9 && cell.y >= 0 && cell.y < 9;
}

describe("role-neutral enemy action decisions", () => {
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

  it("derives attack origins by reversing the authored shape", () => {
    const origins = attackOriginCellsFromShape({ x: 3, y: 2 }, thrust);
    expect(origins).toHaveLength(12);
    expect(origins).toEqual(expect.arrayContaining([
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 3, y: 1 },
      { x: 3, y: 0 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ]));
  });

  it("uses exactly one move, attack, or wait decision", () => {
    expect(decideEnemyAction({ enemy: enemy(), playerCell: { x: 3, y: 1 }, isInside: testBounds, canMove: () => true, canPathThrough: () => true, canEndAt: () => true, isLegalTerrain: () => true })).toEqual({
      type: "attack",
      attack: thrust,
      cells: [{ x: 3, y: 2 }, { x: 3, y: 1 }, { x: 3, y: 0 }],
      facing: { x: 0, y: -1 },
    });
    const firstMove = decideEnemyAction({ enemy: enemy({ facing: { x: 0, y: -1 } }), playerCell: { x: 3, y: -1 }, isInside: testBounds, canMove: () => true, canPathThrough: () => true, canEndAt: () => true, isLegalTerrain: () => true });
    expect(firstMove).toMatchObject({ type: "move" });
    expect(firstMove.type === "move" ? firstMove.candidates[0] : undefined).toMatchObject({ destination: { x: 3, y: 2 }, facing: { x: 0, y: -1 } });

    const secondMove = decideEnemyAction({ enemy: enemy(), playerCell: { x: 6, y: 4 }, isInside: testBounds, canMove: () => true, canPathThrough: () => true, canEndAt: () => true, isLegalTerrain: () => true });
    expect(secondMove).toMatchObject({ type: "move" });
    if (secondMove.type === "move") {
      expect(secondMove.candidates.length).toBeGreaterThan(0);
      expect(secondMove.candidates[0]!.path.length).toBeGreaterThan(0);
    }
    expect(decideEnemyAction({ enemy: enemy(), playerCell: { x: 4, y: 3 }, isInside: testBounds, canMove: () => true, canPathThrough: () => true, canEndAt: () => true, isLegalTerrain: () => true })).toMatchObject({
      type: "attack",
      cells: [{ x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 }],
    });
    expect(decideEnemyAction({ enemy: enemy({ facing: { x: 0, y: -1 } }), playerCell: { x: 3, y: -1 }, isInside: testBounds, canMove: () => false, canPathThrough: () => true, canEndAt: () => true, isLegalTerrain: () => true })).toEqual({
      type: "wait",
    });
  });

  it("uses the shared decision boundary for an authored role-neutral action", () => {
    const action: EnemyActionDefinition = {
      ...thrust,
      role: "future-role",
      attackId: "future-attack",
      metadata: { center: { x: 3, y: 1 } },
    };
    const decision = decideEnemyAction({
      enemy: enemy({ enemyAction: action }),
      playerCell: { x: 3, y: 1 },
      isInside: testBounds,
      canMove: () => true,
      canPathThrough: () => true,
      canEndAt: () => true,
      isLegalTerrain: () => true,
    });

    expect(decision).toMatchObject({
      type: "attack",
      attack: { role: "future-role", attackId: "future-attack", kind: "tile" },
    });
  });
});

describe("shared enemy tick lifecycle", () => {
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
      "command_resolved",
      "actor_moved",
      "enemy_attack_detonated",
      "telegraph_changed",
      "enemy_recovering",
      "world_advanced",
    ]);
    expect(world.requireEntity("player")).toMatchObject({ hp: 100, cell: { x: 6, y: 5 } });
    expect(world.requireEntity("enemy")).toMatchObject({ activity: "recovering", recoveryTicks: 1 });
    expect(world.getTelegraph("enemy")).toBeUndefined();

    const recovered = resolveCommand(world, { type: "move", actorId: "player", direction: { x: -1, y: 0 } });
    expect(recovered.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "actor_moved",
      "enemy_recovered",
      "enemy_attack_committed",
      "telegraph_changed",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy")).toMatchObject({ activity: "telegraphing", lastDecision: "attack" });
  });

  it("keeps the role-neutral committed snapshot intact through warning", () => {
    const world = createWorld();
    world.removeEntity("enemy");
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "future-role",
      cell: { x: 5, y: 6 },
      hp: 100,
      enemyAction: {
        ...thrust,
        role: "future-role",
        metadata: { center: { x: 6, y: 6 } },
        warningTicks: 2,
      },
      facing: { x: 1, y: 0 },
    });

    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    expect(world.requireEntity("enemy").committedAttack).toMatchObject({
      role: "future-role",
      kind: "tile",
      cells: [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }],
      metadata: { center: { x: 6, y: 6 } },
      warningTicks: 2,
    });

    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: -1 } });
    expect(world.requireEntity("enemy").committedAttack).toMatchObject({
      cells: [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }],
      metadata: { center: { x: 6, y: 6 } },
      warningTicks: 1,
      damage: 10,
    });
  });

  it("uses the committed damage when the player remains in the telegraph", () => {
    const world = createWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    const result = resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

    expect(result.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "enemy_attack_detonated",
      "player_damaged",
      "telegraph_changed",
      "enemy_recovering",
      "world_advanced",
    ]);
    expect(world.requireEntity("player")).toMatchObject({ hp: 90, phase: "alive" });
    expect(world.requireEntity("enemy").committedAttack).toBeUndefined();
  });

  it("keeps a two-tick windup visible for two player turns", () => {
    const world = createWorld();
    world.removeEntity("enemy");
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "thrust",
      cell: { x: 5, y: 6 },
      hp: 100,
      enemyAction: { ...thrust, warningTicks: 2, recoveryTicks: 2 },
      facing: { x: 1, y: 0 },
    });

    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    expect(world.requireEntity("enemy").committedAttack).toMatchObject({ warningTicks: 2 });

    const firstWindupTurn = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 0, y: -1 },
    });
    expect(firstWindupTurn.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "actor_moved",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy").committedAttack).toMatchObject({ warningTicks: 1 });

    const secondWindupTurn = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 0, y: -1 },
    });
    expect(secondWindupTurn.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "actor_moved",
      "enemy_attack_detonated",
      "telegraph_changed",
      "enemy_recovering",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy")).toMatchObject({ activity: "recovering", recoveryTicks: 2 });
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
