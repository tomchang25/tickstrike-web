import { describe, expect, it } from "vitest";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import type { EnemyActionDefinition } from "../../../../src/core/model/types";
import { World } from "../../../../src/core/world/world";

describe("canonical world occupancy", () => {
  it("indexes explicit footprints and owns the player cell", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "wide-enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
      hp: 10,
    });

    expect(world.playerCell).toEqual({ x: 2, y: 2 });
    expect(world.getOccupantAt({ x: 4, y: 2 })?.id).toBe("wide-enemy");
    expect(world.getOccupantAt({ x: 5, y: 2 })?.id).toBe("wide-enemy");
    expect(world.isWalkable({ x: 5, y: 2 })).toBe(false);
    expect(world.snapshot()).toMatchObject({ playerCell: { x: 2, y: 2 } });
  });

  it("rejects invalid spawns without changing entities or occupancy", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    const before = world.snapshot();

    expect(() =>
      world.spawn({
        id: "invalid",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 2 },
        footprint: [{ x: 4, y: 2 }, { x: 4, y: 2 }],
        hp: 10,
      }),
    ).toThrow("duplicate footprint");
    expect(() =>
      world.spawn({
        id: "water",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 6 },
        hp: 10,
      }),
    ).toThrow("non-walkable");
    expect(() =>
      world.spawn({
        id: "player-copy",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 2, y: 2 },
        hp: 10,
      }),
    ).toThrow("occupied");

    expect(world.snapshot()).toEqual(before);
  });

  it("rejects a colliding move atomically", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 5, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      footprint: [{ x: 2, y: 2 }, { x: 3, y: 2 }],
      hp: 10,
    });
    const before = world.requireEntity("enemy");

    expect(() => world.moveEntity("enemy", { x: 4, y: 2 })).toThrow("occupied");

    expect(world.requireEntity("enemy")).toEqual(before);
    expect(world.getOccupantAt({ x: 2, y: 2 })?.id).toBe("enemy");
    expect(world.getOccupantAt({ x: 3, y: 2 })?.id).toBe("enemy");
    expect(world.getOccupantAt({ x: 4, y: 2 })).toBeUndefined();
  });

  it("releases terminal occupancy while retaining the canonical record", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 10,
    });

    world.setPhase("enemy", "dead");

    expect(world.requireEntity("enemy").phase).toBe("dead");
    expect(world.getOccupantAt({ x: 2, y: 2 })).toBeUndefined();
    expect(world.findAliveAt({ x: 2, y: 2 })).toBeUndefined();
    expect(world.listActiveEntities().map((entity) => entity.id)).toEqual([]);
    expect(world.isWalkable({ x: 2, y: 2 })).toBe(true);

    world.spawn({
      id: "replacement",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 10,
    });
    expect(world.getOccupantAt({ x: 2, y: 2 })?.id).toBe("replacement");
    expect(world.listEntities().map((entity) => entity.id)).toEqual(["enemy", "replacement"]);
  });

  it("applies atomic clamped damage and cleans terminal ownership", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 10,
    });
    world.requestReservation({ ownerId: "enemy", purpose: "attack", cells: [{ x: 2, y: 2 }] });
    world.setTelegraph({ sourceId: "enemy", phase: "warning", cells: [{ x: 2, y: 2 }] });

    expect(world.applyDamage("enemy", 4)).toEqual({
      targetId: "enemy",
      damage: 4,
      hpBefore: 10,
      hpAfter: 6,
      killed: false,
    });
    expect(world.requireEntity("enemy")).toMatchObject({ hp: 6, phase: "alive" });

    expect(world.applyDamage("enemy", 99)).toEqual({
      targetId: "enemy",
      damage: 99,
      hpBefore: 6,
      hpAfter: 0,
      killed: true,
    });
    expect(world.requireEntity("enemy")).toMatchObject({ hp: 0, phase: "dead" });
    expect(world.getOccupantAt({ x: 2, y: 2 })).toBeUndefined();
    expect(world.getReservation("enemy")).toBeUndefined();
    expect(world.getTelegraph("enemy")).toBeUndefined();
    expect(world.applyDamage("enemy", 1)).toBeUndefined();
  });

  it("does not expose mutable canonical cells through snapshots", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
      hp: 10,
    });

    const snapshot = world.snapshot();
    const enemySnapshot = snapshot.entities.find((entity) => entity.id === "enemy");
    if (!enemySnapshot) throw new Error("Expected enemy snapshot.");
    (snapshot.playerCell as { x: number; y: number }).x = 9;
    (enemySnapshot.cell as { x: number; y: number }).x = 9;
    (enemySnapshot.footprint[0] as { x: number; y: number }).x = 9;

    expect(world.playerCell).toEqual({ x: 2, y: 2 });
    expect(world.requireEntity("enemy")).toMatchObject({
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
    });
    expect(world.getOccupantAt({ x: 4, y: 2 })?.id).toBe("enemy");
  });
});

const chargeAction: EnemyActionDefinition = {
  role: "charge",
  attackId: "charge",
  kind: "charge",
  damage: 8,
  warningTicks: 2,
  recoveryTicks: 2,
  offsets: [],
  chargeTuning: { minRange: 1, maxRange: 5, preferredMinRange: 2 },
};

function chargeWorld(): World {
  return new World(12, 12, Array.from({ length: 144 }, () => "floor" as const), "charge-world-test");
}

function spawnCharge(world: World, cell: { x: number; y: number } = { x: 8, y: 5 }): void {
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    cell,
    hp: 150,
    enemyAction: chargeAction,
    facing: { x: -1, y: 0 },
  });
}

