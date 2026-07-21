import { describe, expect, it } from "vitest";
import { createTrainingArena } from "@harness/fixtures/training-arena";
import type { ArtifactDefinition } from "@core/content/artifact-schema";
import type {
  GrowthCurve,
  GuardGrowthInput,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveGroupSlot,
  WaveProgressionProfile,
} from "@core/content/wave-schema";
import type { WavePhaseContext } from "@core/actions/wave-phase";
import { resolveMilestoneDecision, resolveRewardSelection, resolveWavePhase } from "@core/actions/wave-phase";
import { createInitialSlotStates } from "@core/waves/wave-scheduler";
import type { SpawnEntityInput, World } from "@core/world/world";
import { World as WorldClass } from "@core/world/world";
import type { MilestoneChoice, TileKind } from "@core/model/types";

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

function groupWithCount(
  count: number,
  strategy: SpawnGroupDefinition["placementStrategy"] = "scatter",
): SpawnGroupDefinition {
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
  offerableArtifacts?: readonly ArtifactDefinition[],
  milestoneWaveNumber?: number,
): WavePhaseContext {
  return {
    groups,
    progressionProfile: PROFILE,
    waveFor: (waveNumber) => waves[waveNumber - 1],
    buildEnemySpawnInput: fakeSpawnInput,
    ...(offerableArtifacts ? { offerableArtifacts } : {}),
    ...(milestoneWaveNumber !== undefined ? { milestoneWaveNumber } : {}),
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
    const warnEvent = warned.events[0] as {
      cells: readonly { x: number; y: number }[];
      sourceId: string;
    };
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
    const warnEvent = warned.events[0] as {
      cells: readonly { x: number; y: number }[];
      sourceId: string;
    };
    const warnedCell = warnEvent.cells[0]!;

    // Simulate drift: the reserved cell becomes occupied by something else before expiry.
    world.releaseReservation(warnEvent.sourceId);
    world.spawn({ id: "blocker", kind: "enemy", archetype: "blocker", cell: warnedCell, hp: 1 });

    world.advanceTick();
    const expired = resolveWavePhase(world, context);

    expect(expired.events.map((event) => event.type)).toEqual(["wave_group_spawned"]);
    const spawnedEvent = expired.events[0] as {
      spawns: readonly { cell: { x: number; y: number } }[];
    };
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
    world.spawn({
      id: "filler-a",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 2, y: 1 },
      hp: 1,
    });
    world.spawn({
      id: "filler-b",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 3, y: 1 },
      hp: 1,
    });
    world.spawn({
      id: "filler-c",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 1, y: 2 },
      hp: 1,
    });
    world.spawn({
      id: "filler-d",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 3, y: 2 },
      hp: 1,
    });
    world.spawn({
      id: "filler-e",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 1, y: 3 },
      hp: 1,
    });
    world.spawn({
      id: "filler-f",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 3, y: 3 },
      hp: 1,
    });
    // Legal cells: (1,1) player, (2,1),(3,1),(1,2),(2,2) free,(3,2),(1,3),(2,3) free,(3,3).
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave: WaveDefinition = {
      id: "w1",
      populationCap: 10,
      slots: [slot({ warningTicks: 1 })],
    };
    installWave(world, wave, groups);
    const context = makeContext(groups, [wave]);

    const warned = resolveWavePhase(world, context);
    expect(warned.events.map((event) => event.type)).toEqual(["wave_group_warned"]);
    const warnEvent = warned.events[0] as {
      cells: readonly { x: number; y: number }[];
      sourceId: string;
    };
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
    expect(expired.events.map((event) => event.type)).toEqual(["wave_group_requeued", "wave_group_deferred"]);
    expect(world.waveRuntime?.slots[0]?.remainingQueue).toHaveLength(1);
    expect(world.waveRuntime?.pendingBatch).toBeUndefined();
    expect(world.listEntities().filter((entity) => entity.id.startsWith("wave-"))).toHaveLength(0);
  });
});

describe("resolveWavePhase: admission blocking", () => {
  it("defers with population-headroom when the batch would exceed the cap", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.spawn({
      id: "existing-1",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 5, y: 5 },
      hp: 1,
    });
    world.spawn({
      id: "existing-2",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 6, y: 5 },
      hp: 1,
    });
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
    world.spawn({
      id: "existing-1",
      kind: "enemy",
      archetype: "filler",
      cell: { x: 5, y: 5 },
      hp: 1,
    });
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
    expect(world.listEntities().filter((entity) => entity.id.startsWith("wave-"))).toHaveLength(0);
  });
});

