import { describe, expect, it } from "vitest";
import { clampSmashTarget, previewAttack, previewDash, previewSmash, smashArea } from "../../../../src/core/actions/action-preview";
import { createFoundationArena } from "../../../../src/harness/fixtures/shipped-arena";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";

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
      path: [{ x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 }],
      landing: { x: 9, y: 6 },
    });
    expect(previewDash(world, "player", { x: -1, y: 0 }, 3)).toMatchObject({
      accepted: true,
      path: [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }],
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

  it("shares the predicted Dash hit with the committed directional result", () => {
    const world = createFoundationArena();
    const preview = previewDash(world, "player", { x: 1, y: 0 }, 3);
    const predicted = preview.victims.find((victim) => victim.enemyId === "enemy-slash");
    if (!predicted) throw new Error("Expected the Dash preview to include enemy-slash.");

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
    world.spawn({ id: "enemy-center", kind: "enemy", archetype: "training-grunt", cell: { x: 4, y: 3 }, hp: 100 });
    world.spawn({ id: "enemy-blocked", kind: "enemy", archetype: "training-grunt", cell: { x: 4, y: 2 }, hp: 100 });
    world.spawn({ id: "enemy-right", kind: "enemy", archetype: "training-grunt", cell: { x: 5, y: 3 }, hp: 100 });
    world.spawn({ id: "enemy-water", kind: "enemy", archetype: "training-grunt", cell: { x: 4, y: 4 }, hp: 100 });
    expect(world.requestReservation({
      ownerId: "fixture-blocker",
      purpose: "movement",
      cells: [{ x: 4, y: 1 }],
    }).granted).toBe(true);

    const preview = previewSmash(world, "player", { x: 4, y: 3 });

    expect(preview).toMatchObject({ accepted: true, target: { x: 4, y: 3 } });
    expect(preview.victims).toMatchObject([
      { enemyId: "enemy-center", displacement: "crush" },
      { enemyId: "enemy-blocked", displacement: "blocked" },
      { enemyId: "enemy-right", displacement: "knockback", destination: { x: 7, y: 3 } },
      { enemyId: "enemy-water", displacement: "water", destination: { x: 4, y: 6 } },
    ]);
  });
});
