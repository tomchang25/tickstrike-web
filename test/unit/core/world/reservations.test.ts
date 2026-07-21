import { describe, expect, it } from "vitest";
import { createShippedArena } from "@harness/fixtures/shipped-arena";

describe("world reservations and telegraphs", () => {
  it("arbitrates active movement before attack intent atomically", () => {
    const world = createShippedArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 6, y: 6 },
      hp: 10,
    });

    const movement = world.requestReservation({
      ownerId: "movement",
      purpose: "movement",
      activeStep: true,
      cells: [{ x: 5, y: 6 }],
    });
    const attack = world.requestReservation({
      ownerId: "attack",
      purpose: "attack",
      cells: [
        { x: 5, y: 6 },
        { x: 4, y: 6 },
      ],
    });

    expect(movement.granted).toBe(true);
    expect(attack.granted).toBe(false);
    expect(world.listReservations().map((reservation) => reservation.ownerId)).toEqual(["movement"]);
  });

  it("replaces claims and keeps overlapping telegraph sources independent", () => {
    const world = createShippedArena();
    world.requestReservation({ ownerId: "actor", purpose: "movement", cells: [{ x: 2, y: 2 }] });
    world.requestReservation({ ownerId: "actor", purpose: "movement", cells: [{ x: 3, y: 2 }] });
    world.setTelegraph({ sourceId: "one", phase: "warning", cells: [{ x: 4, y: 4 }] });
    world.setTelegraph({ sourceId: "two", phase: "active", cells: [{ x: 4, y: 4 }] });

    expect(world.isReserved({ x: 2, y: 2 })).toBe(false);
    expect(world.isReserved({ x: 3, y: 2 })).toBe(true);
    expect(world.getTelegraphsAt({ x: 4, y: 4 })).toHaveLength(2);
    world.clearTelegraph("one");
    expect(world.getTelegraphsAt({ x: 4, y: 4 }).map((telegraph) => telegraph.sourceId)).toEqual(["two"]);
  });

  it("releases terminal occupancy and owned semantic state immediately", () => {
    const world = createShippedArena();
    world.spawn({ id: "enemy", kind: "enemy", archetype: "enemy", cell: { x: 3, y: 3 }, hp: 10 });
    world.requestReservation({ ownerId: "enemy", purpose: "attack", cells: [{ x: 4, y: 3 }] });
    world.setTelegraph({ sourceId: "enemy", phase: "warning", cells: [{ x: 4, y: 3 }] });

    world.setPhase("enemy", "dead");

    expect(world.isWalkable({ x: 3, y: 3 })).toBe(true);
    expect(world.getReservation("enemy")).toBeUndefined();
    expect(world.getTelegraph("enemy")).toBeUndefined();
  });

  it("arbitrates contested movement atomically and releases claims after application", () => {
    const world = createShippedArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 3, y: 6 },
      hp: 10,
    });
    world.spawn({ id: "enemy-a", kind: "enemy", archetype: "enemy", cell: { x: 2, y: 2 }, hp: 10 });
    world.spawn({ id: "enemy-b", kind: "enemy", archetype: "enemy", cell: { x: 4, y: 2 }, hp: 10 });

    const decisions = world.requestMovementReservations([
      { ownerId: "enemy-a", purpose: "movement", activeStep: true, cells: [{ x: 3, y: 2 }] },
      { ownerId: "enemy-b", purpose: "movement", activeStep: true, cells: [{ x: 3, y: 2 }] },
    ]);

    expect(decisions.map((decision) => decision.granted)).toEqual([true, false]);
    expect(world.listReservations().map((reservation) => reservation.ownerId)).toEqual(["enemy-a"]);

    world.moveEntity("enemy-a", { x: 3, y: 2 });
    world.releaseReservation("enemy-a");

    expect(world.requireEntity("enemy-a").cell).toEqual({ x: 3, y: 2 });
    expect(world.requireEntity("enemy-b").cell).toEqual({ x: 4, y: 2 });
    expect(world.getOccupantAt({ x: 3, y: 2 })?.id).toBe("enemy-a");
    expect(world.listReservations()).toEqual([]);
  });

  it("rejects a movement batch without leaving a partial claim", () => {
    const world = createShippedArena();

    const decisions = world.requestMovementReservations([
      { ownerId: "first", purpose: "movement", activeStep: true, cells: [{ x: 2, y: 2 }] },
      { ownerId: "second", purpose: "movement", activeStep: true, cells: [] },
    ]);

    expect(decisions.every((decision) => !decision.accepted)).toBe(true);
    expect(world.listReservations()).toEqual([]);
  });

  it("blocks movement into a held spawn reservation and is not displaced by a movement claim", () => {
    const world = createShippedArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 6, y: 6 },
      hp: 10,
    });

    const spawnClaim = world.requestReservation({
      ownerId: "spawn:1",
      purpose: "spawn",
      cells: [{ x: 3, y: 3 }],
    });
    expect(spawnClaim.granted).toBe(true);
    expect(world.isWalkable({ x: 3, y: 3 })).toBe(false);

    const decisions = world.requestMovementReservations([
      { ownerId: "enemy", purpose: "movement", activeStep: true, cells: [{ x: 3, y: 3 }] },
    ]);

    expect(decisions[0]).toMatchObject({ accepted: true, granted: false });
    expect(world.getReservation("spawn:1")).toBeDefined();
    expect(world.getReservation("enemy")).toBeUndefined();
    expect(world.isWalkable({ x: 3, y: 3 })).toBe(false);
  });

  it("allows a losing movement intent to retry a different candidate", () => {
    const world = createShippedArena();
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "player",
      cell: { x: 6, y: 6 },
      hp: 10,
    });
    world.spawn({ id: "enemy-a", kind: "enemy", archetype: "enemy", cell: { x: 2, y: 2 }, hp: 10 });
    world.spawn({ id: "enemy-b", kind: "enemy", archetype: "enemy", cell: { x: 4, y: 2 }, hp: 10 });

    const firstRound = world.requestMovementReservations([
      { ownerId: "enemy-a", purpose: "movement", activeStep: true, cells: [{ x: 3, y: 2 }] },
      { ownerId: "enemy-b", purpose: "movement", activeStep: true, cells: [{ x: 3, y: 2 }] },
    ]);
    expect(firstRound.map((decision) => decision.granted)).toEqual([false, true]);

    world.moveEntity("enemy-b", { x: 3, y: 2 });
    world.releaseReservation("enemy-b");
    const retry = world.requestMovementReservations([
      { ownerId: "enemy-a", purpose: "movement", activeStep: true, cells: [{ x: 2, y: 3 }] },
    ]);

    expect(retry[0]).toMatchObject({ accepted: true, granted: true });
    world.moveEntity("enemy-a", { x: 2, y: 3 });
    world.releaseReservation("enemy-a");
    expect(world.requireEntity("enemy-a").cell).toEqual({ x: 2, y: 3 });
    expect(world.listReservations()).toEqual([]);
  });
});