describe("resolveWavePhase: wave clear and advance", () => {
  it("advances to the next wave once the queue is empty and no living enemy remains", () => {
    const world = createTrainingArena();
    spawnPlayer(world, { x: 2, y: 2 });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;

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
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;

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
        slot({
          spawnGroupId: "group-b",
          warningTicks: 2,
          startCondition: "previous-group-cleared",
        }),
      ],
    };
    installWave(world, wave, [groupA, groupB]);
    const context = makeContext([groupA, groupB], [wave]);

    const firstSpawn = resolveWavePhase(world, context);
    expect(firstSpawn.victoryReady).toBe(false);
    const spawnedId = (firstSpawn.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;

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

const ATTACK_UP: ArtifactDefinition = {
  id: "attack_up",
  name: "Sharpened Edge",
  descriptionTemplate: "+%d normal attack damage",
  category: "minor",
  maxStacks: 3,
  exclusivityGroup: "",
  isCurse: false,
  minWave: 1,
  magnitude: 10,
  requiredMobility: null,
  effects: [{ kind: "channel", channel: "normal-attack-damage", amount: 10 }],
  presentation: { id: "artifact.attack_up" },
};

describe("resolveWavePhase: pauses a clear on an eligible reward instead of advancing", () => {
  it("installs a pending offer and reports reward_offered without starting the next wave", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      normalAttackDamage: 20,
    });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2], [ATTACK_UP]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    const clearResult = resolveWavePhase(world, context);

    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared", "reward_offered"]);
    expect(clearResult.victoryReady).toBe(false);
    expect(world.pendingRewardOffer).toEqual({
      waveNumber: 1,
      cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
    });
    // The wave number does not advance and no next-wave content is initialized yet.
    expect(world.waveRuntime?.waveNumber).toBe(1);
  });

  it("blocks command acceptance while paused, verified via the pending offer flag itself", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      normalAttackDamage: 20,
    });
    world.installPendingRewardOffer({
      waveNumber: 1,
      cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
    });
    expect(world.pendingRewardOffer).toBeDefined();
  });

  it("draws its card from the 'rewards' stream, never perturbing 'waves' stream output", () => {
    // Two independently-seeded (same default seed) worlds cleared the same way: one pauses on a
    // reward and resumes via selection, the other advances immediately. If the reward draw ever
    // touched the "waves" stream, Wave 2's slot state would diverge between them.
    function clearWaveOne(context: WavePhaseContext) {
      const world = createTrainingArena();
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "training-player",
        cell: { x: 2, y: 2 },
        hp: 100,
        normalAttackDamage: 20,
      });
      world.advanceTick();
      const groups = [groupWithCount(1)];
      const wave1: WaveDefinition = {
        id: "w1",
        populationCap: 5,
        slots: [slot({ warningTicks: 0 })],
      };
      installWave(world, wave1, groups);

      const spawnResult = resolveWavePhase(world, context);
      const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
      world.setPhase(spawnedId, "dead");
      world.advanceTick();
      resolveWavePhase(world, context);
      return world;
    }

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const withRewards = makeContext(groups, [wave1, wave2], [ATTACK_UP]);
    const withoutRewards = makeContext(groups, [wave1, wave2]);

    const pausedWorld = clearWaveOne(withRewards);
    expect(pausedWorld.pendingRewardOffer).toBeDefined();
    resolveRewardSelection(pausedWorld, "attack_up", withRewards);

    const directWorld = clearWaveOne(withoutRewards);

    expect(pausedWorld.waveRuntime).toEqual(directWorld.waveRuntime);
  });

  it("skips the offer and advances directly once the sole candidate is already at its stack cap", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      normalAttackDamage: 20,
    });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2], [ATTACK_UP]);
    world.applyRewardSelection("attack_up", ATTACK_UP.maxStacks);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    const clearResult = resolveWavePhase(world, context);

    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared", "wave_started"]);
    expect(world.pendingRewardOffer).toBeUndefined();
    expect(world.waveRuntime?.waveNumber).toBe(2);
  });
});

