import { describe, expect, it } from "vitest";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import { calculateDirectionalHit } from "../../../../src/core/combat/directional-hit";
import type { GuardDefinition } from "../../../../src/core/content/actor-schema";
import type { EnemyActionDefinition } from "../../../../src/core/model/types";
import type { AdmittedBatch, SlotState } from "../../../../src/core/waves/wave-scheduler";
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
      footprint: [
        { x: 4, y: 2 },
        { x: 5, y: 2 },
      ],
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
        footprint: [
          { x: 4, y: 2 },
          { x: 4, y: 2 },
        ],
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
      footprint: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
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
      footprint: [
        { x: 4, y: 2 },
        { x: 5, y: 2 },
      ],
      hp: 10,
    });

    const snapshot = world.snapshot();
    const enemySnapshot = snapshot.entities.find((entity) => entity.id === "enemy");
    if (!enemySnapshot) {
      throw new Error("Expected enemy snapshot.");
    }
    (snapshot.playerCell as { x: number; y: number }).x = 9;
    (enemySnapshot.cell as { x: number; y: number }).x = 9;
    (enemySnapshot.footprint[0] as { x: number; y: number }).x = 9;

    expect(world.playerCell).toEqual({ x: 2, y: 2 });
    expect(world.requireEntity("enemy")).toMatchObject({
      cell: { x: 4, y: 2 },
      footprint: [
        { x: 4, y: 2 },
        { x: 5, y: 2 },
      ],
    });
    expect(world.getOccupantAt({ x: 4, y: 2 })?.id).toBe("enemy");
  });
});

describe("telegraph remainingTicks", () => {
  it("round-trips through set/get/list/snapshot and is absent for attack telegraphs", () => {
    const world = createTrainingArena();

    const spawning = world.setTelegraph({
      sourceId: "spawn:1",
      phase: "spawning",
      cells: [{ x: 2, y: 2 }],
      remainingTicks: 3,
    });
    expect(spawning.remainingTicks).toBe(3);
    expect(world.getTelegraph("spawn:1")?.remainingTicks).toBe(3);
    expect(
      world.listTelegraphs().find((telegraph) => telegraph.sourceId === "spawn:1")
        ?.remainingTicks,
    ).toBe(3);
    expect(
      world.snapshot().telegraphs.find((telegraph) => telegraph.sourceId === "spawn:1")
        ?.remainingTicks,
    ).toBe(3);

    const attack = world.setTelegraph({
      sourceId: "attack:1",
      phase: "warning",
      cells: [{ x: 5, y: 5 }],
    });
    expect(attack.remainingTicks).toBeUndefined();
    expect(world.getTelegraph("attack:1")?.remainingTicks).toBeUndefined();
  });
});

