import { describe, expect, it } from "vitest";
import { previewAttack, previewDash } from "../../../../src/core/actions/action-preview";
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
      path: [{ x: 7, y: 6 }],
      landing: { x: 7, y: 6 },
    });
    expect(previewDash(world, "player", { x: -1, y: 0 })).toMatchObject({
      accepted: false,
      path: [],
      reason: "Dash has no legal landing cell.",
    });
    expect(world.snapshot().tick).toBe(0);
  });
});
