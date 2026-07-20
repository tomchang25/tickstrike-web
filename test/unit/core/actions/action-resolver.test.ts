import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import { commandConsumesTime, type GameCommand } from "@core/actions/commands";
import type { WavePhaseContext } from "@core/actions/wave-phase";
import type {
  GrowthCurve,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveProgressionProfile,
} from "@core/content/wave-schema";
import { createInitialSlotStates } from "@core/waves/wave-scheduler";
import { createFoundationArena } from "@harness/fixtures/shipped-arena";
import { createTrainingArena } from "@harness/fixtures/training-arena";

describe("Smash action", () => {
  it("arms on the first action and releases the locked landing on the second", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    world.spawn({
      id: "enemy-center",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 3, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy-right",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 3 },
      hp: 100,
    });
    world.spawn({
      id: "enemy-water",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 4 },
      hp: 100,
    });

    const armed = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 4, y: 3 },
    });

    expect(armed.accepted).toBe(true);
    expect(armed.events).toEqual([
      { type: "command_resolved", commandType: "smash", accepted: true, consumedTime: true },
      { type: "smash_armed", actorId: "player", target: { x: 4, y: 3 } },
      { type: "world_advanced", tick: 1, phases: ["foundation", "enemy"] },
    ]);
    expect(world.snapshot()).toMatchObject({ tick: 1, armedSmashTarget: { x: 4, y: 3 } });

    const result = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 0, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "smash_impact",
      "enemy_damaged",
      "enemy_knocked",
      "enemy_damaged",
      "enemy_knocked",
      "enemy_damaged",
      "enemy_entered_water",
      "actor_moved",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy-center").phase).toBe("alive");
    expect(world.requireEntity("enemy-center").hp).toBe(70);
    expect(world.requireEntity("enemy-center").cell).toEqual({ x: 3, y: 1 });
    expect(world.requireEntity("enemy-right").hp).toBe(70);
    expect(world.requireEntity("enemy-right").cell).toEqual({ x: 7, y: 3 });
    // The drowning victim resolved terminally in this command, so it leaves the world with it.
    expect(result.events).toContainEqual({
      type: "enemy_entered_water",
      enemyId: "enemy-water",
      from: { x: 4, y: 4 },
      waterCell: { x: 4, y: 6 },
    });
    expect(world.getEntity("enemy-water")).toBeUndefined();
    expect(world.playerCell).toEqual({ x: 4, y: 3 });
    expect(world.getOccupantAt({ x: 4, y: 6 })).toBeUndefined();
    expect(world.listEntities()).toHaveLength(3);
    expect(world.snapshot().armedSmashTarget).toBeUndefined();
    expect(world.snapshot().tick).toBe(2);
  });
});

