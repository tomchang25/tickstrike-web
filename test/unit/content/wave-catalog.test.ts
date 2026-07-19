import { describe, expect, it } from "vitest";
import { waveCatalog } from "../../../src/content/wave-catalog";

describe("canonical wave content", () => {
  it("contains the complete shipped wave inventory", () => {
    expect(waveCatalog.groups.map((group) => group.id)).toEqual([
      "small",
      "small-ranged",
      "small-ranged-charge",
      "ranged",
      "charge",
      "bomb",
    ]);
    expect(waveCatalog.demoWaves.map((wave) => wave.id)).toEqual([
      "demo-01",
      "demo-02",
      "demo-03",
      "demo-04",
      "demo-05",
      "demo-06",
      "demo-07",
      "demo-08",
      "demo-09",
    ]);
    expect(waveCatalog.endlessTemplate.id).toBe("endless");
  });

  it("records group composition, placement, and authored entry order", () => {
    expect(
      waveCatalog.groups.map(({ id, compositionMode, placementStrategy }) => ({
        id,
        compositionMode,
        placementStrategy,
      })),
    ).toEqual([
      { id: "small", compositionMode: "weighted", placementStrategy: "player-ring" },
      { id: "small-ranged", compositionMode: "fixed", placementStrategy: "anchor-cluster" },
      { id: "small-ranged-charge", compositionMode: "fixed", placementStrategy: "anchor-cluster" },
      { id: "ranged", compositionMode: "fixed", placementStrategy: "anchor-cluster" },
      { id: "charge", compositionMode: "fixed", placementStrategy: "scatter" },
      { id: "bomb", compositionMode: "fixed", placementStrategy: "scatter" },
    ]);
    expect(waveCatalog.groups[0]!.entries).toEqual([
      { enemyId: "thrust_enemy", weight: 1 },
      { enemyId: "slash_enemy", weight: 1 },
    ]);
    expect(waveCatalog.groups[2]!.entries).toEqual([
      { enemyId: "thrust_enemy", count: 2 },
      { enemyId: "slash_enemy", count: 1 },
      { enemyId: "ranged_enemy", count: 1 },
      { enemyId: "charge_enemy", count: 1 },
    ]);
  });

  it("preserves wave caps and slot order", () => {
    expect(
      waveCatalog.demoWaves.map((wave) => ({
        id: wave.id,
        cap: wave.populationCap,
        groups: wave.slots.map((slot) => slot.spawnGroupId),
      })),
    ).toEqual([
      { id: "demo-01", cap: 3, groups: ["small"] },
      { id: "demo-02", cap: 2, groups: ["ranged"] },
      { id: "demo-03", cap: 5, groups: ["small-ranged"] },
      { id: "demo-04", cap: 2, groups: ["charge"] },
      { id: "demo-05", cap: 5, groups: ["small-ranged-charge"] },
      { id: "demo-06", cap: 6, groups: ["small", "ranged", "charge"] },
      { id: "demo-07", cap: 7, groups: ["ranged", "small", "charge"] },
      { id: "demo-08", cap: 8, groups: ["small", "ranged", "charge", "bomb"] },
      { id: "demo-09", cap: 9, groups: ["charge", "ranged", "small", "bomb"] },
    ]);
    expect(waveCatalog.demoWaves[8]!.slots[0]).toEqual({
      spawnGroupId: "charge",
      startCondition: "immediate-overlap",
      survivorThreshold: 0,
      warningTicks: 1,
      levelOffset: 0,
      isBoss: false,
    });
    expect(waveCatalog.endlessTemplate.slots.map((slot) => slot.spawnGroupId)).toEqual([
      "charge",
      "ranged",
      "small",
      "bomb",
    ]);
  });

  it("records progression inputs without projecting runtime stats", () => {
    expect(waveCatalog.progressionProfile).toEqual({
      lethalLevelStart: 10,
      hpCurve: {
        standardCoefficient: 0.08,
        standardExponent: 1,
        lethalCoefficient: 0.15,
        lethalExponent: 1.2,
      },
      damageCurve: {
        standardCoefficient: 0.05,
        standardExponent: 1,
        lethalCoefficient: 0.1,
        lethalExponent: 1.1,
      },
      defenseCurve: {
        standardCoefficient: 0.6,
        standardExponent: 1,
        lethalCoefficient: 1.2,
        lethalExponent: 1,
      },
      guardGrowth: { basis: "base-wave", standardWaveLimit: 20, lethalTierCadence: 5 },
    });
  });
});
