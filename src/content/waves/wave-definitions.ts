import type {
  GrowthCurve,
  GuardGrowthInput,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveGroupSlot,
  WaveProgressionProfile,
} from "../../core/content/wave-schema";

const immediateSlotDefaults = {
  startCondition: "immediate-overlap",
  survivorThreshold: 0,
  warningTicks: 1,
  levelOffset: 0,
  isBoss: false,
} as const;

function createSlot(spawnGroupId: string, overrides: Partial<WaveGroupSlot> = {}): WaveGroupSlot {
  return { spawnGroupId, ...immediateSlotDefaults, ...overrides };
}

export const spawnGroupDefinitions: readonly SpawnGroupDefinition[] = [
  {
    id: "small",
    placementStrategy: "player-ring",
    compositionMode: "weighted",
    weightedTotalCount: 3,
    entries: [
      { enemyId: "thrust_enemy", weight: 1 },
      { enemyId: "slash_enemy", weight: 1 },
    ],
  },
  {
    id: "small-ranged",
    placementStrategy: "anchor-cluster",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [
      { enemyId: "thrust_enemy", count: 2 },
      { enemyId: "slash_enemy", count: 1 },
      { enemyId: "ranged_enemy", count: 2 },
    ],
  },
  {
    id: "small-ranged-charge",
    placementStrategy: "anchor-cluster",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [
      { enemyId: "thrust_enemy", count: 2 },
      { enemyId: "slash_enemy", count: 1 },
      { enemyId: "ranged_enemy", count: 1 },
      { enemyId: "charge_enemy", count: 1 },
    ],
  },
  {
    id: "ranged",
    placementStrategy: "anchor-cluster",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [{ enemyId: "ranged_enemy", count: 2 }],
  },
  {
    id: "charge",
    placementStrategy: "scatter",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [{ enemyId: "charge_enemy", count: 2 }],
  },
  {
    id: "bomb",
    placementStrategy: "scatter",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [{ enemyId: "bomb_enemy", count: 2 }],
  },
  {
    id: "boss",
    placementStrategy: "scatter",
    compositionMode: "fixed",
    weightedTotalCount: 0,
    entries: [{ enemyId: "mode_boss", count: 1 }],
  },
];

export const demoWaveDefinitions: readonly WaveDefinition[] = [
  { id: "demo-01", populationCap: 3, slots: [createSlot("small")] },
  { id: "demo-02", populationCap: 2, slots: [createSlot("ranged")] },
  { id: "demo-03", populationCap: 5, slots: [createSlot("small-ranged")] },
  { id: "demo-04", populationCap: 2, slots: [createSlot("charge")] },
  { id: "demo-05", populationCap: 5, slots: [createSlot("small-ranged-charge")] },
  {
    id: "demo-06",
    populationCap: 6,
    slots: [createSlot("small"), createSlot("ranged"), createSlot("charge")],
  },
  {
    id: "demo-07",
    populationCap: 7,
    slots: [createSlot("ranged"), createSlot("small"), createSlot("charge")],
  },
  {
    id: "demo-08",
    populationCap: 8,
    slots: [createSlot("small"), createSlot("ranged"), createSlot("charge"), createSlot("bomb")],
  },
  {
    id: "demo-09",
    populationCap: 9,
    slots: [createSlot("charge"), createSlot("ranged"), createSlot("small"), createSlot("bomb")],
  },
  {
    id: "demo-10",
    populationCap: 1,
    slots: [
      createSlot("boss", {
        warningTicks: 2,
        levelOffset: 3,
        isBoss: true,
      }),
    ],
  },
];

export const endlessWaveDefinition: WaveDefinition = {
  id: "endless",
  populationCap: 10,
  slots: [createSlot("charge"), createSlot("ranged"), createSlot("small"), createSlot("bomb")],
};

export const progressionProfile: WaveProgressionProfile = {
  lethalLevelStart: 10,
  hpCurve: {
    standardCoefficient: 0.08,
    standardExponent: 1,
    lethalCoefficient: 0.15,
    lethalExponent: 1.2,
  } satisfies GrowthCurve,
  damageCurve: {
    standardCoefficient: 0.05,
    standardExponent: 1,
    lethalCoefficient: 0.1,
    lethalExponent: 1.1,
  } satisfies GrowthCurve,
  defenseCurve: {
    standardCoefficient: 0.6,
    standardExponent: 1,
    lethalCoefficient: 1.2,
    lethalExponent: 1,
  } satisfies GrowthCurve,
  guardGrowth: {
    basis: "base-wave",
    standardWaveLimit: 20,
    lethalTierCadence: 5,
  } satisfies GuardGrowthInput,
};
