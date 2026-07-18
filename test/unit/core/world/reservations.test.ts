import { describe, expect, it } from "vitest";
import { createShippedArena } from "../../../../src/harness/fixtures/shipped-arena";

describe("world reservations and telegraphs", () => {
  it("arbitrates active movement before attack intent atomically", () => {
    const world = createShippedArena();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 6, y: 6 }, hp: 10 });

    const movement = world.requestReservation({
      ownerId: "movement",
      purpose: "movement",
      activeStep: true,
      cells: [{ x: 5, y: 6 }],
    });
    const attack = world.requestReservation({
      ownerId: "attack",
      purpose: "attack",
      cells: [{ x: 5, y: 6 }, { x: 4, y: 6 }],
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
});
