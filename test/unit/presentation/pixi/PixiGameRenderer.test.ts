import { describe, expect, it } from "vitest";
import type { EntityState, Telegraph, WorldSnapshot } from "../../../../src/core/model/types";
import { PixiGameRenderer } from "../../../../src/presentation/pixi/PixiGameRenderer";

function snapshot(
  cell: { x: number; y: number },
  entities?: readonly EntityState[],
  telegraphs?: readonly Telegraph[],
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
    telegraphs: telegraphs ?? [],
    waveRuntime: undefined,
    runBuild: { stacks: {} },
    pendingReward: undefined,
    seed: 1,
    lastEvents: [],
  };
}

function attackingEnemy(warningTicks: number): EntityState {
  return {
    id: "enemy-attacker",
    kind: "enemy",
    archetype: "thrust",
    cell: { x: 2, y: 2 },
    footprint: [{ x: 2, y: 2 }],
    hp: 10,
    maxHp: 10,
    phase: "alive",
    activity: "telegraphing",
    committedAttack: {
      attackId: "thrust-attack",
      cells: [{ x: 1, y: 1 }],
      damage: 5,
      warningTicks,
      recoveryTicks: 1,
    },
  };
}

function labelTexts(container: { children: readonly unknown[] }): string[] {
  return container.children.flatMap((child) => {
    const withChildren = child as { children?: readonly { text?: unknown }[] };
    return (withChildren.children ?? [])
      .filter((grandchild) => typeof grandchild.text === "string")
      .map((grandchild) => String(grandchild.text));
  });
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

describe("PixiGameRenderer spawning telegraph projection", () => {
  it("renders a spawning telegraph's marker and countdown from remainingTicks", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(
      snapshot(cell, undefined, [
        { sourceId: "spawn:w1:s0", phase: "spawning", cells: [{ x: 2, y: 2 }], remainingTicks: 2 },
      ]),
    );

    expect(labelTexts(renderer.telegraphLabelLayer)).toEqual(["2"]);
    expect(renderer.telegraphLayer.children.length).toBe(1);
  });

  it("never falls back to a stray committedAttack lookup when remainingTicks is zero", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(
      snapshot(
        cell,
        [attackingEnemy(5)],
        [
          {
            sourceId: "enemy-attacker",
            phase: "spawning",
            cells: [{ x: 2, y: 2 }],
            remainingTicks: 0,
          },
        ],
      ),
    );

    expect(labelTexts(renderer.telegraphLabelLayer)).toEqual([]);
  });

  it("uses a distinct spawn color without disturbing attack warning markers", () => {
    const renderer = new PixiGameRenderer();
    const cell = { x: 0, y: 0 };
    renderer.sync(
      snapshot(
        cell,
        [attackingEnemy(3)],
        [
          {
            sourceId: "spawn:w1:s0",
            phase: "spawning",
            cells: [{ x: 2, y: 2 }],
            remainingTicks: 2,
          },
          { sourceId: "enemy-attacker", phase: "warning", cells: [{ x: 1, y: 1 }] },
        ],
      ),
    );

    const colors = renderer.telegraphLayer.children.map((child) => {
      const graphics = child as unknown as {
        context: { instructions: readonly { data: { style: { color: number } } }[] };
      };
      return graphics.context.instructions[0]?.data.style.color;
    });
    expect(colors).toContain(0x9a7cff);
    expect(colors).toContain(0xffd166);
    expect(labelTexts(renderer.telegraphLabelLayer).sort()).toEqual(["2", "3"]);
  });
});
