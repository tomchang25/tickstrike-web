import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { resolveEnemyPhase } from "@core/actions/enemy-phase";
import { chargeLiveRetarget, decideEnemyAction, type EnemyDecisionContext } from "@core/enemies/enemy-actions";
import type { CommittedAttack, EnemyActionDefinition, EntityState } from "@core/model/types";
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
  otherCommittedAttacks: readonly CommittedAttack[] = [],
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
    otherCommittedAttacks,
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
  it("prefers the farthest reachable origin (the tuning's maxRange) over closing to melee range", () => {
    const decision = decideEnemyAction(context(enemy({ cell: { x: 5, y: 11 } }), { x: 5, y: 5 }));
    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates.length).toBeGreaterThan(0);
    for (const candidate of decision.candidates) {
      const distance = Math.abs(candidate.goal.x - 5) + Math.abs(candidate.goal.y - 5);
      expect(distance).toBe(5);
    }
  });

  it("prefers a farther reachable origin over a nearer one that's also reachable", () => {
    // Box the enemy into a 7x7 area centered on the Player so distances 4 and 5 (of a
    // maxRange-5 tuning) are unreachable but 2 and 3 both are — the farthest reachable
    // tier (3) must win, not just any reachable tier beyond melee range.
    const allowed = new Set<string>();
    for (let x = 2; x <= 8; x += 1) {
      for (let y = 2; y <= 8; y += 1) {
        allowed.add(`${x},${y}`);
      }
    }
    const inBox = (cell: { x: number; y: number }) => allowed.has(`${cell.x},${cell.y}`);
    const decision = decideEnemyAction({
      enemy: enemy({ cell: { x: 2, y: 2 } }),
      playerCell: { x: 5, y: 5 },
      isInside: inBox,
      canMove: () => true,
      canPathThrough: inBox,
      canEndAt: inBox,
      isLegalTerrain: inBox,
      otherCommittedAttacks: [],
    });
    expect(decision.type).toBe("move");
    if (decision.type !== "move") {
      return;
    }
    expect(decision.candidates.length).toBeGreaterThan(0);
    for (const candidate of decision.candidates) {
      const distance = Math.abs(candidate.goal.x - 5) + Math.abs(candidate.goal.y - 5);
      expect(distance).toBe(3);
    }
  });

  it("falls back to an adjacent origin when nothing farther is reachable", () => {
    const allowed = new Set(["4,4", "4,5", "5,4", "5,5"]);
    const decision = decideEnemyAction({
      enemy: enemy({ cell: { x: 4, y: 4 } }),
      playerCell: { x: 5, y: 5 },
      isInside: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canMove: () => true,
      canPathThrough: (cell) => allowed.has(`${cell.x},${cell.y}`),
      canEndAt: () => true,
      isLegalTerrain: () => true,
      otherCommittedAttacks: [],
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
      otherCommittedAttacks: [],
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

describe("Charge target-cell claims", () => {
  it("does not commit onto a cell another charge enemy already claims, rerouting to reposition instead", () => {
    const claimedAttack: CommittedAttack = {
      attackId: "charge",
      role: "charge",
      cells: [
        { x: 5, y: 3 },
        { x: 5, y: 2 },
      ],
      damage: 8,
      warningTicks: 2,
      recoveryTicks: 2,
    };
    const decision = decideEnemyAction(context(enemy(), { x: 5, y: 2 }, [], [], [claimedAttack]));
    expect(decision.type).not.toBe("attack");
  });

  it("ignores a claim from a non-charge role's committed attack", () => {
    const otherRoleAttack: CommittedAttack = {
      attackId: "thrust",
      role: "thrust",
      cells: [{ x: 5, y: 2 }],
      damage: 5,
      warningTicks: 2,
      recoveryTicks: 2,
    };
    const decision = decideEnemyAction(context(enemy(), { x: 5, y: 2 }, [], [], [otherRoleAttack]));
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

  it("declines a warning-time retarget onto a cell already claimed by another telegraphing charger", () => {
    const world = createChargeWorld();
    // Off in a corner, unaligned with the Player, so this claimant never retargets or
    // detonates itself during the test — it exists purely to hold the (5,7) claim.
    world.spawn({
      id: "enemy-charge-claimant",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 0, y: 0 },
      hp: 150,
      enemyAction: charge,
      facing: { x: 1, y: 0 },
    });
    world.commitEnemyAttack("enemy-charge-claimant", {
      attackId: "charge",
      role: "charge",
      cells: [{ x: 5, y: 7 }],
      damage: 8,
      warningTicks: 5,
      recoveryTicks: 2,
    });

    resolveCommand(world, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    const lockedCells = world.requireEntity("enemy-charge").committedAttack?.cells;
    expect(lockedCells).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);

    // The Player steps onto (5,7) — enemy-charge's live retarget would normally extend to
    // it, but enemy-charge-claimant already claims that cell, so the retarget is declined.
    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });

    expect(world.playerCell).toEqual({ x: 5, y: 7 });
    expect(world.requireEntity("enemy-charge").committedAttack).toMatchObject({
      cells: lockedCells,
      warningTicks: 1,
    });
  });

  it("lets only the first-decided charge enemy this phase claim the Player's cell; the second reroutes", () => {
    const world = new World(
      12,
      12,
      Array.from({ length: 144 }, () => "floor" as const),
      "charge-claim-race-test",
    );
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    // Spawned first, so it decides first in enemy-phase's iteration order and wins the claim
    // even though neither has committed anything yet when both evaluate this same tick.
    world.spawn({
      id: "enemy-charge-a",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 5, y: 0 },
      hp: 150,
      enemyAction: charge,
      facing: { x: 0, y: 1 },
    });
    world.spawn({
      id: "enemy-charge-b",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 0, y: 5 },
      hp: 150,
      enemyAction: charge,
      facing: { x: 1, y: 0 },
    });

    const events = resolveEnemyPhase(world);

    const a = world.requireEntity("enemy-charge-a");
    const b = world.requireEntity("enemy-charge-b");
    expect(a.activity).toBe("telegraphing");
    expect(a.committedAttack?.cells.at(-1)).toEqual({ x: 5, y: 5 });
    expect(b.activity).not.toBe("telegraphing");
    expect(b.committedAttack).toBeUndefined();
    expect(events.some((event) => event.type === "enemy_attack_committed" && event.enemyId === "enemy-charge-b")).toBe(
      false,
    );
  });
});