function commitCharge(world: World, cells: readonly { x: number; y: number }[]): void {
  world.commitEnemyAttack("enemy-charge", {
    attackId: "charge",
    cells,
    damage: 8,
    warningTicks: 2,
    recoveryTicks: 2,
  });
}

describe("Charge attack resolution", () => {
  it("displaces a side entity sideways and knocks a normal target forward", () => {
    const world = chargeWorld();
    spawnCharge(world);
    world.spawn({ id: "blocker-a", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 5 }, hp: 100 });
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    commitCharge(world, [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution).toBeDefined();
    expect(resolution?.displacements).toEqual([
      { entityId: "blocker-a", from: { x: 7, y: 5 }, to: { x: 7, y: 4 }, blocked: false },
    ]);
    expect(resolution?.impact).toMatchObject({
      targetId: "player",
      cell: { x: 5, y: 5 },
      outcome: "normal",
      from: { x: 5, y: 5 },
      to: { x: 4, y: 5 },
      damage: { damage: 8, hpBefore: 100, hpAfter: 92, killed: false },
    });
    expect(resolution?.landing).toEqual({ from: { x: 8, y: 5 }, to: { x: 5, y: 5 } });

    expect(world.requireEntity("blocker-a").cell).toEqual({ x: 7, y: 4 });
    expect(world.requireEntity("player")).toMatchObject({ cell: { x: 4, y: 5 }, hp: 92 });
    expect(world.requireEntity("enemy-charge")).toMatchObject({
      cell: { x: 5, y: 5 },
      activity: "recovering",
      recoveryTicks: 2,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-charge")).toBeUndefined();
    expect(world.getOccupantAt({ x: 8, y: 5 })).toBeUndefined();
  });

  it("keeps a side entity in place and damages it when both sides are blocked, and applies double damage on a blocked impact with a scanned fallback landing", () => {
    const world = chargeWorld();
    spawnCharge(world);
    world.spawn({ id: "blocker-a", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 5 }, hp: 100 });
    world.spawn({ id: "pinned", kind: "enemy", archetype: "training-grunt", cell: { x: 6, y: 5 }, hp: 100 });
    world.spawn({ id: "pin-south", kind: "enemy", archetype: "training-grunt", cell: { x: 6, y: 6 }, hp: 100 });
    world.spawn({ id: "pin-north", kind: "enemy", archetype: "training-grunt", cell: { x: 6, y: 4 }, hp: 100 });
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 4, y: 5 }, hp: 100 });
    world.spawn({ id: "forward-block", kind: "enemy", archetype: "training-grunt", cell: { x: 3, y: 5 }, hp: 100 });
    commitCharge(world, [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }, { x: 4, y: 5 }]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution?.displacements).toEqual([
      { entityId: "blocker-a", from: { x: 7, y: 5 }, to: { x: 7, y: 4 }, blocked: false },
      {
        entityId: "pinned",
        from: { x: 6, y: 5 },
        blocked: true,
        damage: { targetId: "pinned", damage: 8, hpBefore: 100, hpAfter: 92, killed: false },
      },
    ]);
    expect(resolution?.impact).toMatchObject({
      targetId: "player",
      cell: { x: 4, y: 5 },
      outcome: "blocked",
      damage: { damage: 16, hpBefore: 100, hpAfter: 84, killed: false },
    });
    expect(resolution?.landing).toEqual({ from: { x: 8, y: 5 }, to: { x: 5, y: 5 } });

    expect(world.requireEntity("pinned").cell).toEqual({ x: 6, y: 5 });
    expect(world.requireEntity("pinned").hp).toBe(92);
    expect(world.requireEntity("player")).toMatchObject({ cell: { x: 4, y: 5 }, hp: 84 });
    expect(world.requireEntity("enemy-charge").cell).toEqual({ x: 5, y: 5 });
    expect(world.getOccupantAt({ x: 5, y: 5 })?.id).toBe("enemy-charge");
  });

  it("remains at its origin when no fallback landing cell is free", () => {
    const world = chargeWorld();
    spawnCharge(world);
    world.spawn({ id: "pinned", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 5 }, hp: 100 });
    world.spawn({ id: "pin-south", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 6 }, hp: 100 });
    world.spawn({ id: "pin-north", kind: "enemy", archetype: "training-grunt", cell: { x: 7, y: 4 }, hp: 100 });
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 6, y: 5 }, hp: 100 });
    world.spawn({ id: "forward-block", kind: "enemy", archetype: "training-grunt", cell: { x: 5, y: 5 }, hp: 100 });
    commitCharge(world, [{ x: 7, y: 5 }, { x: 6, y: 5 }]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution?.impact.outcome).toBe("blocked");
    expect(resolution?.landing).toEqual({ from: { x: 8, y: 5 }, to: { x: 8, y: 5 } });
    expect(world.requireEntity("enemy-charge").cell).toEqual({ x: 8, y: 5 });
  });

  it("lands on the target cell and deals no damage when it is empty at detonation", () => {
    const world = chargeWorld();
    spawnCharge(world);
    commitCharge(world, [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution?.impact).toEqual({ cell: { x: 5, y: 5 }, outcome: "empty" });
    expect(resolution?.displacements).toEqual([]);
    expect(world.requireEntity("enemy-charge").cell).toEqual({ x: 5, y: 5 });
  });

  it("clears the telegraph immediately when Charge becomes terminal during warning", () => {
    const world = chargeWorld();
    spawnCharge(world);
    commitCharge(world, [{ x: 7, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 5 }]);

    world.setPhase("enemy-charge", "dead");

    expect(world.requireEntity("enemy-charge")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-charge")).toBeUndefined();
    expect(world.resolveChargeAttack("enemy-charge")).toBeUndefined();
  });
});
