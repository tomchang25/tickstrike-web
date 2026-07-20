import { describe, expect, it } from "vitest";
import type { EnemyDefinition, GuardDefinition } from "@core/content/actor-schema";
import type { WaveProgressionProfile } from "@core/content/wave-schema";
import { projectEnemyLevel, projectGuardValue } from "@core/waves/enemy-level-progression";

const enemy: EnemyDefinition = {
  id: "thrust_enemy",
  name: "Thrust Enemy",
  role: "thrust",
  speed: 1,
  hp: 100,
  defense: 10,
  guardId: "small_guard",
  attackIds: ["thrust_attack"],
  roleTuning: null,
  presentation: { id: "presentation.thrust-enemy" },
  audio: { id: "audio.thrust-enemy" },
};

const guard: GuardDefinition = {
  id: "small_guard",
  name: "Small Guard",
  base: 32,
  lethalTierGain: 8,
  stagger: 3,
  protection: 5,
  protectionMultiplier: 0.5,
};

const profile: WaveProgressionProfile = {
  lethalLevelStart: 10,
  hpCurve: {
    standardCoefficient: 0.1,
    standardExponent: 1,
    lethalCoefficient: 0.5,
    lethalExponent: 1,
  },
  damageCurve: {
    standardCoefficient: 0.05,
    standardExponent: 1,
    lethalCoefficient: 0.2,
    lethalExponent: 1,
  },
  defenseCurve: {
    standardCoefficient: 1,
    standardExponent: 1,
    lethalCoefficient: 2,
    lethalExponent: 1,
  },
  guardGrowth: { basis: "base-wave", standardWaveLimit: 20, lethalTierCadence: 5 },
};

describe("projectEnemyLevel", () => {
  it("reproduces the authored Level 1 base exactly", () => {
    const projection = projectEnemyLevel(enemy, guard, 1, 1, profile);
    expect(projection).toEqual({
      level: 1,
      maxHp: 100,
      damageMultiplier: 1,
      defense: 10,
      maxGuard: 32,
    });
  });

  it("applies only the standard term below the lethal start", () => {
    const projection = projectEnemyLevel(enemy, guard, 5, 1, profile);
    // standard growth = coefficient * (level - 1); lethal term is zero below level 10.
    expect(projection.maxHp).toBeCloseTo(100 * (1 + 0.1 * 4));
    expect(projection.damageMultiplier).toBeCloseTo(1 + 0.05 * 4);
    expect(projection.defense).toBeCloseTo(10 + 1 * 4);
  });

  it("adds the lethal term once level passes the lethal start", () => {
    const projection = projectEnemyLevel(enemy, guard, 12, 1, profile);
    const hpGrowth = 0.1 * 11 + 0.5 * 3;
    const damageGrowth = 0.05 * 11 + 0.2 * 3;
    const defenseGrowth = 1 * 11 + 2 * 3;
    expect(projection.maxHp).toBeCloseTo(100 * (1 + hpGrowth));
    expect(projection.damageMultiplier).toBeCloseTo(1 + damageGrowth);
    expect(projection.defense).toBeCloseTo(10 + defenseGrowth);
  });

  it("reports zero max guard for a guardless enemy", () => {
    const projection = projectEnemyLevel(enemy, null, 1, 1, profile);
    expect(projection.maxGuard).toBe(0);
  });

  it("keeps level offset out of the guard calculation", () => {
    const atOffset = projectEnemyLevel(enemy, guard, 40, 1, profile);
    const atBase = projectEnemyLevel(enemy, guard, 1, 1, profile);
    expect(atOffset.maxGuard).toBe(atBase.maxGuard);
  });
});

describe("projectGuardValue", () => {
  const guardGrowth = profile.guardGrowth;

  it("stays at base through the standard wave limit", () => {
    expect(projectGuardValue(guard, 1, guardGrowth)).toBe(32);
    expect(projectGuardValue(guard, 20, guardGrowth)).toBe(32);
  });

  it("adds the first lethal tier exactly one wave past the limit", () => {
    expect(projectGuardValue(guard, 21, guardGrowth)).toBe(40);
    expect(projectGuardValue(guard, 25, guardGrowth)).toBe(40);
  });

  it("adds a second lethal tier once a full cadence passes", () => {
    expect(projectGuardValue(guard, 26, guardGrowth)).toBe(48);
  });
});