describe("resolveWavePhase and resolveMilestoneDecision: milestone branch", () => {
  const groups = [groupWithCount(1)];
  const wave1: WaveDefinition = { id: "w1", populationCap: 5, slots: [slot({ warningTicks: 0 })] };
  const wave2: WaveDefinition = { id: "w2", populationCap: 5, slots: [slot({ warningTicks: 0 })] };

  /** Clears wave 1 to the milestone pause; wave 2 exists so a continue can start it. */
  function clearToMilestone(
    offerableArtifacts?: readonly ArtifactDefinition[],
    normalAttackDamage?: number,
  ): {
    world: World;
    context: WavePhaseContext;
  } {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      ...(normalAttackDamage !== undefined ? { normalAttackDamage } : {}),
    });
    world.advanceTick();
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2], offerableArtifacts, 1);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
    world.setPhase(spawnedId, "dead");
    world.advanceTick();
    return { world, context };
  }

  it("pauses on the milestone instead of advancing when the final authored wave clears", () => {
    const { world, context } = clearToMilestone();
    const clearResult = resolveWavePhase(world, context);

    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared", "milestone_reached"]);
    expect(clearResult.victoryReady).toBe(false);
    expect(world.pendingMilestoneDecision).toEqual({ waveNumber: 1 });
    // The pause wins over the still-authored wave 2: the wave number does not advance.
    expect(world.waveRuntime?.waveNumber).toBe(1);
  });

  it("end-run finalizes the run as a victory with no further work", () => {
    const { world, context } = clearToMilestone();
    resolveWavePhase(world, context);

    const decision = resolveMilestoneDecision(world, "end-run", context);
    expect(decision.accepted).toBe(true);
    expect(decision.events).toEqual([
      { type: "milestone_decided", waveNumber: 1, choice: "end-run" },
      { type: "encounter_ended", outcome: "victory" },
    ]);
    expect(world.outcome).toBe("victory");
    expect(world.pendingMilestoneDecision).toBeUndefined();
  });

  it("continue-endless with no offerable reward starts the next endless wave", () => {
    const { world, context } = clearToMilestone();
    resolveWavePhase(world, context);

    const decision = resolveMilestoneDecision(world, "continue-endless", context);
    expect(decision.accepted).toBe(true);
    expect(decision.events.map((event) => event.type)).toEqual(["milestone_decided", "wave_started"]);
    expect(world.pendingMilestoneDecision).toBeUndefined();
    expect(world.pendingRewardOffer).toBeUndefined();
    expect(world.waveRuntime?.waveNumber).toBe(2);
  });

  it("continue-endless with an eligible reward opens the milestone wave's reward offer", () => {
    const { world, context } = clearToMilestone([ATTACK_UP], 20);
    resolveWavePhase(world, context);

    const decision = resolveMilestoneDecision(world, "continue-endless", context);
    expect(decision.events.map((event) => event.type)).toEqual(["milestone_decided", "reward_offered"]);
    expect(world.pendingRewardOffer).toEqual({
      waveNumber: 1,
      cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
    });
    // The reward flow advances to wave 2 only when the reward is selected, not yet.
    expect(world.waveRuntime?.waveNumber).toBe(1);
  });

  it("rejects a decision when no milestone is pending", () => {
    const world = createTrainingArena();
    spawnPlayer(world);
    const context = makeContext(groups, [wave1], undefined, 1);

    const result = resolveMilestoneDecision(world, "end-run", context);
    expect(result.accepted).toBe(false);
    expect(result.events).toEqual([]);
    expect(world.outcome).toBe("running");
  });

  it("rejects an unknown choice without clearing the pause", () => {
    const { world, context } = clearToMilestone();
    resolveWavePhase(world, context);

    const result = resolveMilestoneDecision(world, "bogus" as MilestoneChoice, context);
    expect(result.accepted).toBe(false);
    expect(world.pendingMilestoneDecision).toEqual({ waveNumber: 1 });
  });

  it("reproduces an identical snapshot from the same seed and the same continue decision", () => {
    function runThroughContinue(): World {
      const { world, context } = clearToMilestone();
      resolveWavePhase(world, context);
      resolveMilestoneDecision(world, "continue-endless", context);
      return world;
    }

    expect(runThroughContinue().snapshot()).toEqual(runThroughContinue().snapshot());
  });
});

