import { describe, expect, it } from "vitest";
import type { WorldSnapshot } from "../../../../src/core/model/types";
import { PixiGameRenderer } from "../../../../src/presentation/pixi/PixiGameRenderer";

function snapshot(cell: { x: number; y: number }): WorldSnapshot {
  return {
    tick: 1,
    outcome: "running",
    arena: {
      width: 4,
      height: 4,
      terrain: Array.from({ length: 16 }, () => "land" as const),
      tiles: Array.from({ length: 16 }, () => "floor" as const),
    },
    playerCell: cell,
    armedSmashTarget: undefined,
    entities: [
      {
        id: "player",
        kind: "player",
        archetype: "unknown",
        cell,
        footprint: [cell],
        hp: 100,
        maxHp: 100,
        phase: "alive",
      },
    ],
    reservations: [],
    telegraphs: [],
    seed: 1,
    lastEvents: [],
  };
}

describe("PixiGameRenderer position ownership", () => {
  it("keeps a reserved root at its visual origin and reconciles it on release", () => {
    const renderer = new PixiGameRenderer();
    const origin = { x: 1, y: 1 };
    const destination = { x: 2, y: 1 };
    renderer.sync(snapshot(origin));

    const view = renderer.getEntityView("player");
    if (!view) {
      throw new Error("Player view was not created.");
    }
    const originPixels = renderer.cellToPixels(origin);
    const destinationPixels = renderer.cellToPixels(destination);
    view.position.set(originPixels.x, originPixels.y);

    renderer.reservePosition("player");
    renderer.updateSnapshot(snapshot(destination));
    expect(view.position).toMatchObject(originPixels);

    renderer.releasePosition("player");
    expect(view.position).toMatchObject(destinationPixels);
    expect(renderer.positionOwnerCount).toBe(0);
  });
});
