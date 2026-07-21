import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { decideEnemyAction, type EnemyDecisionContext } from "@core/enemies/enemy-actions";
import type { EnemyActionDefinition, EntityState } from "@core/model/types";
import { World } from "@core/world/world";

const ranged: EnemyActionDefinition = {
  role: "ranged",
  attackId: "ranged_cross",
  kind: "tile",
  damage: 10,
  warningTicks: 2,
  recoveryTicks: 1,
  offsets: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ],
  rangedTuning: { minDistance: 3, maxDistance: 5 },
};

function enemy(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "enemy",
    kind: "enemy",
    archetype: "ranged",
    cell: { x: 3, y: 3 },
    footprint: [{ x: 3, y: 3 }],
    hp: 100,
    maxHp: 100,
    enemyAction: ranged,
    activity: "ready",
    facing: { x: 0, y: 1 },
    phase: "alive",
    ...overrides,
  };
}

function context(
  current: EntityState,
  playerCell: { x: number; y: number },
  blocked: readonly string[] = [],
): EnemyDecisionContext {
  const blockedCells = new Set(blocked);
  const key = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;
  return {
    enemy: current,
    playerCell,
    isInside: (cell) => cell.x >= 0 && cell.x < 9 && cell.y >= 0 && cell.y < 9,
    canMove: (cell) => !blockedCells.has(key(cell)),
    canPathThrough: () => true,
    canEndAt: (cell) => !blockedCells.has(key(cell)),
    isLegalTerrain: () => true,
  };
}

describe("Ranged distance-band decisions", () => {
  it("commits a player-centered Cross throughout the inclusive band", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 6, y: 3 }));

    expect(decision).toEqual({
      type: "attack",
      attack: ranged,
      cells: [
        { x: 6, y: 3 },
        { x: 6, y: 4 },
        { x: 6, y: 2 },
        { x: 5, y: 3 },
        { x: 7, y: 3 },
      ],
      facing: { x: 0, y: 1 },
      metadata: { targetCenter: { x: 6, y: 3 } },
    });
  });

  it("clips the target-centered Cross only at arena bounds", () => {
    const decision = decideEnemyAction(context(enemy({ cell: { x: 3, y: 0 } }), { x: 0, y: 0 }));

    expect(decision).toMatchObject({
      type: "attack",
      cells: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ],
      metadata: { targetCenter: { x: 0, y: 0 } },
    });
  });

  it("approaches from beyond the band with deterministic one-cell candidates", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 9, y: 3 }));

    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates).toEqual([
      {
        destination: { x: 4, y: 3 },
        path: [{ x: 4, y: 3 }],
        goal: { x: 4, y: 3 },
        facing: { x: 1, y: 0 },
      },
    ]);
  });

  it("retreats when crowded and waits if the improving cell is blocked", () => {
    const retreat = decideEnemyAction(context(enemy(), { x: 5, y: 3 }));
    expect(retreat.type).toBe("move");
    if (retreat.type === "move") {
      expect(retreat.candidates.map((candidate) => candidate.destination)).toEqual([
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 4 },
      ]);
    }

    expect(decideEnemyAction(context(enemy(), { x: 9, y: 3 }, ["4,3"]))).toEqual({ type: "wait" });
  });

  it("does not fall back to melee-origin navigation", () => {
    const decision = decideEnemyAction(context(enemy({ cell: { x: 2, y: 3 } }), { x: 8, y: 3 }, ["3,3"]));
    expect(decision).toEqual({ type: "wait" });
  });
});

function createRangedWorld(): World {
  const world = new World(
    5,
    5,
    Array.from({ length: 25 }, () => "floor" as const),
    "ranged-test",
  );
  world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 2, y: 2 }, hp: 100 });
  world.spawn({
    id: "enemy-ranged",
    kind: "enemy",
    archetype: "ranged",
    cell: { x: 0, y: 2 },
    hp: 100,
    enemyAction: ranged,
    facing: { x: 0, y: 1 },
  });
  return world;
}

describe("Ranged committed Cross lifecycle", () => {
  it("rests for one tick after moving before choosing another action", () => {
    const world = new World(
      7,
      5,
      Array.from({ length: 35 }, () => "floor" as const),
      "ranged-rest-test",
    );
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 6, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy-ranged",
      kind: "enemy",
      archetype: "ranged",
      cell: { x: 0, y: 2 },
      hp: 100,
      enemyAction: ranged,
      facing: { x: 1, y: 0 },
    });

    const moved = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });
    expect(moved.events.map((event) => event.type)).toContain("enemy_moved");
    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      activity: "resting",
      restTicks: 1,
      lastDecision: "move",
      cell: { x: 1, y: 2 },
    });

    const rested = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });
    expect(rested.events.map((event) => event.type)).not.toContain("enemy_moved");
    expect(rested.events.map((event) => event.type)).not.toContain("enemy_attack_committed");
    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      activity: "ready",
      cell: { x: 1, y: 2 },
    });

    const ready = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });
    expect(ready.events.map((event) => event.type)).toContain("enemy_attack_committed");
    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      activity: "telegraphing",
      lastDecision: "attack",
    });
  });

  it("locks the center and cells through warning, then resolves against the locked cells", () => {
    const world = createRangedWorld();

    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });
    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      activity: "telegraphing",
      committedAttack: {
        cells: [
          { x: 2, y: 3 },
          { x: 2, y: 4 },
          { x: 2, y: 2 },
          { x: 1, y: 3 },
          { x: 3, y: 3 },
        ],
        metadata: { targetCenter: { x: 2, y: 3 } },
        warningTicks: 2,
      },
    });

    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 1, y: 0 } });
    expect(world.requireEntity("enemy-ranged").committedAttack).toMatchObject({
      cells: [
        { x: 2, y: 3 },
        { x: 2, y: 4 },
        { x: 2, y: 2 },
        { x: 1, y: 3 },
        { x: 3, y: 3 },
      ],
      warningTicks: 1,
    });

    const resolved = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });
    expect(resolved.events.map((event) => event.type)).toContain("enemy_attack_detonated");
    expect(resolved.events.map((event) => event.type)).not.toContain("player_damaged");
    expect(world.requireEntity("player")).toMatchObject({ cell: { x: 3, y: 4 }, hp: 100 });
    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      activity: "recovering",
      recoveryTicks: 1,
    });
    expect(world.getTelegraph("enemy-ranged")).toBeUndefined();
  });

  it("clears a warning immediately when Ranged becomes terminal", () => {
    const world = createRangedWorld();
    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });

    world.setPhase("enemy-ranged", "dead");

    expect(world.requireEntity("enemy-ranged")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-ranged")).toBeUndefined();
  });
});
