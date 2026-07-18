import { describe, expect, it } from "vitest";
import { calculateDirectionalHit, classifyHitAngle } from "../../../../src/core/combat/directional-hit";
import { previewAttack } from "../../../../src/core/actions/action-preview";
import { resolveCommand } from "../../../../src/core/actions/action-resolver";
import { actorCatalog } from "../../../../src/content/actor-catalog";
import { createFoundationArena } from "../../../../src/harness/fixtures/shipped-arena";
import { createTrainingArena } from "../../../../src/harness/fixtures/training-arena";
import type { EntityState } from "../../../../src/core/model/types";

function targetAt(cell: { x: number; y: number }, facing: { x: number; y: number }): EntityState {
  const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
  if (!guard) throw new Error("Small Guard content is incomplete.");
  return {
    id: "enemy",
    kind: "enemy",
    archetype: "thrust",
    cell,
    footprint: [cell],
    hp: 100,
    maxHp: 100,
    defense: 0,
    guard: {
      id: guard.id,
      current: guard.base,
      max: guard.base,
      staggerDuration: guard.stagger,
      protectionDuration: guard.protection,
      protectionMultiplier: guard.protectionMultiplier,
    },
    activity: "ready",
    facing,
    phase: "alive",
  };
}

describe("directional Guard hit resolution", () => {
  it("classifies front, side, and back from target facing", () => {
    expect(classifyHitAngle({ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 1, y: 0 })).toBe("front");
    expect(classifyHitAngle({ x: 4, y: 5 }, { x: 4, y: 4 }, { x: 1, y: 0 })).toBe("side");
    expect(classifyHitAngle({ x: 3, y: 4 }, { x: 4, y: 4 }, { x: 1, y: 0 })).toBe("back");
    expect(classifyHitAngle({ x: 4, y: 4 }, { x: 4, y: 4 }, { x: 1, y: 0 })).toBeUndefined();
    expect(classifyHitAngle({ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 0, y: 0 })).toBeUndefined();
  });

  it("applies directional Guard damage and uses the guarded HP path before Defense", () => {
    const target = { ...targetAt({ x: 4, y: 4 }, { x: 1, y: 0 }), defense: 4 };

    const front = calculateDirectionalHit({
      attackerId: "player",
      attackerCell: { x: 5, y: 4 },
      target,
      damage: 20,
    });
    const side = calculateDirectionalHit({
      attackerId: "player",
      attackerCell: { x: 4, y: 5 },
      target,
      damage: 20,
    });
    const back = calculateDirectionalHit({
      attackerId: "player",
      attackerCell: { x: 3, y: 4 },
      target,
      damage: 20,
    });

    expect(front).toMatchObject({ angle: "front", guardDamage: 4, guardAfter: 28, hpDamage: 4, damage: 2 });
    expect(side).toMatchObject({ angle: "side", guardDamage: 16, guardAfter: 16, hpDamage: 4, damage: 2 });
    expect(back).toMatchObject({
      angle: "back",
      guardDamage: 32,
      guardAfter: 0,
      guardBroken: true,
      staggerBurst: true,
      hpDamage: 20,
      damage: 16.666666666666668,
      feedback: "guard_break",
    });
  });

  it("halves ordinary Guard damage during Protection without preventing a later break", () => {
    const target = { ...targetAt({ x: 4, y: 4 }, { x: 1, y: 0 }), protectionTicks: 5 };
    const hit = calculateDirectionalHit({
      attackerId: "player",
      attackerCell: { x: 3, y: 4 },
      target,
      damage: 20,
    });

    expect(hit).toMatchObject({ guardDamage: 16, guardAfter: 16, guardBroken: false, damage: 4 });
  });

  it("keeps preview and commit on the same directional result", () => {
    const world = createFoundationArena();
    const preview = previewAttack(world, "player", { x: -1, y: 0 });
    if (!preview.hit || !("angle" in preview.hit)) throw new Error("Expected a directional preview hit.");

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.events.find((event) => event.type === "directional_hit")).toMatchObject({ hit: preview.hit });
    expect(world.requireEntity("enemy-thrust")).toMatchObject({
      hp: 96,
      guard: { current: 28, max: 32 },
    });
  });
});

describe("Guard break status lifecycle", () => {
  it("cancels an attack, blocks three status ticks, then restores Guard into Protection", () => {
    const world = createTrainingArena();
    const player = actorCatalog.characters.find((candidate) => candidate.id === "ninja");
    const enemy = actorCatalog.enemies.find((candidate) => candidate.id === "thrust_enemy");
    const guard = actorCatalog.guards.find((candidate) => candidate.id === "small");
    const attack = actorCatalog.attacks.find((candidate) => candidate.id === "thrust");
    if (!player || !enemy || !guard || !attack || attack.shape.shape !== "custom-offsets") {
      throw new Error("Shipped combat content is incomplete.");
    }
    world.spawn({
      id: "player",
      kind: "player",
      archetype: "training-player",
      cell: { x: 5, y: 3 },
      hp: player.hp,
      normalAttackDamage: player.normalAttack.damage,
    });
    world.spawn({
      id: "enemy",
      kind: "enemy",
      archetype: enemy.id,
      cell: { x: 4, y: 3 },
      hp: enemy.hp,
      defense: enemy.defense,
      guardDefinition: guard,
      enemyAction: {
        role: "thrust",
        attackId: attack.id,
        damage: attack.damage,
        warningTicks: attack.warningTicks,
        recoveryTicks: attack.recoveryTicks,
        offsets: attack.shape.offsets,
      },
      facing: { x: -1, y: 0 },
    });
    world.commitEnemyAttack("enemy", {
      attackId: attack.id,
      cells: [{ x: 3, y: 3 }],
      damage: attack.damage,
      warningTicks: attack.warningTicks,
      recoveryTicks: attack.recoveryTicks,
    });
    world.reserve({ ownerId: "enemy", purpose: "attack", cells: [{ x: 3, y: 3 }] });

    const result = resolveCommand(world, {
      type: "attack",
      actorId: "player",
      direction: { x: -1, y: 0 },
    });

    expect(result.events.map((event) => event.type)).toContain("enemy_attack_interrupted");
    expect(world.requireEntity("enemy")).toMatchObject({
      hp: 80,
      activity: "staggered",
      staggerTicks: 2,
      guard: { current: 0, max: 32 },
    });
    expect(world.getTelegraph("enemy")).toBeUndefined();
    expect(world.getReservation("enemy")).toBeUndefined();

    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });
    expect(world.requireEntity("enemy").staggerTicks).toBe(1);
    resolveCommand(world, { type: "move", actorId: "player", direction: { x: 0, y: 1 } });
    expect(world.requireEntity("enemy")).toMatchObject({
      activity: "ready",
      guard: { current: 32, max: 32 },
      protectionTicks: 5,
    });
  });
});
