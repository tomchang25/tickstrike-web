import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { chargeLiveRetarget, decideEnemyAction, type EnemyDecisionContext } from "@core/enemies/enemy-actions";
import type { EnemyActionDefinition, EntityState } from "@core/model/types";
import { World } from "@core/world/world";

const charge: EnemyActionDefinition = {
  role: "charge",
  attackId: "charge",
  kind: "charge",
  damage: 8,
  warningTicks: 2,
  recoveryTicks: 2,
  offsets: [],
  chargeTuning: { maxRange: 5 },
};

function enemy(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "enemy",
    kind: "enemy",
    archetype: "charge",
    cell: { x: 5, y: 5 },
    footprint: [{ x: 5, y: 5 }],
    hp: 150,
    maxHp: 150,
    enemyAction: charge,
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

describe("Charge cardinal range decisions", () => {
  it("attacks along a legal cardinal path from one to five cells away", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 5, y: 2 }));
    expect(decision).toEqual({
      type: "attack",
      attack: charge,
      cells: [
        { x: 5, y: 4 },
        { x: 5, y: 3 },
        { x: 5, y: 2 },
      ],
      facing: { x: 0, y: -1 },
    });
  });

  it("still attacks an already-adjacent Player", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 6, y: 5 }));
    expect(decision).toEqual({
      type: "attack",
      attack: charge,
      cells: [{ x: 6, y: 5 }],
      facing: { x: 1, y: 0 },
    });
  });

  it("does not attack beyond the maximum range", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 11, y: 5 }));
    expect(decision.type).not.toBe("attack");
  });

  it("does not attack off a cardinal line", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 7, y: 3 }));
    expect(decision.type).not.toBe("attack");
  });

  it("does not attack through illegal terrain even within range", () => {
    const decision = decideEnemyAction(context(enemy(), { x: 5, y: 2 }, [], ["5,3"]));
    expect(decision.type).not.toBe("attack");
  });

  it("waits when there is no Player", () => {
    expect(decideEnemyAction(context(enemy(), undefined))).toEqual({ type: "wait" });
  });
});

describe("Charge movement planning", () => {
  it("prefers a two-through-five-cell origin over closing to melee range", () => {
    const decision = decideEnemyAction(context(enemy({ cell: { x: 5, y: 11 } }), { x: 5, y: 5 }));
    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates.length).toBeGreaterThan(0);
    const first = decision.candidates[0]!;
    const distance = Math.abs(first.goal.x - 5) + Math.abs(first.goal.y - 5);
    expect(distance).toBeGreaterThanOrEqual(2);
    expect(distance).toBeLessThanOrEqual(5);
  });

  it("falls back to an adjacent origin when no two-through-five cell is reachable", () => {
    const allowed = new Set(["4,4", "4,5", "5,4", "5,5"]);
    const decision = decideEnemyAction({
      enemy: enemy({ cell: { x: 4, y: 4 } }),
      playerCell: { x: 5, y: 5 },
      isInside: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canMove: () => true,
      canPathThrough: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canEndAt: () => true,
      isLegalTerrain: () => true,
    });
    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates.length).toBeGreaterThan(0);
    for (const candidate of decision.candidates) {
      const distance = Math.abs(candidate.goal.x - 5) + Math.abs(candidate.goal.y - 5);
      expect(distance).toBe(1);
    }
  });

  it("waits when no legal origin can be reached", () => {
    const allowed = new Set(["4,4", "3,4"]);
    const decision = decideEnemyAction({
      enemy: enemy({ cell: { x: 4, y: 4 } }),
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

describe("Charge live warning-time retarget", () => {
  it("recomputes the path while the Player stays ahead on a legal range path", () => {
    const retarget = chargeLiveRetarget(enemy(), { x: 8, y: 5 }, () => true);
    expect(retarget).toEqual({
      path: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
      ],
      facing: { x: 1, y: 0 },
    });
  });

  it("reports no retarget when the Player leaves Charge's facing direction or range rule", () => {
    expect(chargeLiveRetarget(enemy(), { x: 5, y: 3 }, () => true)).toBeUndefined();
    expect(chargeLiveRetarget(enemy(), { x: 2, y: 5 }, () => true)).toBeUndefined();
    expect(chargeLiveRetarget(enemy(), { x: 11, y: 5 }, () => true)).toBeUndefined();
    expect(chargeLiveRetarget(enemy(), { x: 7, y: 3 }, () => true)).toBeUndefined();
  });
});

function createChargeWorld(): World {
  const world = new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    "charge-test",
  );
  world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 6 }, hp: 100 });
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    cell: { x: 5, y: 3 },
    hp: 150,
    enemyAction: charge,
    facing: { x: 0, y: 1 },
  });
  return world;
}

describe("Charge committed lifecycle", () => {
  it("commits immediately against an already-aligned Player, then refreshes the path deterministically", () => {
    const world = createChargeWorld();

    const committed = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: -1 },
    });
    expect(world.requireEntity("enemy-charge")).toMatchObject({
      activity: "telegraphing",
      committedAttack: {
        cells: [
          { x: 5, y: 4 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ],
        warningTicks: 2,
      },
      facing: { x: 0, y: 1 },
    });
    expect(committed.events.map((event) => event.type)).toContain("enemy_attack_committed");
    expect(world.playerCell).toEqual({ x: 5, y: 6 });

    const retargeted = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });
    expect(world.playerCell).toEqual({ x: 5, y: 7 });
    expect(world.requireEntity("enemy-charge")).toMatchObject({
      activity: "telegraphing",
      committedAttack: {
        cells: [
          { x: 5, y: 4 },
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 5, y: 7 },
        ],
        warningTicks: 1,
      },
      facing: { x: 0, y: 1 },
    });
    expect(retargeted.events).toContainEqual(
      expect.objectContaining({
        type: "telegraph_changed",
        sourceId: "enemy-charge",
        cleared: false,
      }),
    );
  });

  it("retains the last valid target once the Player leaves the range rule", () => {
    const world = createChargeWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    const lockedCells = world.requireEntity("enemy-charge").committedAttack?.cells;

    world.moveEntity("player", { x: 11, y: 11 });
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: 1 } });

    expect(world.requireEntity("enemy-charge").committedAttack).toMatchObject({
      cells: lockedCells,
      warningTicks: 1,
    });
  });

  it("clears the telegraph immediately when Charge becomes terminal during warning", () => {
    const world = createChargeWorld();
    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });

    world.setPhase("enemy-charge", "dead");

    expect(world.requireEntity("enemy-charge")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-charge")).toBeUndefined();
  });
});
