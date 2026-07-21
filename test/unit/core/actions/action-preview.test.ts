import { describe, expect, it } from "vitest";
import {
  clampSmashTarget,
  previewAttack,
  previewAttackVictimMarkers,
  previewDash,
  previewDashVictimMarkers,
  previewSmash,
  previewSmashVictimMarkers,
  smashArea,
} from "@core/actions/action-preview";
import { createFoundationArena } from "@harness/fixtures/shipped-arena";
import { createTrainingArena } from "@harness/fixtures/training-arena";
import { resolveCommand } from "@core/actions/action-resolver";

describe("action previews", () => {
  it("resolves an occupied and empty adjacent attack target without mutating the world", () => {
    const world = createFoundationArena();
    const before = world.snapshot();

    expect(previewAttack(world, "player", { x: -1, y: 0 })).toMatchObject({
      accepted: true,
      target: { x: 5, y: 6 },
      hasTarget: true,
      hit: {
        attackerId: "player",
        targetId: "enemy-thrust",
        damage: 4,
        hpBefore: 100,
        hpAfter: 96,
        killed: false,
      },
    });
    expect(previewAttack(world, "player", { x: 1, y: 0 })).toMatchObject({
      accepted: true,
      target: { x: 7, y: 6 },
      hasTarget: false,
    });
    expect(world.snapshot()).toEqual(before);
  });

  it("does not project a hit for a terminal adjacent target", () => {
    const world = createFoundationArena();
    world.setPhase("enemy-thrust", "dead");

    expect(previewAttack(world, "player", { x: -1, y: 0 })).toMatchObject({
      accepted: true,
      target: { x: 5, y: 6 },
      hasTarget: false,
    });
    expect(previewAttack(world, "player", { x: -1, y: 0 }).hit).toBeUndefined();
  });

  it("shares Port 03 Dash landing and blocking rules", () => {
    const world = createFoundationArena();

    expect(previewDash(world, "player", { x: 1, y: 0 }, 3)).toMatchObject({
      accepted: true,
      path: [
        { x: 7, y: 6 },
        { x: 8, y: 6 },
        { x: 9, y: 6 },
      ],
      landing: { x: 9, y: 6 },
    });
    expect(previewDash(world, "player", { x: -1, y: 0 }, 3)).toMatchObject({
      accepted: true,
      path: [
        { x: 5, y: 6 },
        { x: 4, y: 6 },
        { x: 3, y: 6 },
      ],
      landing: { x: 3, y: 6 },
    });
    expect(world.snapshot().tick).toBe(0);
  });

  it("allows a selected Dash to land before its maximum range", () => {
    const world = createFoundationArena();

    expect(previewDash(world, "player", { x: 1, y: 0 }, 1)).toMatchObject({
      accepted: true,
      path: [{ x: 7, y: 6 }],
      landing: { x: 7, y: 6 },
    });
  });

  it("does not hit an enemy on the selected blocked grid after the landing cell", () => {
    const world = createFoundationArena();

    const preview = previewDash(world, "player", { x: 1, y: 0 }, 2);

    expect(preview).toMatchObject({
      accepted: true,
      path: [{ x: 7, y: 6 }],
      landing: { x: 7, y: 6 },
      victims: [],
    });

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 2,
    });

    expect(result.events).not.toContainEqual(
      expect.objectContaining({
        type: "enemy_damaged",
        enemyId: "enemy-slash",
      }),
    );
    expect(world.requireEntity("enemy-slash")).toMatchObject({ hp: 100, phase: "alive" });
    expect(world.playerCell).toEqual({ x: 7, y: 6 });
  });

  it("shares the predicted Dash hit with the committed directional result", () => {
    const world = createFoundationArena();
    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const predicted = preview.victims.find((victim) => victim.enemyId === "enemy-slash");
    if (!predicted) {
      throw new Error("Expected the Dash preview to include enemy-slash.");
    }

    const result = resolveCommand(world, {
      type: "dash",
      actorId: "player",
      direction: { x: 1, y: 0 },
      distance: 3,
    });

    expect(result.events).toContainEqual({
      type: "directional_hit",
      attackerId: "player",
      targetId: "enemy-slash",
      hit: predicted.hit,
    });
  });

  it("clamps Smash targets and previews a legal 3x3 landing area", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "viking",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    const target = clampSmashTarget({ x: 20, y: -20 }, { x: 6, y: 6 });

    expect(target).toEqual({ x: 9, y: 3 });
    expect(smashArea({ x: 6, y: 6 })).toHaveLength(9);
    expect(previewSmash(world, "player", { x: 5, y: 5 })).toMatchObject({
      accepted: true,
      target: { x: 5, y: 5 },
    });
    expect(previewSmash(world, "player", { x: 4, y: 6 })).toMatchObject({
      accepted: false,
      reason: "Smash landing is blocked.",
    });
  });

  it("previews crush, stable two-cell displacement, blocked fallback, and water terminalization", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "viking",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    world.spawn({
      id: "enemy-center",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 3 },
      hp: 100,
    });
    world.spawn({
      id: "enemy-blocked",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
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
    expect(
      world.requestReservation({
        ownerId: "fixture-blocker",
        purpose: "movement",
        cells: [{ x: 4, y: 1 }],
      }).granted,
    ).toBe(true);

    const preview = previewSmash(world, "player", { x: 4, y: 3 });

    expect(preview).toMatchObject({ accepted: true, target: { x: 4, y: 3 } });
    expect(preview.victims).toMatchObject([
      { enemyId: "enemy-center", displacement: "crush" },
      { enemyId: "enemy-blocked", displacement: "blocked" },
      { enemyId: "enemy-right", displacement: "knockback", destination: { x: 7, y: 3 } },
      { enemyId: "enemy-water", displacement: "water", destination: { x: 4, y: 6 } },
    ]);
    expect(previewSmashVictimMarkers(preview)).toEqual([
      { enemyId: "enemy-center", from: { x: 4, y: 3 }, outcome: "crush" },
      { enemyId: "enemy-blocked", from: { x: 4, y: 2 }, outcome: "blocked" },
      { enemyId: "enemy-right", from: { x: 5, y: 3 }, to: { x: 7, y: 3 }, outcome: "knockback" },
      { enemyId: "enemy-water", from: { x: 4, y: 4 }, to: { x: 4, y: 6 }, outcome: "water" },
    ]);
  });

  it("projects lethal Attack and Dash hits into shared kill markers", () => {
    const attackWorld = createTrainingArena();
    attackWorld.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      normalAttackDamage: 4,
    });
    attackWorld.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 3 },
      hp: 1,
    });
    const attackPreview = previewAttack(attackWorld, "player", { x: 1, y: 0 });
    expect(previewAttackVictimMarkers(attackPreview)).toEqual([
      { enemyId: "enemy", from: { x: 4, y: 3 }, outcome: "kill" },
    ]);

    const dashWorld = createTrainingArena();
    dashWorld.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 1, y: 1 },
      hp: 100,
      mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 1 },
    });
    dashWorld.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 1 },
      hp: 1,
    });
    const dashPreview = previewDash(dashWorld, "player", { x: 1, y: 0 }, 3);
    expect(previewDashVictimMarkers(dashPreview)).toEqual([
      { enemyId: "enemy", from: { x: 2, y: 1 }, outcome: "kill" },
    ]);
  });

  it("does not project a kill marker for a non-lethal shared hit", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      normalAttackDamage: 4,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 3 },
      hp: 100,
    });

    expect(previewAttackVictimMarkers(previewAttack(world, "player", { x: 1, y: 0 }))).toEqual([]);
  });
});

