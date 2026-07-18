import { describe, expect, it } from "vitest";
import {
  WaveContentValidationError,
  createWaveContentCatalog,
  validateWaveContent,
  type WaveContentInput,
} from "../../../../src/core/content/wave-content";
import { actorContent } from "../../../../src/content/actor-content";

const validContent: WaveContentInput = {
  groups: [
    {
      id: "small",
      placementStrategy: "player-ring",
      compositionMode: "weighted",
      weightedTotalCount: 2,
      entries: [
        { enemyId: "thrust_enemy", weight: 1 },
        { enemyId: "slash_enemy", weight: 1 },
      ],
    },
  ],
  demoWaves: [
    {
      id: "demo-01",
      populationCap: 2,
      slots: [
        {
          spawnGroupId: "small",
          startCondition: "immediate-overlap",
          survivorThreshold: 0,
          warningTicks: 1,
          levelOffset: 0,
          isBoss: false,
        },
      ],
    },
  ],
  endlessTemplate: {
    id: "endless",
    populationCap: 2,
    slots: [
      {
        spawnGroupId: "small",
        startCondition: "immediate-overlap",
        survivorThreshold: 0,
        warningTicks: 1,
        levelOffset: 0,
        isBoss: false,
      },
    ],
  },
  progressionProfile: {
    lethalLevelStart: 10,
    hpCurve: { standardCoefficient: 0.08, standardExponent: 1, lethalCoefficient: 0.15, lethalExponent: 1.2 },
    damageCurve: { standardCoefficient: 0.05, standardExponent: 1, lethalCoefficient: 0.1, lethalExponent: 1.1 },
    defenseCurve: { standardCoefficient: 0.6, standardExponent: 1, lethalCoefficient: 1.2, lethalExponent: 1 },
    guardGrowth: { basis: "base-wave", standardWaveLimit: 20, lethalTierCadence: 5 },
  },
};

describe("wave content validation", () => {
  it("returns deterministic diagnostics without normalizing authored input", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const groups = malformed.groups as Array<Record<string, unknown>>;
    groups[0]!.compositionMode = "random";
    groups[0]!.entries = [{ enemyId: "missing_enemy", weight: 0 }];
    const waves = malformed.demoWaves as Array<Record<string, unknown>>;
    waves[0]!.populationCap = 1.5;
    const slots = waves[0]!.slots as Array<Record<string, unknown>>;
    slots[0]!.spawnGroupId = "missing_group";
    slots[0]!.startCondition = "unknown";

    const diagnostics = validateWaveContent(malformed, actorContent);

    expect(diagnostics.map(({ code, path }) => `${code}:${path}`)).toEqual([
      "invalid-enum:groups[0].compositionMode",
      "invalid-positive-integer:demoWaves[0].populationCap",
      "unknown-reference:demoWaves[0].slots[0].spawnGroupId",
      "invalid-enum:demoWaves[0].slots[0].startCondition",
    ]);
    expect(groups[0]!.compositionMode).toBe("random");
  });

  it("rejects fixed zero counts, weighted zero totals, bad curves, and cap overflow", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const groups = malformed.groups as Array<Record<string, unknown>>;
    groups[0]!.compositionMode = "fixed";
    groups[0]!.weightedTotalCount = 0;
    groups[0]!.entries = [{ enemyId: "thrust_enemy", count: 3 }];
    const waves = malformed.demoWaves as Array<Record<string, unknown>>;
    waves[0]!.populationCap = 2;
    const profile = malformed.progressionProfile as Record<string, unknown>;
    profile.hpCurve = {
      standardCoefficient: -1,
      standardExponent: 0,
      lethalCoefficient: 0,
      lethalExponent: Number.NaN,
    };

    expect(() => createWaveContentCatalog(malformed as unknown as WaveContentInput, actorContent)).toThrow(
      WaveContentValidationError,
    );
    expect(validateWaveContent(malformed, actorContent).map(({ code }) => code)).toEqual([
      "population-cap-exceeded",
      "population-cap-exceeded",
      "invalid-non-negative-number",
      "invalid-positive-number",
      "invalid-positive-number",
    ]);
  });

  it("preserves authored ordering and recursively freezes accepted content", () => {
    const catalog = createWaveContentCatalog(validContent, actorContent);

    expect(catalog.demoWaves[0]!.slots[0]!.spawnGroupId).toBe("small");
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.groups[0]!.entries)).toBe(true);
    expect(Object.isFrozen(catalog.progressionProfile.hpCurve)).toBe(true);
    expect(() => {
      (catalog.groups[0]!.entries as unknown as Array<{ enemyId: string }>)[0]!.enemyId = "slash_enemy";
    }).toThrow();
  });
});
