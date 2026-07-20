import { describe, expect, it } from "vitest";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { resolveAreaOffsets } from "../../../../src/core/enemies/area-shapes";
import {
  bombAreaCells,
  decideEnemyAction,
  type EnemyDecisionContext,
} from "../../../../src/core/enemies/enemy-actions";
import type { EnemyActionDefinition, EntityState } from "../../../../src/core/model/types";
import { World } from "../../../../src/core/world/world";

const bombOffsets = resolveAreaOffsets({ shape: "manhattan", radius: 4 });

const bomb: EnemyActionDefinition = {
  role: "bomb",
  attackId: "bomb_area",
  kind: "area",
  damage: 50,
  warningTicks: 3,
  recoveryTicks: 1,
  offsets: bombOffsets,
};

function enemy(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "enemy",
    kind: "enemy",
    archetype: "bomb",
    cell: { x: 5, y: 5 },
    footprint: [{ x: 5, y: 5 }],
    hp: 50,
    maxHp: 50,
    enemyAction: bomb,
    activity: "ready",
    facing: { x: 1, y: 0 },
    phase: "alive",
    ...overrides,
  };
}

function context(
  current: EntityState,
  playerCell: { x: number; y: number } | undefined,
  blocked: readonly string[] = [],
  illegal: readonly string[] = [],
): EnemyDecisionContext {
  const blockedCells = new Set(blocked);
  const illegalCells = new Set(illegal);
  const key = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;
  return {
    enemy: current,
    playerCell,
    isInside: (cell) => cell.x >= 0 && cell.x < 12 && cell.y >= 0 && cell.y < 12,
    canMove: (cell) => !blockedCells.has(key(cell)) && !illegalCells.has(key(cell)),
    canPathThrough: (cell) => !illegalCells.has(key(cell)),
    canEndAt: (cell) => !blockedCells.has(key(cell)) && !illegalCells.has(key(cell)),
    isLegalTerrain: (cell) => !illegalCells.has(key(cell)),
  };
}