describe("resolveRewardSelection", () => {
  function setUpPausedWorld() {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      normalAttackDamage: 20,
    });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 1 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2], [ATTACK_UP]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
    world.setPhase(spawnedId, "dead");
    world.advanceTick();
    resolveWavePhase(world, context);

    return { world, context };
  }

  it("rejects when no offer is pending", () => {
    const world = createTrainingArena();
    const context = makeContext([groupWithCount(1)], [], [ATTACK_UP]);
    const result = resolveRewardSelection(world, "attack_up", context);
    expect(result).toEqual({
      accepted: false,
      reason: "No reward selection is pending.",
      events: [],
    });
  });

  it("rejects a stale or unknown artifact ID without changing state", () => {
    const { world, context } = setUpPausedWorld();
    const before = world.snapshot();

    const result = resolveRewardSelection(world, "unknown_artifact", context);

    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("Unknown or stale reward selection.");
    expect(world.snapshot()).toEqual(before);
  });

  it("applies the stack, raises normal-attack damage, clears the offer, and starts the next wave", () => {
    const { world, context } = setUpPausedWorld();

    const result = resolveRewardSelection(world, "attack_up", context);

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual(["reward_selected", "wave_started"]);
    expect(world.pendingRewardOffer).toBeUndefined();
    expect(world.runBuild).toEqual({ stacks: { attack_up: 1 }, triggers: [] });
    expect(world.requireEntity("player").normalAttackDamage).toBe(30);
    expect(world.waveRuntime?.waveNumber).toBe(2);
    // Selection installs the next wave's slot state without consuming a tick or spawning anything.
    expect(world.tick).toBe(2);
    expect(world.listActiveEntities().filter((entity) => entity.kind === "enemy")).toHaveLength(0);

    // The next accepted-command wave phase call now warns Wave 2 through the normal path.
    world.advanceTick();
    const warned = resolveWavePhase(world, context);
    expect(warned.events.map((event) => event.type)).toEqual(["wave_group_warned"]);
  });

  it("stacks a second selection on top of the first", () => {
    const { world, context } = setUpPausedWorld();
    resolveRewardSelection(world, "attack_up", context);
    expect(world.requireEntity("player").normalAttackDamage).toBe(30);

    // Manually reinstall a second offer to exercise repeated selection without a full wave loop.
    world.installPendingRewardOffer({
      waveNumber: 2,
      cards: [{ artifactId: "attack_up", resultingStackCount: 2 }],
    });
    const result = resolveRewardSelection(world, "attack_up", context);

    expect(result.accepted).toBe(true);
    expect(world.runBuild).toEqual({ stacks: { attack_up: 2 }, triggers: [] });
    expect(world.requireEntity("player").normalAttackDamage).toBe(40);
  });
});

function otherArtifact(overrides: Partial<ArtifactDefinition>): ArtifactDefinition {
  return { ...ATTACK_UP, ...overrides };
}

const DASH_ATTACK_UP = otherArtifact({
  id: "dash_attack_up",
  effects: [{ kind: "channel", channel: "mobility-attack-damage", amount: 20 }],
});
const MOBILITY_COOLDOWN_DOWN = otherArtifact({
  id: "mobility_cooldown_down",
  effects: [{ kind: "channel", channel: "mobility-cooldown", amount: 1 }],
});
const MOBILITY_RANGE_UP = otherArtifact({
  id: "mobility_range_up",
  effects: [{ kind: "channel", channel: "mobility-range", amount: 1 }],
});
const MAX_HEALTH_UP = otherArtifact({
  id: "max_health_up",
  maxStacks: 2,
  effects: [{ kind: "channel", channel: "max-health", amount: 20 }],
});
const SPEED_UP = otherArtifact({
  id: "speed_up",
  maxStacks: 5,
  effects: [{ kind: "channel", channel: "speed", amount: 1 }],
});
const GUARD_SHREDDER = otherArtifact({
  id: "guard_shredder",
  category: "major",
  maxStacks: 1,
  minWave: 2,
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "guard-shredder" }],
});
const EXECUTION = otherArtifact({
  id: "execution",
  category: "major",
  maxStacks: 1,
  minWave: 2,
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "execution" }],
});

