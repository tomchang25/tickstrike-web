import { describe, expect, it } from "vitest";
import { clampSmashTarget, previewAttack, previewDash, previewSmash, smashArea } from "../../../../src/core/actions/action-preview";
import { createFoundationArena } from "../../../../src/harness/fixtures/shipped-arena";

describe("action previews", () => {
  it("resolves an occupied and empty adjacent attack target without mutating the world", () => {
    const world = createFoundationArena();
    const before = world.snapshot();

    expect(previewAttack(world, "player", { x: -1, y: 0 })).toMatchObject({
      accepted: true,
      target: { x: 5, y: 6 },
      hasTarget: true,
    });
    expect(previewAttack(world, "player", { x: 1, y: 0 })).toMatchObject({
      accepted: true,
      target: { x: 7, y: 6 },
      hasTarget: false,
    });
    expect(world.snapshot()).toEqual(before);
  });

  it("shares Port 03 Dash landing and blocking rules", () => {
    const world = createFoundationArena();

    expect(previewDash(world, "player", { x: 1, y: 0 })).toMatchObject({
      accepted: true,
      path: [{ x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 }],
      landing: { x: 9, y: 6 },
    });
    expect(previewDash(world, "player", { x: -1, y: 0 })).toMatchObject({
      accepted: true,
      path: [{ x: 5, y: 6 }, { x: 4, y: 6 }, { x: 3, y: 6 }],
      landing: { x: 3, y: 6 },
    });
    expect(world.snapshot().tick).toBe(0);
  });

  it("clamps Smash targets and previews a legal 3x3 landing area", () => {
    const world = createFoundationArena();
    const target = clampSmashTarget({ x: 20, y: -20 }, { x: 6, y: 6 });

    expect(target).toEqual({ x: 9, y: 3 });
    expect(smashArea({ x: 6, y: 6 })).toHaveLength(9);
    expect(previewSmash(world, "player", { x: 7, y: 7 })).toMatchObject({
      accepted: true,
      target: { x: 7, y: 7 },
    });
    expect(previewSmash(world, "player", { x: 5, y: 6 })).toMatchObject({
      accepted: false,
      reason: "Smash landing is blocked.",
    });
  });
});