describe("player verbs", () => {
  it("accepts an occupied-cell Normal Attack and an empty-cell whiff", () => {
    const world = createFoundationArena();

    const occupied = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(occupied.accepted).toBe(true);
    expect(occupied.events.slice(1, 5)).toEqual([
      {
        type: "player_attacked",
        actorId: "player",
        direction: { x: -1, y: 0 },
        target: { x: 5, y: 6 },
        hit: {
          attackerId: "player",
          targetId: "enemy-thrust",
          damage: 4,
          baseDamage: 20,
          angle: "front",
          guardDamage: 4,
          guardBefore: 32,
          guardAfter: 28,
          hpDamage: 4,
          defenseAdjustedDamage: 4,
          guardBroken: false,
          staggerBurst: false,
          feedback: "guarded",
          hpBefore: 100,
          hpAfter: 96,
          killed: false,
        },
      },
      {
        type: "directional_hit",
        attackerId: "player",
        targetId: "enemy-thrust",
        hit: {
          attackerId: "player",
          targetId: "enemy-thrust",
          damage: 4,
          baseDamage: 20,
          angle: "front",
          guardDamage: 4,
          guardBefore: 32,
          guardAfter: 28,
          hpDamage: 4,
          defenseAdjustedDamage: 4,
          guardBroken: false,
          staggerBurst: false,
          feedback: "guarded",
          hpBefore: 100,
          hpAfter: 96,
          killed: false,
        },
      },
      {
        type: "enemy_guard_damaged",
        enemyId: "enemy-thrust",
        damage: 4,
        guard: 28,
        maxGuard: 32,
      },
      {
        type: "enemy_damaged",
        enemyId: "enemy-thrust",
        hit: expect.any(Object),
        hp: 96,
        maxHp: 100,
      },
    ]);
    expect(occupied.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "directional_hit",
      "enemy_guard_damaged",
      "enemy_damaged",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "enemy_moved",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "world_advanced",
    ]);
    expect(occupied.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "directional_hit",
      "enemy_guard_damaged",
      "enemy_damaged",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "enemy_moved",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy-thrust")).toMatchObject({
      hp: 96,
      phase: "alive",
      guard: { current: 28 },
    });
    expect(world.snapshot().tick).toBe(1);
    expect(world.snapshot().lastEvents).toEqual(occupied.events);

    const whiff = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 0, y: -1 },
    });

    expect(whiff.accepted).toBe(true);
    expect(whiff.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "world_advanced",
    ]);
    expect(world.snapshot().tick).toBe(2);
  });

  it("kills an enemy on an overkill Normal Attack and releases its cell immediately", () => {
    const world = createFoundationArena();
    world.applyDamage("enemy-thrust", 95);

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_attacked",
      "directional_hit",
      "enemy_guard_damaged",
      "enemy_damaged",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "enemy_moved",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "world_advanced",
    ]);
    expect(world.requireEntity("enemy-thrust")).toMatchObject({
      hp: 1,
      maxHp: 100,
      phase: "alive",
      guard: { current: 28 },
    });
    expect(world.getOccupantAt({ x: 5, y: 6 })?.id).toBe("enemy-thrust");
    expect(world.snapshot().tick).toBe(1);
  });

  it("dashes through an enemy and lands on the farthest later empty cell", () => {
    const world = createFoundationArena();

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 3,
    });

    expect(result.accepted).toBe(true);
    expect(result.events[1]).toEqual({
      type: "player_dashed",
      actorId: "player",
      from: { x: 6, y: 6 },
      to: { x: 9, y: 6 },
      path: [
        { x: 7, y: 6 },
        { x: 8, y: 6 },
        { x: 9, y: 6 },
      ],
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: "directional_hit",
        targetId: "enemy-slash",
        hit: expect.objectContaining({ angle: "front", guardDamage: 4, hpDamage: 6, hpAfter: 94 }),
      }),
    );
    expect(result.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "player_dashed",
      "directional_hit",
      "enemy_guard_damaged",
      "enemy_damaged",
      "enemy_moved",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_attack_committed",
      "telegraph_changed",
      "enemy_moved",
      "enemy_moved",
      "world_advanced",
    ]);
    expect(world.playerCell).toEqual({ x: 9, y: 6 });
    expect(world.getOccupantAt({ x: 8, y: 6 })?.id).toBe("enemy-slash");
    expect(world.requireEntity("enemy-slash")).toMatchObject({
      hp: 94,
      phase: "alive",
      guard: { current: 28 },
    });
    expect(world.snapshot().tick).toBe(1);
  });

  it("lands a Dash on the selected earlier grid", () => {
    const world = createFoundationArena();

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 1,
    });

    expect(result.accepted).toBe(true);
    expect(result.events[1]).toMatchObject({
      type: "player_dashed",
      from: { x: 6, y: 6 },
      to: { x: 7, y: 6 },
      path: [{ x: 7, y: 6 }],
    });
    expect(world.playerCell).toEqual({ x: 7, y: 6 });
    expect(world.snapshot().tick).toBe(1);
  });

  it("crushes an enemy occupying the locked impact cell before landing", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "viking",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    const armed = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 5, y: 5 },
    });
    expect(armed.accepted).toBe(true);

    world.spawn({
      id: "smash-blocker",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 5 },
      hp: 100,
    });
    const beforeRelease = world.snapshot();
    const release = resolveCommand(world, {
      type: "smash",
      actorId: "player",
      target: { x: 0, y: 0 },
    });

    expect(release.accepted).toBe(true);
    expect(release.events.map((event) => event.type)).toContain("enemy_crushed");
    expect(world.getEntity("smash-blocker")).toBeUndefined();
    expect(world.getOccupantAt({ x: 5, y: 5 })?.id).toBe("player");
    expect(world.playerCell).toEqual({ x: 5, y: 5 });
    expect(world.snapshot().tick).toBe(beforeRelease.tick + 1);
  });

  it("rejects a Dash when every traversed cell is occupied by an enemy", () => {
    const world = createFoundationArena();
    world.removeEntity("enemy-thrust");
    world.removeEntity("enemy-slash");
    world.removeEntity("enemy-ranged");
    world.spawn({
      id: "enemy-a",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 6 },
      hp: 10,
    });
    world.spawn({
      id: "enemy-b",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 6 },
      hp: 10,
    });
    world.spawn({
      id: "enemy-c",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 3, y: 6 },
      hp: 10,
    });
    const before = world.snapshot();

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: -1, y: 0 },
      distance: 3,
    });

    expect(result).toMatchObject({
      accepted: false,
      consumedTime: false,
      reason: "Dash has no legal landing cell.",
      events: [],
    });
    expect(world.snapshot()).toEqual(before);
  });

  it("limits Dash to three legal cells", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 1, y: 1 },
      hp: 100,
    });

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(world.playerCell).toEqual({ x: 4, y: 1 });
    expect(result.events[1]).toMatchObject({
      type: "player_dashed",
      path: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
      ],
    });
    expect(world.snapshot().tick).toBe(1);
  });

  it("rejects non-cardinal Attack and Dash directions without advancing", () => {
    const world = createFoundationArena();
    const before = world.snapshot();

    const attack = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: 1, y: 1 },
    });
    const dash = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 0, y: 0 },
    });

    expect(attack.accepted).toBe(false);
    expect(dash.accepted).toBe(false);
    expect(world.snapshot()).toEqual(before);
  });
});

