import { describe, expect, it } from "vitest";
import { resolveEnemyPhase, resolveEnemyPhaseSlots } from "@core/actions/enemy-phase";
import type { CombatEvent } from "@core/events/combat-events";
import type { EnemyActionDefinition } from "@core/model/types";
import { World } from "@core/world/world";

const thrust: EnemyActionDefinition = {
  role: "thrust",
  attackId: "thrust",
  kind: "tile",
  damage: 5,
  warningTicks: 2,
  recoveryTicks: 2,
  offsets: [{ x: 1, y: 0 }],
};

function phaseWorld(): World {
  return new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    "enemy-phase-order-test",
  );
}

function detonationOrder(events: readonly CombatEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<CombatEvent, { type: "enemy_attack_detonated" }> =>
        event.type === "enemy_attack_detonated",
    )
    .map((event) => event.enemyId);
}

describe("Slot-order detonation", () => {
  it("exposes one grouped result per enabled enemy while preserving flattening", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 0, y: 0 }, hp: 100 });
    for (const [id, x] of [
      ["enemy-first", 5],
      ["enemy-second", 7],
    ] as const) {
      world.spawn({
        id,
        kind: "enemy",
        archetype: "training-grunt",
        cell: { x, y: 5 },
        hp: 50,
        enemyAction: thrust,
        facing: { x: 1, y: 0 },
      });
    }

    const slots = resolveEnemyPhaseSlots(world);

    expect(slots.map((slot) => slot.actorId)).toEqual(["enemy-first", "enemy-second"]);
    expect(slots.every((slot) => slot.postSlotState?.id === slot.actorId)).toBe(true);
    expect(slots.flatMap((slot) => slot.events).map((event) => event.type)).toEqual(["enemy_moved", "enemy_moved"]);
  });

  it("resolves telegraphing enemies in stable entity order", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 0, y: 0 }, hp: 100 });
    world.spawn({
      id: "enemy-first",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 5 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.spawn({
      id: "enemy-second",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 6 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.commitEnemyAttack("enemy-first", {
      attackId: "thrust",
      cells: [{ x: 6, y: 5 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 2,
    });
    world.commitEnemyAttack("enemy-second", {
      attackId: "thrust",
      cells: [{ x: 7, y: 6 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 2,
    });

    const events = resolveEnemyPhase(world);

    expect(detonationOrder(events)).toEqual(["enemy-first", "enemy-second"]);
  });

  it("groups a ready enemy's movement before the next slot's detonation", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    world.spawn({
      id: "enemy-first",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 2, y: 2 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.spawn({
      id: "enemy-second",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 9, y: 9 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.commitEnemyAttack("enemy-second", {
      attackId: "thrust",
      cells: [{ x: 10, y: 9 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 2,
    });

    const events = resolveEnemyPhase(world);

    expect(events.map((event) => event.type)).toEqual([
      "enemy_moved",
      "enemy_attack_detonated",
      "telegraph_changed",
      "enemy_recovering",
    ]);
    expect(events[0]).toMatchObject({ type: "enemy_moved", enemyId: "enemy-first" });
    expect(events[1]).toMatchObject({ type: "enemy_attack_detonated", enemyId: "enemy-second" });
  });
});

const charge: EnemyActionDefinition = {
  role: "charge",
  attackId: "charge",
  kind: "charge",
  damage: 8,
  warningTicks: 2,
  recoveryTicks: 2,
  offsets: [],
  chargeTuning: { maxRange: 5 },
};

/**
 * Authored recovery of 3, deliberately different from the charger's 2, so the assertions below
 * read as "the victim's own authored duration" rather than coinciding with the charger's.
 */
const victimAction: EnemyActionDefinition = { ...thrust, recoveryTicks: 3 };

/** Charger at (8,5) facing left, its path sweeping the victim at (7,5) and detonating this phase. */
function pushVictimWorld(seed: string): World {
  const world = new World(
    12,
    12,
    Array.from({ length: 144 }, () => "floor" as const),
    seed,
  );
  world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
  world.spawn({
    id: "enemy-charge",
    kind: "enemy",
    archetype: "charge",
    cell: { x: 8, y: 5 },
    hp: 150,
    enemyAction: charge,
    facing: { x: -1, y: 0 },
  });
  world.spawn({
    id: "victim",
    kind: "enemy",
    archetype: "training-grunt",
    cell: { x: 7, y: 5 },
    hp: 100,
    enemyAction: victimAction,
    facing: { x: 1, y: 0 },
  });
  world.commitEnemyAttack("enemy-charge", {
    attackId: "charge",
    role: "charge",
    cells: [
      { x: 7, y: 5 },
      { x: 6, y: 5 },
      { x: 5, y: 5 },
    ],
    damage: 8,
    warningTicks: 1,
    recoveryTicks: 2,
  });
  return world;
}

/**
 * Pins the accepted `recoveringAtStart` asymmetry: a telegraphing victim keeps its full
 * authored recovery, while a victim already recovering when it was pushed is in the phase's
 * pre-detonation snapshot and therefore serves one tick less. Documented in the spec's
 * `recoveringAtStart` note; this locks the numbers so the difference cannot drift unnoticed.
 */
describe("Charge push interrupt and the recoveringAtStart snapshot", () => {
  it("gives a telegraphing victim its full authored recovery", () => {
    const world = pushVictimWorld("interrupt-telegraphing");
    world.commitEnemyAttack("victim", {
      attackId: "thrust",
      cells: [{ x: 8, y: 5 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 3,
    });

    const events = resolveEnemyPhase(world);

    expect(detonationOrder(events)).toEqual(["enemy-charge"]);
    expect(world.requireEntity("victim")).toMatchObject({
      cell: { x: 7, y: 4 },
      activity: "recovering",
      recoveryTicks: 3,
      committedAttack: undefined,
    });
  });

  it("leaves an already-recovering victim one tick short, because the phase still decrements it", () => {
    const world = pushVictimWorld("interrupt-already-recovering");
    world.combat.setEnemyActivity("victim", "recovering", 1);

    resolveEnemyPhase(world);

    // Refreshed to the authored 3 by the interrupt, then decremented once by the recovery pass
    // this same phase — the victim was already in `recoveringAtStart`.
    expect(world.requireEntity("victim")).toMatchObject({
      cell: { x: 7, y: 4 },
      activity: "recovering",
      recoveryTicks: 2,
    });
  });
});

describe("Live slot state", () => {
  it("moves the earlier slot first and makes a contested later mover take another candidate", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    world.spawn({
      id: "enemy-first",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 4, y: 2 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 0, y: 1 },
    });
    world.spawn({
      id: "enemy-second",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 2 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 0, y: 1 },
    });

    const events = resolveEnemyPhase(world);

    expect(events).toEqual([
      {
        type: "enemy_moved",
        enemyId: "enemy-first",
        from: { x: 4, y: 2 },
        to: { x: 5, y: 2 },
      },
      {
        type: "enemy_moved",
        enemyId: "enemy-second",
        from: { x: 6, y: 2 },
        to: { x: 6, y: 3 },
      },
    ]);
  });

  it("lets a later charge resolve against an earlier mover's live position", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    world.spawn({
      id: "enemy-mover",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 1 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 0, y: 1 },
    });
    world.spawn({
      id: "enemy-charge",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 8, y: 2 },
      hp: 150,
      enemyAction: charge,
      facing: { x: -1, y: 0 },
    });
    world.commitEnemyAttack("enemy-charge", {
      attackId: "charge",
      role: "charge",
      cells: [
        { x: 7, y: 2 },
        { x: 6, y: 2 },
        { x: 5, y: 2 },
      ],
      damage: 8,
      warningTicks: 1,
      recoveryTicks: 2,
    });

    const events = resolveEnemyPhase(world);

    expect(events.findIndex((event) => event.type === "enemy_moved")).toBeLessThan(
      events.findIndex((event) => event.type === "enemy_attack_detonated"),
    );
    expect(world.requireEntity("enemy-mover")).toMatchObject({
      cell: { x: 5, y: 1 },
      activity: "recovering",
      recoveryTicks: 2,
    });
  });

  it("frees an interrupted earlier commitment for a later deciding slot", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 5, y: 5 }, hp: 100 });
    world.spawn({
      id: "enemy-claimant",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 5, y: 0 },
      hp: 150,
      enemyAction: charge,
      facing: { x: 0, y: 1 },
    });
    world.spawn({
      id: "enemy-interrupter",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 8, y: 0 },
      hp: 150,
      enemyAction: charge,
      facing: { x: -1, y: 0 },
    });
    world.spawn({
      id: "enemy-later",
      kind: "enemy",
      archetype: "charge",
      cell: { x: 0, y: 5 },
      hp: 150,
      enemyAction: charge,
      facing: { x: 1, y: 0 },
    });
    world.commitEnemyAttack("enemy-interrupter", {
      attackId: "charge",
      role: "charge",
      cells: [
        { x: 7, y: 0 },
        { x: 6, y: 0 },
        { x: 5, y: 0 },
      ],
      damage: 8,
      warningTicks: 1,
      recoveryTicks: 2,
    });

    const events = resolveEnemyPhase(world);

    expect(world.requireEntity("enemy-claimant")).toMatchObject({
      activity: "recovering",
      committedAttack: undefined,
    });
    expect(world.requireEntity("enemy-later").committedAttack?.cells.at(-1)).toEqual({ x: 5, y: 5 });
    expect(events.filter((event) => event.type === "enemy_attack_committed").map((event) => event.enemyId)).toEqual([
      "enemy-claimant",
      "enemy-later",
    ]);
  });
});