describe("resolveRewardSelection: every supported effect applies exactly once", () => {
  function setUpWorldWithOffer(
    artifact: ArtifactDefinition,
    resultingStackCount = 1,
  ): { world: World; context: WavePhaseContext } {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 80,
      normalAttackDamage: 20,
      mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 2 },
    });
    world.installPendingRewardOffer({
      waveNumber: 1,
      cards: [{ artifactId: artifact.id, resultingStackCount }],
    });
    const context = makeContext([groupWithCount(1)], [], [artifact]);
    return { world, context };
  }

  it("raises Mobility attack damage for dash_attack_up", () => {
    const { world, context } = setUpWorldWithOffer(DASH_ATTACK_UP);
    const result = resolveRewardSelection(world, "dash_attack_up", context);
    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player").mobility).toMatchObject({ damage: 50 });
    expect(world.runBuild).toEqual({ stacks: { dash_attack_up: 1 }, triggers: [] });
  });

  it("lowers configured Mobility cooldown for mobility_cooldown_down", () => {
    const { world, context } = setUpWorldWithOffer(MOBILITY_COOLDOWN_DOWN);
    const result = resolveRewardSelection(world, "mobility_cooldown_down", context);
    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player").mobility).toMatchObject({ cooldown: 3 });
  });

  it("preserves an active countdown: cooldown reward changes only the configured value", () => {
    const { world, context } = setUpWorldWithOffer(MOBILITY_COOLDOWN_DOWN);
    world.setMobilityCooldown("player", 4);

    resolveRewardSelection(world, "mobility_cooldown_down", context);

    expect(world.requireEntity("player").mobility).toMatchObject({
      cooldown: 3,
      remainingCooldown: 4,
    });
  });

  it("raises Mobility range for mobility_range_up", () => {
    const { world, context } = setUpWorldWithOffer(MOBILITY_RANGE_UP);
    const result = resolveRewardSelection(world, "mobility_range_up", context);
    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player").mobility).toMatchObject({ range: 4 });
  });

  it("raises current HP by the gained amount while injured, for max_health_up", () => {
    const { world, context } = setUpWorldWithOffer(MAX_HEALTH_UP);
    world.applyDamage("player", 30);
    expect(world.requireEntity("player")).toMatchObject({ hp: 50, maxHp: 80 });

    const result = resolveRewardSelection(world, "max_health_up", context);

    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player")).toMatchObject({ hp: 70, maxHp: 100 });
  });

  it("records the Guard Shredder trigger with no numeric field changes", () => {
    const { world, context } = setUpWorldWithOffer(GUARD_SHREDDER);
    const before = world.requireEntity("player");

    const result = resolveRewardSelection(world, "guard_shredder", context);

    expect(result.accepted).toBe(true);
    expect(world.runBuild).toEqual({ stacks: { guard_shredder: 1 }, triggers: ["guard-shredder"] });
    expect(world.requireEntity("player")).toMatchObject({
      normalAttackDamage: before.normalAttackDamage,
      mobility: before.mobility,
      hp: before.hp,
      maxHp: before.maxHp,
    });
  });

  it("records the Execution trigger with no numeric field changes", () => {
    const { world, context } = setUpWorldWithOffer(EXECUTION);
    const result = resolveRewardSelection(world, "execution", context);
    expect(result.accepted).toBe(true);
    expect(world.runBuild).toEqual({ stacks: { execution: 1 }, triggers: ["execution"] });
  });

  it("rejects an unsupported effect even if somehow offered, leaving state unchanged", () => {
    const { world, context } = setUpWorldWithOffer(SPEED_UP);
    const before = world.snapshot();

    const result = resolveRewardSelection(world, "speed_up", context);

    expect(result).toEqual({ accepted: false, reason: "Unsupported artifact effect.", events: [] });
    expect(world.snapshot()).toEqual(before);
  });
});

describe("generateSingleCardOffer wiring: Mobility eligibility at the wave boundary", () => {
  it("excludes a Dash-only major from a Smash player's offer", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    world.advanceTick();

    const groups = [groupWithCount(1)];
    const wave1: WaveDefinition = {
      id: "w1",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    const wave2: WaveDefinition = {
      id: "w2",
      populationCap: 5,
      slots: [slot({ warningTicks: 0 })],
    };
    installWave(world, wave1, groups);
    const context = makeContext(groups, [wave1, wave2], [GUARD_SHREDDER]);

    const spawnResult = resolveWavePhase(world, context);
    const spawnedId = (spawnResult.events[0] as { spawns: readonly { entityId: string }[] }).spawns[0]!.entityId;
    world.setPhase(spawnedId, "dead");
    world.advanceTick();

    const clearResult = resolveWavePhase(world, context);

    // Guard Shredder requires Dash; a Smash run's Wave 1 clear finds nothing eligible and
    // advances directly rather than pausing on an unreachable card.
    expect(clearResult.events.map((event) => event.type)).toEqual(["wave_cleared", "wave_started"]);
    expect(world.pendingRewardOffer).toBeUndefined();
  });
});