describe("player-clocked action boundary", () => {
  it("advances once after an accepted action and not after rejection", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 1, y: 2 },
      hp: 100,
    });

    const rejected = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });
    expect(rejected.accepted).toBe(false);
    expect(world.snapshot().tick).toBe(0);

    const accepted = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.events.map((event) => event.type)).toEqual([
      "command_resolved",
      "actor_moved",
      "world_advanced",
    ]);
    expect(world.snapshot().tick).toBe(1);
  });

  it("marks every player verb as time-consuming", () => {
    const commands: readonly GameCommand[] = [
      { type: "move", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "attack", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "dash", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "smash", actorId: "player", target: { x: 2, y: 2 } },
    ];
    expect(commands.every(commandConsumesTime)).toBe(true);
  });

  it("applies Mobility cooldown after release and clears invulnerability after the enemy phase", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "ninja",
      cell: { x: 1, y: 1 },
      hp: 100,
      mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 2 },
    });

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 1,
    });

    expect(result.accepted).toBe(true);
    expect(world.requireEntity("player").mobility).toMatchObject({
      remainingCooldown: 4,
      invulnerable: false,
    });

    const rejected = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 1,
    });
    expect(rejected).toMatchObject({
      accepted: false,
      consumedTime: false,
      reason: "Mobility is on cooldown.",
    });
    expect(world.snapshot().tick).toBe(1);
  });

  it("suppresses a committed enemy hit during the Mobility release phase", () => {
    const world = createTrainingArena();
    const enemy = {
      role: "thrust" as const,
      attackId: "thrust",
      damage: 10,
      warningTicks: 0,
      recoveryTicks: 2,
      offsets: [{ x: 1, y: 0 }],
    };
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "ninja",
      cell: { x: 1, y: 3 },
      hp: 100,
      mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 2 },
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "thrust",
      cell: { x: 5, y: 3 },
      hp: 100,
      enemyAction: enemy,
      facing: { x: -1, y: 0 },
    });
    world.commitEnemyAttack("enemy", {
      attackId: "thrust",
      cells: [{ x: 4, y: 3 }],
      damage: 10,
      warningTicks: 0,
      recoveryTicks: 2,
    });

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 3,
    });

    expect(result.events.map((event) => event.type)).toContain("enemy_attack_detonated");
    expect(result.events.map((event) => event.type)).not.toContain("player_damaged");
    expect(world.requireEntity("player")).toMatchObject({
      hp: 100,
      phase: "alive",
      cell: { x: 4, y: 3 },
    });
  });
});

