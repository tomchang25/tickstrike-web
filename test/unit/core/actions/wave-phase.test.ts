import { describe, expect, it } from "vitest";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import type {
  GrowthCurve,
  GuardGrowthInput,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveGroupSlot,
  WaveProgressionProfile,
} from "../../../../src/core/content/wave-schema";
import type { WavePhaseContext } from "../../../../src/core/actions/wave-phase";
import { resolveWavePhase } from "../../../../src/core/actions/wave-phase";
import { createInitialSlotStates } from "../../../../src/core/waves/wave-scheduler";
import type { SpawnEntityInput, World } from "../../../../src/core/world/world";
import { World as WorldClass } from "../../../../src/core/world/world";
import type { TileKind } from "../../../../src/core/model/types";

const ZERO_CURVE: GrowthCurve = {
  standardCoefficient: 0,
  standardExponent: 1,
  lethalCoefficient: 0,
  lethalExponent: 1,
};

const GUARD_GROWTH: GuardGrowthInput = {
  basis: "base-wave",
  standardWaveLimit: 20,
  lethalTierCadence: 5,
};

const PROFILE: WaveProgressionProfile = {
  lethalLevelStart: 10,
  hpCurve: ZERO_CURVE,
  damageCurve: ZERO_CURVE,
  defenseCurve: ZERO_CURVE,
  guardGrowth: GUARD_GROWTH,
};

function slot(overrides: Partial<WaveGroupSlot> = {}): WaveGroupSlot {
  return {
    spawnGroupId: "grunt-group",
    startCondition: "immediate-overlap",
    survivorThreshold: 0,
    warningTicks: 0,
    levelOffset: 0,
    isBoss: false,
    ...overrides,
  };
}

function groupWithCount(count: number, strategy: SpawnGroupDefinition["placementStrategy"] = "scatter"): SpawnGroupDefinition {
  return {
    id: "grunt-group",
    placementStrategy: strategy,
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [{ enemyId: "grunt", count }],
  };
}

function fakeSpawnInput(request: {
  id: string;
  enemyId: string;
  level: number;
  cell: { x: number; y: number };
}): SpawnEntityInput {
  return {
    id: request.id,
    kind: "enemy",
    archetype: request.enemyId,
    cell: request.cell,
    hp: 10 + request.level,
  };
}

function makeContext(
  groups: readonly SpawnGroupDefinition[],
  waves: readonly (WaveDefinition | undefined)[],
): WavePhaseContext {
  return {
    groups,
    progressionProfile: PROFILE,
    waveFor: (waveNumber) => waves[waveNumber - 1],
    buildEnemySpawnInput: fakeSpawnInput,
  };
}

function spawnPlayer(world: World, cell = { x: 2, y: 2 }): void {
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell,
    hp: 100,
  });
}

function installWave(world: World, wave: WaveDefinition, groups: readonly SpawnGroupDefinition[]): void {
  const random = () => world.random.get("waves").nextUnit();
  const slots = createInitialSlotStates(wave, groups, 1, random);
  world.setWave(1, slots);
}

describe("resolveWavePhase: no-op and guard behavior", () => {
  it("is a no-op with no wave runtime, needing no context", () => {
    const world = createTrainingArena();
    spawnPlayer(world);
    const result = resolveWavePhase(world);
    expect(result).toEqual({ events: [], victoryReady: false });
  });

  it("throws when a wave runtime is installed but no context is supplied", () => {
    const world = createTrainingArena();
    spawnPlayer(world);
    const wave: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot()] };
    installWave(world, wave, [groupWithCount(1)]);
    expect(() => resolveWavePhase(world)).toThrow("no WavePhaseContext supplied");
  });

  it("returns early with no events when the player is not alive", () => {
    const world = createTrainingArena();
    spawnPlayer(world);
    world.applyDamage("player", 1000);
    const wave: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot()] };
    installWave(world, wave, [groupWithCount(1)]);
    const context = makeContext([groupWithCount(1)], [wave]);
    expect(resolveWavePhase(world, context)).toEqual({ events: [], victoryReady: false });
  });
});

describe("resolveWavePhase: immediate spawn (warningTicks 0)", () => {
  it("spawns the batch in the same tick with no telegraph or reservation", () => {
    const world = createTrainingArena();
    spawnPlayer(world);
    world.advanceTick();
    const groups = [groupWithCount(2)];
    const wave: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 0 })] };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const result = resolveWavePhase(world, context);

    expect(result.events.map((event) => event.type)).toEqual(["wave_group_spawned"]);
    const spawnedEvent = result.events[0] as { spawns: readonly { entityId: string }[] };
    expect(spawnedEvent.spawns).toHaveLength(2);
    expect(world.listTelegraphs()).toEqual([]);
    expect(world.listReservations().filter((r) => r.purpose === "spawn")).toEqual([]);
    expect(
      world.listEntities().filter((entity) => entity.kind === "enemy" && entity.id.startsWith("wave-")),
    ).toHaveLength(2);
  });
});

