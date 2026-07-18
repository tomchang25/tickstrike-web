import { describe, expect, it } from "vitest";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";

describe("canonical world occupancy", () => {
  it("indexes explicit footprints and owns the player cell", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "wide-enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
      hp: 10,
    });

    expect(world.playerCell).toEqual({ x: 2, y: 2 });
    expect(world.getOccupantAt({ x: 4, y: 2 })?.id).toBe("wide-enemy");
    expect(world.getOccupantAt({ x: 5, y: 2 })?.id).toBe("wide-enemy");
    expect(world.isWalkable({ x: 5, y: 2 })).toBe(false);
    expect(world.snapshot()).toMatchObject({ playerCell: { x: 2, y: 2 } });
  });

  it("rejects invalid spawns without changing entities or occupancy", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    const before = world.snapshot();

    expect(() =>
      world.spawn({
        id: "invalid",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 2 },
        footprint: [{ x: 4, y: 2 }, { x: 4, y: 2 }],
        hp: 10,
      }),
    ).toThrow("duplicate footprint");
    expect(() =>
      world.spawn({
        id: "water",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 4, y: 6 },
        hp: 10,
      }),
    ).toThrow("non-walkable");
    expect(() =>
      world.spawn({
        id: "player-copy",
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x: 2, y: 2 },
        hp: 10,
      }),
    ).toThrow("occupied");

    expect(world.snapshot()).toEqual(before);
  });

  it("rejects a colliding move atomically", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 5, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      footprint: [{ x: 2, y: 2 }, { x: 3, y: 2 }],
      hp: 10,
    });
    const before = world.requireEntity("enemy");

    expect(() => world.moveEntity("enemy", { x: 4, y: 2 })).toThrow("occupied");

    expect(world.requireEntity("enemy")).toEqual(before);
    expect(world.getOccupantAt({ x: 2, y: 2 })?.id).toBe("enemy");
    expect(world.getOccupantAt({ x: 3, y: 2 })?.id).toBe("enemy");
    expect(world.getOccupantAt({ x: 4, y: 2 })).toBeUndefined();
  });

  it("releases terminal occupancy while retaining the canonical record", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 10,
    });

    world.setPhase("enemy", "dead");

    expect(world.requireEntity("enemy").phase).toBe("dead");
    expect(world.getOccupantAt({ x: 2, y: 2 })).toBeUndefined();
    expect(world.findAliveAt({ x: 2, y: 2 })).toBeUndefined();
    expect(world.listActiveEntities().map((entity) => entity.id)).toEqual([]);
    expect(world.isWalkable({ x: 2, y: 2 })).toBe(true);

    world.spawn({
      id: "replacement",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 10,
    });
    expect(world.getOccupantAt({ x: 2, y: 2 })?.id).toBe("replacement");
    expect(world.listEntities().map((entity) => entity.id)).toEqual(["enemy", "replacement"]);
  });

  it("does not expose mutable canonical cells through snapshots", () => {
    const world = createTrainingArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 2, y: 2 },
      hp: 100,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
      hp: 10,
    });

    const snapshot = world.snapshot();
    const enemySnapshot = snapshot.entities.find((entity) => entity.id === "enemy");
    if (!enemySnapshot) throw new Error("Expected enemy snapshot.");
    (snapshot.playerCell as { x: number; y: number }).x = 9;
    (enemySnapshot.cell as { x: number; y: number }).x = 9;
    (enemySnapshot.footprint[0] as { x: number; y: number }).x = 9;

    expect(world.playerCell).toEqual({ x: 2, y: 2 });
    expect(world.requireEntity("enemy")).toMatchObject({
      cell: { x: 4, y: 2 },
      footprint: [{ x: 4, y: 2 }, { x: 5, y: 2 }],
    });
    expect(world.getOccupantAt({ x: 4, y: 2 })?.id).toBe("enemy");
  });
});