describe("playable encounter outcomes", () => {
  it("ends in victory when every enabled enemy is terminal and rejects later commands", () => {
    const world = createFoundationArena();
    world.applyDamage("enemy-thrust", 100);
    world.applyDamage("enemy-slash", 100);
    world.applyDamage("enemy-ranged", 100);
    world.applyDamage("enemy-charge", 150);
    world.applyDamage("enemy-bomb", 50);

    const result = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(world.snapshot()).toMatchObject({ tick: 1, outcome: "victory", telegraphs: [] });
    expect(result.events.map((event) => event.type)).toContain("encounter_ended");
    expect(result.events.at(-1)).toEqual({
      type: "world_advanced",
      tick: 1,
      phases: ["foundation", "enemy"],
    });

    const beforeRejected = world.snapshot();
    const rejected = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(rejected).toEqual({
      accepted: false,
      consumedTime: false,
      reason: "Encounter has ended.",
      events: [],
    });
    expect(world.snapshot()).toEqual(beforeRejected);
  });

  it("lets the player escape a locked Telegraph and later resolves a defeat", () => {
    const createDuel = () => {
      const world = createTrainingArena();
      world.spawn({
        id: "player",
        kind: "player",
        archetype: "training-player",
        cell: { x: 3, y: 3 },
        hp: 10,
      });
      world.spawn({
        id: "enemy-thrust",
        kind: "enemy",
        archetype: "thrust",
        cell: { x: 2, y: 3 },
        hp: 100,
        enemyAction: {
          role: "thrust",
          attackId: "thrust",
          damage: 10,
          warningTicks: 2,
          recoveryTicks: 2,
          offsets: [{ x: 1, y: 0 }],
        },
        facing: { x: 1, y: 0 },
      });
      return world;
    };

    const escaped = createDuel();
    resolveCommand(escaped, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    resolveCommand(escaped, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });
    const escapedResult = resolveCommand(escaped, {
      type: "move",
      actorId: "player",
      direction: { x: 0, y: 1 },
    });

    expect(escapedResult.accepted).toBe(true);
    expect(escaped.requireEntity("player")).toMatchObject({ hp: 10, phase: "alive" });
    expect(escaped.snapshot()).toMatchObject({ outcome: "running", telegraphs: [] });
    expect(escapedResult.events.some((event) => event.type === "player_damaged")).toBe(false);

    const defeated = createDuel();
    for (let index = 0; index < 3; index += 1) {
      resolveCommand(defeated, { type: "attack", actorId: "player", direction: { x: 0, y: -1 } });
    }

    const lastEvents = defeated.snapshot().lastEvents;
    expect(defeated.snapshot()).toMatchObject({ outcome: "defeat", telegraphs: [] });
    expect(defeated.getEntity("player")).toBeUndefined();
    expect(defeated.snapshot().playerCell).toBeUndefined();
    expect(lastEvents.map((event) => event.type)).toContain("player_died");
    expect(lastEvents).toContainEqual({ type: "encounter_ended", outcome: "defeat" });
  });
});

describe("terminal entity finalization", () => {
  it("removes the entity its own command killed and frees the cell", () => {
    const world = createFoundationArena();
    world.applyDamage("enemy-thrust", 98);

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.events.map((event) => event.type)).toContain("enemy_died");
    expect(world.getEntity("enemy-thrust")).toBeUndefined();
    expect(world.snapshot().entities.map((entity) => entity.id)).not.toContain("enemy-thrust");
    expect(world.getOccupantAt({ x: 5, y: 6 })).toBeUndefined();
  });

  it("leaves a terminal entity that produced no terminal event in this command", () => {
    const world = createFoundationArena();
    world.setPhase("enemy-ranged", "dead");

    const result = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(world.requireEntity("enemy-ranged").phase).toBe("dead");
  });

  it("still declares legacy victory in the very command that kills the last enemy", () => {
    const world = createFoundationArena();
    world.applyDamage("enemy-slash", 100);
    world.applyDamage("enemy-ranged", 100);
    world.applyDamage("enemy-charge", 150);
    world.applyDamage("enemy-bomb", 50);
    world.applyDamage("enemy-thrust", 98);

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.events).toContainEqual({ type: "encounter_ended", outcome: "victory" });
    expect(world.outcome).toBe("victory");
    expect(world.getEntity("enemy-thrust")).toBeUndefined();
  });
});