const HEAVY_GUARD = {
  id: "heavy",
  name: "Heavy",
  base: 100,
  lethalTierGain: 0,
  stagger: 2,
  protection: 5,
  protectionMultiplier: 0.5,
};

function spawnDashPlayer(world: ReturnType<typeof createTrainingArena>, cell = { x: 1, y: 3 }): void {
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "training-player",
    cell,
    hp: 100,
    normalAttackDamage: 20,
    mobility: { kind: "dash", damage: 30, range: 3, cooldown: 4, staggerMultiplier: 1 },
  });
}

describe("Dash trigger previews: Guard Shredder and Execution", () => {
  it("previews ordinary Guard math on a back hit with no acquired trigger", () => {
    const world = createTrainingArena();
    spawnDashPlayer(world);
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 100,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
    });

    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    expect(victim?.hit).toMatchObject({ guardBroken: false, guardAfter: 68 });
  });

  it("previews a guaranteed guard break on a qualifying back-angle Dash hit once acquired", () => {
    const world = createTrainingArena();
    spawnDashPlayer(world);
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 100,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
    });
    world.applyRewardSelection("guard_shredder", 1, "guard-shredder");

    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    expect(victim?.hit).toMatchObject({ guardBroken: true, guardAfter: 0 });
  });

  it("does not guarantee a break on a front-angle Dash hit even once acquired", () => {
    const world = createTrainingArena();
    spawnDashPlayer(world, { x: 3, y: 3 });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 100,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
    });
    world.applyRewardSelection("guard_shredder", 1, "guard-shredder");

    const preview = previewDash(world, "player", { x: -1, y: 0 }, 3);
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    // Dashing at this facing enemy is a front hit: ordinary 4 Guard damage, no forced break.
    expect(victim?.hit).toMatchObject({ angle: "front", guardBroken: false, guardAfter: 96 });
  });

  it("previews an instant kill on a staggered target once Execution is acquired", () => {
    const world = createTrainingArena();
    spawnDashPlayer(world);
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 45,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
      enemyAction: {
        role: "thrust",
        attackId: "thrust",
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 2,
        offsets: [{ x: 1, y: 0 }],
      },
    });
    world.setEnemyActivity("enemy", "staggered");
    world.applyRewardSelection("execution", 1, "execution");

    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    expect(victim?.hit).toMatchObject({ killed: true, hpAfter: 0 });
  });

  it("does not instant-kill a non-staggered target even once Execution is acquired", () => {
    const world = createTrainingArena();
    spawnDashPlayer(world);
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 45,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
    });
    world.applyRewardSelection("execution", 1, "execution");

    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    expect(victim?.hit).toMatchObject({ killed: false });
  });

  it("does not consume either trigger for Smash, only Dash", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "viking",
      cell: { x: 3, y: 3 },
      hp: 100,
      mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
    });
    // Off-center within the smash area so the hit is directional (a centered victim's origin
    // equals its own cell, which resolves to an angle-less basic hit instead).
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 4 },
      hp: 100,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
    });
    world.applyRewardSelection("guard_shredder", 1, "guard-shredder");
    world.applyRewardSelection("execution", 1, "execution");

    const preview = previewSmash(world, "player", { x: 4, y: 3 });
    const victim = preview.victims.find((candidate) => candidate.enemyId === "enemy");

    expect(victim?.hit).toMatchObject({ angle: "side", guardBroken: false, killed: false });
  });

  it("does not consume either trigger for Normal Attack", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 3, y: 3 },
      hp: 100,
      normalAttackDamage: 20,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 3 },
      hp: 45,
      guardDefinition: HEAVY_GUARD,
      facing: { x: 1, y: 0 },
      enemyAction: {
        role: "thrust",
        attackId: "thrust",
        damage: 10,
        warningTicks: 0,
        recoveryTicks: 2,
        offsets: [{ x: 1, y: 0 }],
      },
    });
    world.setEnemyActivity("enemy", "staggered");
    world.applyRewardSelection("execution", 1, "execution");

    const preview = previewAttack(world, "player", { x: -1, y: 0 });

    expect(preview.hit).toMatchObject({ killed: false });
  });
});
