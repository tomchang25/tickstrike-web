import { describe, expect, it } from "vitest";
import type { EntityState, WorldSnapshot } from "../../../../src/core/model/types";
import { PixiGameRenderer } from "../../../../src/presentation/pixi/PixiGameRenderer";

function snapshot(
  cell: { x: number; y: number },
  entities?: readonly EntityState[],
): WorldSnapshot {
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
    entities: entities ?? [
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
    waveRuntime: undefined,
    seed: 1,
    lastEvents: [],
  };
}

function drowningEnemy(presentationId: string): EntityState {
  return {
    id: "enemy-water",
    kind: "enemy",
    archetype: "training-grunt",
    presentationId,
    cell: { x: 1, y: 1 },
    footprint: [{ x: 1, y: 1 }],
    hp: 100,
    maxHp: 100,
    phase: "drowning",
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

describe("PixiGameRenderer terminal view detachment", () => {
  it("hands a view to presentation without retaining it during a terminal-free projection", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));
    const view = renderer.getEntityView("enemy-water");
    expect(view).toBeDefined();

    const detached = renderer.detachEntityView("enemy-water");
    renderer.updateSnapshot(snapshot(cell, []));

    expect(detached?.root).toBe(view);
    expect(renderer.getEntityView("enemy-water")).toBeUndefined();
    expect(view?.destroyed).toBe(false);
    detached?.root.destroy({ children: true });
  });

  it("detaches an entity view only once", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));
    const view = renderer.getEntityView("enemy-water");

    expect(renderer.detachEntityView("enemy-water")?.root).toBe(view);
    expect(renderer.detachEntityView("enemy-water")).toBeUndefined();

    view?.destroy({ children: true });
  });

  it("does not own a detached view when the same id reappears in a later snapshot", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));
    const detached = renderer.detachEntityView("enemy-water");

    renderer.updateSnapshot(snapshot(cell, [drowningEnemy("enemy.ranged")]));

    expect(detached?.root.destroyed).toBe(false);
    expect(renderer.getEntityView("enemy-water")).toBeDefined();
    detached?.root.destroy({ children: true });
  });

  it("leaves detached view cleanup to presentation across a scenario sync", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));
    const detached = renderer.detachEntityView("enemy-water");

    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));

    expect(detached?.root.destroyed).toBe(false);
    expect(renderer.getEntityView("enemy-water")).toBeDefined();
    detached?.root.destroy({ children: true });
  });

  it("recreates the view when the same entity id reports a new presentationId", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(snapshot(cell, [drowningEnemy("enemy.ranged")]));
    const originalView = renderer.getEntityView("enemy-water");
    expect(originalView).toBeDefined();

    renderer.updateSnapshot(snapshot(cell, [drowningEnemy("enemy.bomb")]));
    const recreatedView = renderer.getEntityView("enemy-water");
    expect(recreatedView).toBeDefined();
    expect(recreatedView).not.toBe(originalView);
    expect(originalView?.destroyed).toBe(true);
  });
});
