import { describe, expect, it } from "vitest";
import { actorCatalog } from "@content/actor-catalog";
import { waveCatalog } from "@content/wave-catalog";
import { buildEnemySpawnInput, resolveEnemyActionDefinition } from "@content/wave-enemy-spawn";

const profile = waveCatalog.progressionProfile;

describe("resolveEnemyActionDefinition", () => {
  it("resolves a tile-shape enemy action with ranged tuning", () => {
    const ranged = actorCatalog.enemies.find((enemy) => enemy.id === "ranged_enemy")!;
    const action = resolveEnemyActionDefinition(ranged);
    expect(action.role).toBe("ranged");
    expect(action.rangedTuning).toBeDefined();
    expect(action.offsets.length).toBeGreaterThan(0);
  });

  it("resolves a charge-role enemy into chargeTuning with empty offsets", () => {
    const charge = actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy")!;
    const action = resolveEnemyActionDefinition(charge);
    expect(action.role).toBe("charge");
    expect(action.offsets).toEqual([]);
    expect(action.chargeTuning).toEqual({ maxRange: 5 });
  });
});

describe("buildEnemySpawnInput", () => {
  it("projects level-1 stats to the authored base with no growth", () => {
    const input = buildEnemySpawnInput({
      id: "wave-1-slot-0-t0-0",
      enemyId: "thrust_enemy",
      level: 1,
      waveNumber: 1,
      cell: { x: 3, y: 3 },
      profile,
    });

    expect(input.hp).toBe(100);
    expect(input.defense).toBe(0);
    expect(input.guardDefinition?.base).toBe(32);
    expect(input.enemyAction?.damage).toBeGreaterThan(0);
  });

  it("scales HP, damage, and defense upward with level", () => {
    const base = buildEnemySpawnInput({
      id: "a",
      enemyId: "thrust_enemy",
      level: 1,
      waveNumber: 1,
      cell: { x: 3, y: 3 },
      profile,
    });
    const leveled = buildEnemySpawnInput({
      id: "b",
      enemyId: "thrust_enemy",
      level: 12,
      waveNumber: 1,
      cell: { x: 3, y: 3 },
      profile,
    });

    expect(leveled.hp).toBeGreaterThan(base.hp);
    expect(leveled.enemyAction!.damage).toBeGreaterThan(base.enemyAction!.damage);
  });

  it("scales guard only from the base wave number, ignoring level offset", () => {
    const lowWave = buildEnemySpawnInput({
      id: "a",
      enemyId: "thrust_enemy",
      level: 40,
      waveNumber: 5,
      cell: { x: 3, y: 3 },
      profile,
    });
    const highWave = buildEnemySpawnInput({
      id: "b",
      enemyId: "thrust_enemy",
      level: 5,
      waveNumber: 30,
      cell: { x: 3, y: 3 },
      profile,
    });

    expect(lowWave.guardDefinition?.base).toBe(32);
    expect(highWave.guardDefinition?.base).toBeGreaterThan(32);
  });

  it("omits guardDefinition for a guardless enemy", () => {
    const input = buildEnemySpawnInput({
      id: "bomb-1",
      enemyId: "bomb_enemy",
      level: 1,
      waveNumber: 1,
      cell: { x: 3, y: 3 },
      profile,
    });

    expect(input.guardDefinition).toBeUndefined();
    expect(input.hp).toBe(50);
  });

  it("throws for an unknown enemy id", () => {
    expect(() =>
      buildEnemySpawnInput({
        id: "x",
        enemyId: "not-real",
        level: 1,
        waveNumber: 1,
        cell: { x: 0, y: 0 },
        profile,
      }),
    ).toThrow("Unknown wave enemy id");
  });
});
