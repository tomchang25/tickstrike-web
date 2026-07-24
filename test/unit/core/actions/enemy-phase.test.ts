import { describe, expect, it } from "vitest";
import { resolveEnemyPhase } from "@core/actions/enemy-phase";
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

describe("Commit-order detonation", () => {
  it("resolves telegraphing enemies in ascending commit-tick order, not entity order", () => {
    const world = phaseWorld();
    world.spawn({ id: "player", kind: "player", archetype: "player", cell: { x: 0, y: 0 }, hp: 100 });
    // "enemy-later" is spawned and committed first, so entity order alone would resolve it
    // first; its later commit tick must still make it resolve second.
    world.spawn({
      id: "enemy-later",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 5, y: 5 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.spawn({
      id: "enemy-earlier",
      kind: "enemy",
      archetype: "training-grunt",
      cell: { x: 6, y: 6 },
      hp: 50,
      enemyAction: thrust,
      facing: { x: 1, y: 0 },
    });
    world.commitEnemyAttack("enemy-later", {
      attackId: "thrust",
      cells: [{ x: 6, y: 5 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 2,
      commitTick: 5,
    });
    world.commitEnemyAttack("enemy-earlier", {
      attackId: "thrust",
      cells: [{ x: 7, y: 6 }],
      damage: 5,
      warningTicks: 1,
      recoveryTicks: 2,
      commitTick: 1,
    });

    const events = resolveEnemyPhase(world);

    expect(detonationOrder(events)).toEqual(["enemy-earlier", "enemy-later"]);
  });

  it("falls back to stable entity order when an attack carries no commit-tick stamp", () => {
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
    // Neither commit carries `commitTick` (as with harness/test-injected attacks); both sort
    // as earliest and the original entity order must win the tie.
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
      warningTicks: 5,
      recoveryTicks: 3,
    });

    resolveEnemyPhase(world);

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