describe("wave runtime state", () => {
  it("defaults to undefined on a fresh instance", () => {
    const world = createTrainingArena();
    expect(world.waveRuntime).toBeUndefined();
    expect(world.snapshot().waveRuntime).toBeUndefined();
  });

  it("clones on read and supports pending-batch install/decrement/clear", () => {
    const world = createTrainingArena();
    const slots: readonly SlotState[] = [
      {
        remainingQueue: [{ enemyId: "grunt", level: 1 }],
        eligible: true,
        hasEverSpawned: false,
        livingCount: 0,
      },
    ];
    world.setWave(1, slots);

    const runtime = world.waveRuntime;
    expect(runtime).toMatchObject({ waveNumber: 1 });
    expect(runtime?.slots[0]?.eligible).toBe(true);

    (runtime!.slots[0] as { eligible: boolean }).eligible = false;
    (runtime!.slots[0]!.remainingQueue[0] as { enemyId: string }).enemyId = "mutated";
    expect(world.waveRuntime?.slots[0]?.eligible).toBe(true);
    expect(world.waveRuntime?.slots[0]?.remainingQueue[0]?.enemyId).toBe("grunt");

    const batch: AdmittedBatch = {
      slotIndex: 0,
      members: [{ enemyId: "grunt", level: 1 }],
      warningTicks: 2,
      placementStrategy: "scatter",
    };
    const pending = world.installPendingSpawnBatch(batch, [{ x: 3, y: 3 }]);
    expect(pending).toMatchObject({ remainingTicks: 2, cells: [{ x: 3, y: 3 }] });
    expect(world.waveRuntime?.pendingBatch?.remainingTicks).toBe(2);

    (pending.cells[0] as { x: number }).x = 9;
    expect(world.waveRuntime?.pendingBatch?.cells[0]).toEqual({ x: 3, y: 3 });

    expect(world.decrementPendingSpawnBatchWarning()?.remainingTicks).toBe(1);
    expect(world.decrementPendingSpawnBatchWarning()?.remainingTicks).toBe(0);
    expect(world.decrementPendingSpawnBatchWarning()?.remainingTicks).toBe(0);

    const snapshot = world.snapshot();
    expect(snapshot.waveRuntime?.pendingBatch?.remainingTicks).toBe(0);
    (snapshot.waveRuntime!.slots[0] as { eligible: boolean }).eligible = false;
    expect(world.waveRuntime?.slots[0]?.eligible).toBe(true);

    world.clearPendingSpawnBatch();
    expect(world.waveRuntime?.pendingBatch).toBeUndefined();
    world.clearPendingSpawnBatch();
    expect(world.waveRuntime?.pendingBatch).toBeUndefined();
  });

  it("guards pending-batch installation against a missing wave and a double install", () => {
    const world = createTrainingArena();
    const batch: AdmittedBatch = {
      slotIndex: 0,
      members: [{ enemyId: "grunt", level: 1 }],
      warningTicks: 1,
      placementStrategy: "scatter",
    };

    expect(() => world.installPendingSpawnBatch(batch, [{ x: 2, y: 2 }])).toThrow(
      "without an active wave",
    );

    world.setWave(1, []);
    world.installPendingSpawnBatch(batch, [{ x: 2, y: 2 }]);
    expect(() => world.installPendingSpawnBatch(batch, [{ x: 3, y: 3 }])).toThrow(
      "already installed",
    );
  });

  it("decrementPendingSpawnBatchWarning is a no-op with no pending batch", () => {
    const world = createTrainingArena();
    expect(world.decrementPendingSpawnBatchWarning()).toBeUndefined();
    world.setWave(1, []);
    expect(world.decrementPendingSpawnBatchWarning()).toBeUndefined();
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
  return new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    "charge-world-test",
  );
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
    world.spawn({
      id: "blocker-a",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 7, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 5, y: 5 },
      hp: 100,
    });
    commitCharge(world, [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ]);

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
    world.spawn({
      id: "blocker-a",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 7, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "pinned",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "pin-south",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 6 },
      hp: 100,
    });
    world.spawn({
      id: "pin-north",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 4 },
      hp: 100,
    });
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 4, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "forward-block",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 3, y: 5 },
      hp: 100,
    });
    commitCharge(world, [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ]);

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
    world.spawn({
      id: "pinned",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 7, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "pin-south",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 7, y: 6 },
      hp: 100,
    });
    world.spawn({
      id: "pin-north",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 7, y: 4 },
      hp: 100,
    });
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 6, y: 5 },
      hp: 100,
    });
    world.spawn({
      id: "forward-block",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 5 },
      hp: 100,
    });
    commitCharge(world, [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
    ]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution?.impact.outcome).toBe("blocked");
    expect(resolution?.landing).toEqual({ from: { x: 8, y: 5 }, to: { x: 8, y: 5 } });
    expect(world.requireEntity("enemy-charge").cell).toEqual({ x: 8, y: 5 });
  });

  it("lands on the target cell and deals no damage when it is empty at detonation", () => {
    const world = chargeWorld();
    spawnCharge(world);
    commitCharge(world, [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ]);

    const resolution = world.resolveChargeAttack("enemy-charge");
    expect(resolution?.impact).toEqual({ cell: { x: 5, y: 5 }, outcome: "empty" });
    expect(resolution?.displacements).toEqual([]);
    expect(world.requireEntity("enemy-charge").cell).toEqual({ x: 5, y: 5 });
  });

  it("clears the telegraph immediately when Charge becomes terminal during warning", () => {
    const world = chargeWorld();
    spawnCharge(world);
    commitCharge(world, [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ]);

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

const bombAction: EnemyActionDefinition = {
  role: "bomb",
  attackId: "bomb_area",
  kind: "area",
  damage: 50,
  warningTicks: 3,
  recoveryTicks: 1,
  offsets: [],
};

function bombWorld(): World {
  return new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    "bomb-world-test",
  );
}

function spawnBomb(world: World, cell: { x: number; y: number } = { x: 6, y: 5 }): void {
  world.spawn({
    id: "enemy-bomb",
    kind: "enemy",
    archetype: "bomb",
    cell,
    hp: 50,
    enemyAction: bombAction,
    facing: { x: -1, y: 0 },
  });
}

function commitBomb(
  world: World,
  center: { x: number; y: number },
  cells: readonly { x: number; y: number }[],
): void {
  world.commitEnemyAttack("enemy-bomb", {
    attackId: "bomb_area",
    cells,
    damage: 50,
    warningTicks: 3,
    recoveryTicks: 1,
    metadata: { center, selfDestruct: true },
  });
}

describe("Bomb self-destruct resolution", () => {
  it("resolves atomically to terminal instead of recovering, releasing occupancy, reservation, and telegraph", () => {
    const world = bombWorld();
    spawnBomb(world);
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 5, y: 5 },
      hp: 100,
    });
    commitBomb(world, { x: 6, y: 5 }, [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    world.requestReservation({ ownerId: "enemy-bomb", purpose: "attack", cells: [{ x: 6, y: 5 }] });

    const resolution = world.resolveCommittedEnemyAttack("enemy-bomb");
    expect(resolution).toBeDefined();
    expect(resolution?.damage).toMatchObject({
      targetId: "player",
      damage: 50,
      hpBefore: 100,
      hpAfter: 50,
      killed: false,
    });

    const bombEntity = world.requireEntity("enemy-bomb");
    expect(bombEntity.phase).toBe("dead");
    expect(bombEntity.hp).toBe(0);
    expect(bombEntity.activity).toBeUndefined();
    expect(bombEntity.recoveryTicks).toBeUndefined();
    expect(bombEntity.committedAttack).toBeUndefined();
    expect(world.getTelegraph("enemy-bomb")).toBeUndefined();
    expect(world.getReservation("enemy-bomb")).toBeUndefined();
    expect(world.getOccupantAt({ x: 6, y: 5 })).toBeUndefined();

    expect(world.resolveCommittedEnemyAttack("enemy-bomb")).toBeUndefined();
  });

  it("deals no damage and still self-destructs exactly once when the Player is outside the locked cells", () => {
    const world = bombWorld();
    spawnBomb(world);
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 0, y: 0 },
      hp: 100,
    });
    commitBomb(world, { x: 6, y: 5 }, [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);

    const resolution = world.resolveCommittedEnemyAttack("enemy-bomb");
    expect(resolution?.damage).toBeUndefined();
    expect(world.requireEntity("enemy-bomb").phase).toBe("dead");
    expect(world.requireEntity("player").hp).toBe(100);
  });

  it("disarms via the ordinary terminal path when killed before the fuse resolves, skipping the committed loop", () => {
    const world = bombWorld();
    spawnBomb(world);
    commitBomb(world, { x: 6, y: 5 }, [{ x: 6, y: 5 }]);

    world.setPhase("enemy-bomb", "dead");

    expect(world.requireEntity("enemy-bomb")).toMatchObject({
      phase: "dead",
      activity: undefined,
      committedAttack: undefined,
    });
    expect(world.getTelegraph("enemy-bomb")).toBeUndefined();
    expect(world.resolveCommittedEnemyAttack("enemy-bomb")).toBeUndefined();
  });
});