describe("resolveWavePhase: warned batch lifecycle", () => {
  it("warns, blocks movement, counts down, and spawns at expiry", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();
    const groups = [groupWithCount(1)];
    const wave: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 2 })] };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const warned = resolveWavePhase(world, context);
    expect(warned.events.map((event) => event.type)).toEqual(["wave_group_warned"]);
    const warnEvent = warned.events[0] as { cells: readonly { x: number; y: number }[]; sourceId: string };
    expect(warnEvent.cells).toHaveLength(1);
    const warnedCell = warnEvent.cells[0]!;

    expect(world.isWalkable(warnedCell)).toBe(false);
    const telegraph = world.getTelegraph(warnEvent.sourceId);
    expect(telegraph).toMatchObject({ phase: "spawning", remainingTicks: 2 });

    world.advanceTick();
    const countdown = resolveWavePhase(world, context);
    expect(countdown.events).toEqual([]);
    expect(world.getTelegraph(warnEvent.sourceId)).toMatchObject({ remainingTicks: 1 });

    world.advanceTick();
    const expired = resolveWavePhase(world, context);
    expect(expired.events.map((event) => event.type)).toEqual(["wave_group_spawned"]);
    expect(world.getTelegraph(warnEvent.sourceId)).toBeUndefined();
    expect(world.listReservations().filter((r) => r.purpose === "spawn")).toEqual([]);
    expect(world.getOccupantAt(warnedCell)?.kind).toBe("enemy");
  });

  it("repairs a drifted cell at expiry onto a replacement without requeuing", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();
    const groups = [groupWithCount(1)];
    const wave: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 1 })] };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const warned = resolveWavePhase(world, context);
    const warnEvent = warned.events[0] as { cells: readonly { x: number; y: number }[]; sourceId: string };
    const warnedCell = warnEvent.cells[0]!;

    // Simulate drift: the reserved cell becomes occupied by something else before expiry.
    world.releaseReservation(warnEvent.sourceId);
    world.spawn({ id: "blocker", kind: "enemy", archetype: "blocker", cell: warnedCell, hp: 1 });

    world.advanceTick();
    const expired = resolveWavePhase(world, context);

    expect(expired.events.map((event) => event.type)).toEqual(["wave_group_spawned"]);
    const spawnedEvent = expired.events[0] as { spawns: readonly { cell: { x: number; y: number } }[] };
    expect(spawnedEvent.spawns[0]!.cell).not.toEqual(warnedCell);
  });

  it("requeues an unrepairable member instead of dropping it", () => {
    // A 3x3 interior with a wall border: 9 legal cells. Occupy all but the player's and the
    // reserved cell so no replacement exists when the reserved cell drifts.
    const rows = ["#####", "#...#", "#...#", "#...#", "#####"] as const;
    const tiles: TileKind[] = rows.flatMap((row) =>
      [...row].map((char): TileKind => (char === "#" ? "wall" : "floor")),
    );
    const world = new WorldClass(rows[0].length, rows.length, tiles, "wave-phase-requeue");
    spawnPlayer(world, { x: 1, y: 1 });
    world.spawn({ id: "filler-a", kind: "enemy", archetype: "filler", cell: { x: 2, y: 1 }, hp: 1 });
    world.spawn({ id: "filler-b", kind: "enemy", archetype: "filler", cell: { x: 3, y: 1 }, hp: 1 });
    world.spawn({ id: "filler-c", kind: "enemy", archetype: "filler", cell: { x: 1, y: 2 }, hp: 1 });
    world.spawn({ id: "filler-d", kind: "enemy", archetype: "filler", cell: { x: 3, y: 2 }, hp: 1 });
    world.spawn({ id: "filler-e", kind: "enemy", archetype: "filler", cell: { x: 1, y: 3 }, hp: 1 });
    world.spawn({ id: "filler-f", kind: "enemy", archetype: "filler", cell: { x: 3, y: 3 }, hp: 1 });
    // Legal cells: (1,1) player, (2,1),(3,1),(1,2),(2,2) free,(3,2),(1,3),(2,3) free,(3,3).
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave: WaveDefinition = { id: "w1", populationCap: 10, slots: [slot({ warningTicks: 1 })] };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const warned = resolveWavePhase(world, context);
    expect(warned.events.map((event) => event.type)).toEqual(["wave_group_warned"]);
    const warnEvent = warned.events[0] as { cells: readonly { x: number; y: number }[]; sourceId: string };
    const warnedCell = warnEvent.cells[0]!;

    // Two free cells remain: (2,2) and (2,3), one of which is now reserved as warnedCell. Fill
    // the other one, then let the reserved cell drift so no replacement cell exists at all.
    const otherFreeCell = warnedCell.x === 2 && warnedCell.y === 2 ? { x: 2, y: 3 } : { x: 2, y: 2 };
    world.spawn({ id: "filler-g", kind: "enemy", archetype: "filler", cell: otherFreeCell, hp: 1 });
    world.releaseReservation(warnEvent.sourceId);
    world.spawn({ id: "blocker", kind: "enemy", archetype: "blocker", cell: warnedCell, hp: 1 });

    world.advanceTick();
    const expired = resolveWavePhase(world, context);

    // The board is now fully occupied, so the same-tick re-admission attempt for the requeued
    // member also fails, immediately deferring it with a placement failure.
    expect(expired.events.map((event) => event.type)).toEqual([
      "wave_group_requeued",
      "wave_group_deferred",
    ]);
    expect(world.waveRuntime?.slots[0]?.remainingQueue).toHaveLength(1);
    expect(world.waveRuntime?.pendingBatch).toBeUndefined();
    expect(
      world.listEntities().filter((entity) => entity.id.startsWith("wave-")),
    ).toHaveLength(0);
  });
});