describe("Bomb radius-four Manhattan footprint", () => {
  it("locks a 41-cell area centered on its own cell when unclipped by the arena", () => {
    const cells = bombAreaCells({ x: 5, y: 5 }, bomb, () => true);
    expect(cells).toHaveLength(41);
    expect(cells).toContainEqual({ x: 5, y: 5 });
    expect(cells).toContainEqual({ x: 9, y: 5 });
    expect(cells).toContainEqual({ x: 1, y: 5 });
    expect(cells).toContainEqual({ x: 5, y: 9 });
    expect(cells).toContainEqual({ x: 5, y: 1 });
    expect(cells).not.toContainEqual({ x: 10, y: 5 });
  });

  it("clips out-of-bounds cells at an arena edge without duplicating any cell", () => {
    const isInside = (cell: { x: number; y: number }) =>
      cell.x >= 0 && cell.x < 12 && cell.y >= 0 && cell.y < 12;
    const cells = bombAreaCells({ x: 0, y: 0 }, bomb, isInside);
    expect(cells.every((cell) => isInside(cell))).toBe(true);
    const keys = cells.map((cell) => `${cell.x},${cell.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(cells.length).toBeLessThan(41);
  });
});

describe("Bomb adjacent-ring commitment", () => {
  it("commits from an orthogonally adjacent cell, centered on its own cell", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 6, y: 5 }));
    expect(decision.type).toBe("attack");
    if (decision.type !== "attack") {
      return;
    }
    expect(decision.metadata).toEqual({ center: { x: 5, y: 5 }, selfDestruct: true });
    expect(decision.cells).toEqual(bombAreaCells({ x: 5, y: 5 }, bomb, () => true));
  });

  it("commits from a diagonally adjacent cell", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 6, y: 6 }));
    expect(decision.type).toBe("attack");
  });

  it("does not commit when the Player shares its own cell", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 5, y: 5 }));
    expect(decision.type).not.toBe("attack");
  });

  it("does not commit at a distance of two", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 7, y: 5 }));
    expect(decision.type).not.toBe("attack");
  });

  it("waits when there is no Player", () => {
    expect(decideEnemyAction(context(enemy(), undefined))).toEqual({ type: "wait" });
  });
});

describe("Bomb approach movement", () => {
  it("moves toward one of the eight adjacent-ring cells when not yet adjacent", () => {
    const decision = decideEnemyAction(context(enemy({ cell: { x: 0, y: 0 } }), { x: 5, y: 5 }));
    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates.length).toBeGreaterThan(0);
    const goal = decision.candidates[0]!.goal;
    const chebyshev = Math.max(Math.abs(goal.x - 5), Math.abs(goal.y - 5));
    expect(chebyshev).toBe(1);
  });

  it("waits when no legal approach cell can be reached", () => {
    const allowed = new Set(["0,0", "1,0"]);
    const decision = decideEnemyAction({
      enemy: enemy({ cell: { x: 0, y: 0 } }),
      playerCell: { x: 5, y: 5 },
      isInside: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canMove: () => true,
      canPathThrough: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canEndAt: () => true,
      isLegalTerrain: () => true,
    });
    expect(decision).toEqual({ type: "wait" });
  });
});

function createBombWorld(): World {
  const world = new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    "bomb-test",
  );
  world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
  world.spawn({
    id: "enemy-bomb",
    kind: "enemy",
    archetype: "bomb",
    cell: { x: 6, y: 5 },
    hp: 50,
    enemyAction: bomb,
    facing: { x: -1, y: 0 },
  });
  return world;
}

const whiff = (world: World) =>
  resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

describe("Bomb committed lifecycle", () => {
  it("commits immediately against an adjacent Player with a locked, guardless area", () => {
    const world = createBombWorld();
    const committed = whiff(world);

    expect(world.requireEntity("enemy-bomb")).toMatchObject({
      activity: "telegraphing",
      committedAttack: {
        warningTicks: 3,
        damage: 50,
        metadata: { center: { x: 6, y: 5 }, selfDestruct: true },
      },
    });
    expect(world.requireEntity("enemy-bomb").guard).toBeUndefined();
    expect(committed.events.map((event) => event.type)).toContain("enemy_attack_committed");
  });

  it("decrements the fuse only on accepted world advances and self-destructs on hit", () => {
    const world = createBombWorld();
    whiff(world);

    expect(world.requireEntity("enemy-bomb").committedAttack?.warningTicks).toBe(3);
    whiff(world);
    expect(world.requireEntity("enemy-bomb").committedAttack?.warningTicks).toBe(2);
    whiff(world);
    expect(world.requireEntity("enemy-bomb").committedAttack?.warningTicks).toBe(1);

    const resolved = whiff(world);
    const types = resolved.events.map((event) => event.type);
    expect(types).toContain("enemy_attack_detonated");
    expect(types).toContain("player_damaged");
    expect(types).toContain("enemy_self_destructed");
    expect(types).toContain("enemy_died");
    expect(types).not.toContain("enemy_recovering");
    expect(types.indexOf("enemy_attack_detonated")).toBeLessThan(types.indexOf("player_damaged"));
    expect(types.indexOf("player_damaged")).toBeLessThan(types.indexOf("enemy_self_destructed"));
    expect(types.indexOf("enemy_self_destructed")).toBeLessThan(types.indexOf("enemy_died"));

    const deathEvent = resolved.events.find((event) => event.type === "enemy_died");
    expect(deathEvent).toMatchObject({ enemyId: "enemy-bomb", attackerId: "enemy-bomb" });

    // Both terminal events name one id, so the command finalization removes exactly one entity.
    expect(world.getEntity("enemy-bomb")).toBeUndefined();
    expect(world.getTelegraph("enemy-bomb")).toBeUndefined();
    expect(world.getOccupantAt({ x: 6, y: 5 })).toBeUndefined();
    expect(world.requireEntity("player").hp).toBeLessThan(100);
  });

  it("self-destructs exactly once on a miss when the Player leaves the locked footprint", () => {
    const world = createBombWorld();
    whiff(world);
    whiff(world);
    whiff(world);
    world.moveEntity("player", { x: 11, y: 11 });

    const resolved = whiff(world);
    const types = resolved.events.map((event) => event.type);
    expect(types).toContain("enemy_self_destructed");
    expect(types).toContain("enemy_died");
    expect(types).not.toContain("player_damaged");
    expect(types.filter((type) => type === "enemy_self_destructed")).toHaveLength(1);
    expect(world.requireEntity("player").hp).toBe(100);
    expect(world.getEntity("enemy-bomb")).toBeUndefined();
  });

  it("disarms immediately when killed before the fuse resolves", () => {
    const world = createBombWorld();
    whiff(world);
    expect(world.requireEntity("enemy-bomb").committedAttack?.warningTicks).toBe(3);

    world.applyDamage("enemy-bomb", 50);

    expect(world.requireEntity("enemy-bomb")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-bomb")).toBeUndefined();
    expect(world.getReservation("enemy-bomb")).toBeUndefined();

    const after = whiff(world);
    expect(after.events.map((event) => event.type)).not.toContain("enemy_attack_detonated");
    expect(after.events.map((event) => event.type)).not.toContain("enemy_self_destructed");
  });

  it("clears the committed attack and telegraph on a mid-fuse combat reset", () => {
    const world = createBombWorld();
    whiff(world);
    expect(world.requireEntity("enemy-bomb").activity).toBe("telegraphing");

    world.resetEnemyCombatState("enemy-bomb");

    expect(world.requireEntity("enemy-bomb")).toMatchObject({
      phase: "alive",
      activity: "ready",
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-bomb")).toBeUndefined();
  });
});