describe("Guardless enabled enemies do not block generic status processing", () => {
  it("advances stagger and protection for a guarded enemy while a guardless Bomb coexists", () => {
    const world = bombWorld();
    const smallGuard: GuardDefinition = {
      id: "small",
      name: "Small",
      base: 32,
      lethalTierGain: 8,
      stagger: 2,
      protection: 2,
      protectionMultiplier: 0.5,
    };
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 0, y: 0 },
      hp: 100,
    });
    world.spawn({
      id: "guarded",
      kind: "enemy",
      archetype: "thrust",
      cell: { x: 5, y: 5 },
      hp: 100,
      guardDefinition: smallGuard,
      enemyAction: {
        role: "thrust",
        attackId: "thrust",
        damage: 10,
        warningTicks: 2,
        recoveryTicks: 2,
        offsets: [{ x: 1, y: 0 }],
      },
      facing: { x: -1, y: 0 },
    });
    spawnBomb(world, { x: 9, y: 9 });

    const target = world.requireEntity("guarded");
    const hit = calculateDirectionalHit({
      attackerId: "player",
      attackerCell: { x: target.cell.x + 1, y: target.cell.y },
      target,
      damage: 40,
    });
    if (!hit) {
      throw new Error("Expected a guard-break hit.");
    }
    world.applyDirectionalHit(hit);
    expect(world.requireEntity("guarded")).toMatchObject({
      activity: "staggered",
      staggerTicks: 2,
    });

    let events = world.advanceEnemyStatuses();
    expect(events).toEqual([]);
    expect(world.requireEntity("guarded").staggerTicks).toBe(1);

    events = world.advanceEnemyStatuses();
    expect(events).toEqual([
      { type: "enemy_stagger_ended", enemyId: "guarded", guard: 32, maxGuard: 32 },
      { type: "enemy_protection_started", enemyId: "guarded", ticks: 2 },
    ]);
    expect(world.requireEntity("guarded")).toMatchObject({
      activity: "ready",
      staggerTicks: undefined,
      protectionTicks: 2,
    });

    events = world.advanceEnemyStatuses();
    expect(events).toEqual([]);
    expect(world.requireEntity("guarded").protectionTicks).toBe(1);

    events = world.advanceEnemyStatuses();
    expect(events).toEqual([{ type: "enemy_protection_ended", enemyId: "guarded" }]);
    expect(world.requireEntity("guarded").protectionTicks).toBeUndefined();

    const bombEntity = world.requireEntity("enemy-bomb");
    expect(bombEntity.guard).toBeUndefined();
    expect(bombEntity.activity).toBe("ready");
    expect(bombEntity.staggerTicks).toBeUndefined();
    expect(bombEntity.protectionTicks).toBeUndefined();
  });
});