describe("resolveWavePhase: admission blocking", () => {
  it("defers with population-headroom when the batch would exceed the cap", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.spawn({ id: "existing-1", kind: "enemy", archetype: "filler", cell: { x: 5, y: 5 }, hp: 1 });
    world.spawn({ id: "existing-2", kind: "enemy", archetype: "filler", cell: { x: 6, y: 5 }, hp: 1 });
    world.advanceTick();

    const groups = [groupWithCount(2)];
    const wave: WaveDefinition = { id: "w1", populationCap: 3, slots: [slot({ warningTicks: 0 })] };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const result = resolveWavePhase(world, context);
    expect(result.events).toEqual([
      { type: "wave_group_deferred", waveNumber: 1, slotIndex: 0, reason: "population-headroom" },
    ]);
    expect(world.waveRuntime?.slots[0]?.remainingQueue).toHaveLength(2);
  });

  it("never lets a later slot bypass a blocked earlier slot", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.spawn({ id: "existing-1", kind: "enemy", archetype: "filler", cell: { x: 5, y: 5 }, hp: 1 });
    world.advanceTick();

    const groups = [groupWithCount(3, "scatter"), groupWithCount(1, "scatter")];
    const groupA = { ...groups[0]!, id: "group-a" };
    const groupB = { ...groups[1]!, id: "group-b" };
    const wave: WaveDefinition = {
      id: "w1",
      populationCap: 2,
      slots: [
        slot({ spawnGroupId: "group-a", warningTicks: 0 }),
        slot({ spawnGroupId: "group-b", warningTicks: 0, startCondition: "immediate-overlap" }),
      ],
    };
    installWave(world, wave, [groupA, groupB]);
    const context = makeContext([groupA, groupB], [wave]);

    const result = resolveWavePhase(world, context);
    expect(result.events).toEqual([
      { type: "wave_group_deferred", waveNumber: 1, slotIndex: 0, reason: "population-headroom" },
    ]);
    expect(
      world.listEntities().filter((entity) => entity.id.startsWith("wave-")),
    ).toHaveLength(0);
  });
});

describe("resolveWavePhase: wave clear and advance", () => {
  it("advances to the next wave once the queue is empty and no living enemy remains", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 0 })] };
    const wave2: WaveDefinition = { id: "w2", populationCap: 5, slots: [slot({ warningTicks: 0 })] };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!
      .entityId;

    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    const clearResult = resolveWavePhase(world, context);
    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared", "wave_started"]);
    expect(world.waveRuntime?.waveNumber).toBe(2);
    expect(clearResult.victoryReady).toBe(false);
  });

  it("reports victoryReady once the final wave clears with no next wave", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 0 })] };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!
      .entityId;

    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    const clearResult = resolveWavePhase(world, context);
    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared"]);
    expect(clearResult.victoryReady).toBe(true);
  });

  it("does not declare victory-ready while the board is momentarily empty between groups", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();

    const groupA = groupWithCount(1);
    const groupB = { ...groupWithCount(1), id: "group-b" };
    const wave: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [
        slot({ warningTicks: 0 }),
        slot({ spawnGroupId: "group-b", warningTicks: 2, startCondition: "previous-group-cleared" }),
      ],
    };
    installWave(world, wave, [groupA, groupB]);
    const context = makeContext([groupA, groupB], [wave]);

    const firstSpawn = resolveWavePhase(world, context);
    expect(firstSpawn.victoryReady).toBe(false);
    const spawnedId = (firstSpawn.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!
      .entityId;

    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    // The board is empty here: the first group is cleared and the second is only just being
    // warned, not yet spawned. victoryReady must stay false throughout the pending countdown.
    const warnedTick = resolveWavePhase(world, context);
    expect(warnedTick.events.map((event) => event.type)).toEqual(["wave_group_warned"]);
    expect(warnedTick.victoryReady).toBe(false);
    expect(world.listActiveEntities().filter((entity) => entity.kind === "enemy")).toHaveLength(0);

    world.advanceTick();
    const stillCounting = resolveWavePhase(world, context);
    expect(stillCounting.events).toEqual([]);
    expect(stillCounting.victoryReady).toBe(false);
  });
});