describe("wave phase wiring in the accepted-command path", () => {
  const zeroCurve: GrowthCurve = {
    standardCoefficient: 0,
    standardExponent: 1,
    lethalCoefficient: 0,
    lethalExponent: 1,
  };
  const profile: WaveProgressionProfile = {
    lethalLevelStart: 10,
    hpCurve: zeroCurve,
    damageCurve: zeroCurve,
    defenseCurve: zeroCurve,
    guardGrowth: { basis: "base-wave", standardWaveLimit: 20, lethalTierCadence: 5 },
  };
  const groups: readonly SpawnGroupDefinition[] = [
    {
      id: "grunt-group",
      placementStrategy: "scatter",
      compositionMode: "fixed",
      weightedTotalCount: 0,
      entries: [{ enemyId: "grunt", count: 1 }],
    },
  ];
  const wave: WaveDefinition = {
    id: "w1",
    populationCap: 5,
    slots: [
      {
        spawnGroupId: "grunt-group",
        startCondition: "immediate-overlap",
        survivorThreshold: 0,
        warningTicks: 0,
        levelOffset: 0,
        isBoss: false,
      },
    ],
  };
  const waveContext: WavePhaseContext = {
    groups,
    progressionProfile: profile,
    waveFor: (waveNumber) => (waveNumber === 1 ? wave : undefined),
    buildEnemySpawnInput: (request) => ({
      id: request.id,
      kind: "enemy",
      archetype: request.enemyId,
      cell: request.cell,
      hp: 10,
    }),
  };

  it("runs the wave phase after the enemy phase and splices its events before encounter_ended", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    const random = () => world.random.get("waves").nextUnit();
    world.setWave(1, createInitialSlotStates(wave, groups, 1, random));

    const result = resolveCommand(
      world,
      { type: "move", actorId: "player", direction: { x: 1, y: 0 } },
      waveContext,
    );

    expect(result.accepted).toBe(true);
    const types = result.events.map((event) => event.type);
    const commandIndex = types.indexOf("command_resolved");
    const waveIndex = types.indexOf("wave_group_spawned");
    const advancedIndex = types.indexOf("world_advanced");
    expect(commandIndex).toBeLessThan(waveIndex);
    expect(waveIndex).toBeLessThan(advancedIndex);
    expect(world.listEntities().filter((entity) => entity.id.startsWith("wave-"))).toHaveLength(1);
  });

  it("leaves a scenario with no wave context byte-for-byte unchanged (legacy no-op)", () => {
    const world = createFoundationArena();
    const result = resolveCommand(world, {
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(result.accepted).toBe(true);
    expect(result.events.some((event) => event.type.startsWith("wave_"))).toBe(false);
    expect(world.waveRuntime).toBeUndefined();
  });

  it("does not declare victory from a false-empty board while a wave is still producing", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    const twoWaveContext: WavePhaseContext = {
      ...waveContext,
      waveFor: (waveNumber) => (waveNumber <= 2 ? wave : undefined),
    };
    const random = () => world.random.get("waves").nextUnit();
    world.setWave(1, createInitialSlotStates(wave, groups, 1, random));

    const spawnResult = resolveCommand(
      world,
      { type: "move", actorId: "player", direction: { x: 1, y: 0 } },
      twoWaveContext,
    );
    expect(world.outcome).toBe("running");

    const spawnedId = world.listEntities().find((entity) => entity.id.startsWith("wave-"))!.id;
    world.setPhase(spawnedId, "dead");

    const clearResult = resolveCommand(
      world,
      { type: "move", actorId: "player", direction: { x: -1, y: 0 } },
      twoWaveContext,
    );

    // The board is empty here (wave 1 cleared, wave 2 not yet admitted) but the run is not over.
    expect(clearResult.events.map((event) => event.type)).toContain("wave_cleared");
    expect(world.outcome).toBe("running");
    expect(spawnResult.events.some((event) => event.type === "encounter_ended")).toBe(false);
  });
});

describe("pending reward selection blocks commands", () => {
  it("rejects every command type without consuming a tick, an enemy phase, or a wave change", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
      normalAttackDamage: 20,
      mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 2 },
    });
    world.installPendingRewardOffer({
      waveNumber: 1,
      cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
    });
    const before = world.snapshot();

    const commands: readonly GameCommand[] = [
      { type: "move", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "attack", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "dash", actorId: "player", direction: { x: 1, y: 0 } },
      { type: "smash", actorId: "player", target: { x: 3, y: 2 } },
    ];

    for (const command of commands) {
      const result = resolveCommand(world, command);
      expect(result).toEqual({
        accepted: false,
        consumedTime: false,
        reason: "A reward selection is pending.",
        events: [],
      });
    }
    expect(world.snapshot()).toEqual(before);
  });
});
