import { describe, expect, it } from "vitest";
import type { SpawnGroupDefinition, WaveDefinition, WaveGroupSlot } from "@core/content/wave-schema";
import type { RandomUnitSource } from "@core/waves/wave-inputs";
import {
  createInitialSlotStates,
  evaluateSlotEligibility,
  expandSlotQueue,
  selectAtomicBatch,
  type SlotState,
} from "@core/waves/wave-scheduler";

function sequenceSource(values: readonly number[]): RandomUnitSource {
  let index = 0;
  return () => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  };
}

const fixedGroup: SpawnGroupDefinition = {
  id: "grunts",
  placementStrategy: "scatter",
  compositionMode: "fixed",
  weightedTotalCount: 0,
  entries: [
    { enemyId: "thrust_enemy", count: 2 },
    { enemyId: "slash_enemy", count: 3 },
  ],
};

const weightedGroup: SpawnGroupDefinition = {
  id: "mixed",
  placementStrategy: "player-ring",
  compositionMode: "weighted",
  weightedTotalCount: 4,
  entries: [
    { enemyId: "thrust_enemy", weight: 1 },
    { enemyId: "slash_enemy", weight: 1 },
  ],
};

const singleWeightedGroup: SpawnGroupDefinition = {
  id: "solo",
  placementStrategy: "anchor-cluster",
  compositionMode: "weighted",
  weightedTotalCount: 3,
  entries: [{ enemyId: "ranged_enemy", weight: 1 }],
};

function slotFor(spawnGroupId: string, overrides: Partial<WaveGroupSlot> = {}): WaveGroupSlot {
  return {
    spawnGroupId,
    startCondition: "immediate-overlap",
    survivorThreshold: 0,
    warningTicks: 2,
    levelOffset: 0,
    isBoss: false,
    ...overrides,
  };
}

describe("expandSlotQueue", () => {
  it("expands a fixed group literally by each entry's count, ignoring the random source", () => {
    const slot = slotFor("grunts", { levelOffset: 1 });
    let calls = 0;
    const random: RandomUnitSource = () => {
      calls += 1;
      return 0;
    };
    const members = expandSlotQueue(fixedGroup, slot, 5, random);
    expect(members).toEqual([
      { enemyId: "thrust_enemy", level: 6 },
      { enemyId: "thrust_enemy", level: 6 },
      { enemyId: "slash_enemy", level: 6 },
      { enemyId: "slash_enemy", level: 6 },
      { enemyId: "slash_enemy", level: 6 },
    ]);
    expect(calls).toBe(0);
  });

  it("draws a weighted group's members deterministically from the source sequence", () => {
    const slot = slotFor("mixed");
    const first = expandSlotQueue(weightedGroup, slot, 1, sequenceSource([0.1, 0.9, 0.4, 0.6]));
    const second = expandSlotQueue(weightedGroup, slot, 1, sequenceSource([0.1, 0.9, 0.4, 0.6]));
    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
  });

  it("draws the sole entry every time for a single-entry weighted group, still consuming the source", () => {
    const slot = slotFor("solo");
    let calls = 0;
    const random: RandomUnitSource = () => {
      calls += 1;
      return 0.5;
    };
    const members = expandSlotQueue(singleWeightedGroup, slot, 2, random);
    expect(members).toEqual([
      { enemyId: "ranged_enemy", level: 2 },
      { enemyId: "ranged_enemy", level: 2 },
      { enemyId: "ranged_enemy", level: 2 },
    ]);
    expect(calls).toBe(3);
  });
});

describe("createInitialSlotStates", () => {
  it("expands every slot's queue with all latches unset", () => {
    const wave: WaveDefinition = {
      id: "wave-1",
      populationCap: 10,
      slots: [slotFor("grunts"), slotFor("mixed")],
    };
    const states = createInitialSlotStates(wave, [fixedGroup, weightedGroup], 1, sequenceSource([0.2, 0.8]));
    expect(states).toHaveLength(2);
    expect(states[0]!.remainingQueue).toHaveLength(5);
    expect(states[1]!.remainingQueue).toHaveLength(4);
    for (const state of states) {
      expect(state.eligible).toBe(false);
      expect(state.hasEverSpawned).toBe(false);
      expect(state.livingCount).toBe(0);
    }
  });
});

describe("evaluateSlotEligibility", () => {
  const wave: WaveDefinition = {
    id: "wave-1",
    populationCap: 10,
    slots: [
      slotFor("grunts", { startCondition: "immediate-overlap" }),
      slotFor("mixed", { startCondition: "previous-group-cleared" }),
    ],
  };

  function baseState(overrides: Partial<SlotState> = {}): SlotState {
    return {
      remainingQueue: [],
      eligible: false,
      hasEverSpawned: false,
      livingCount: 0,
      ...overrides,
    };
  }

  it("makes the first slot eligible immediately", () => {
    const next = evaluateSlotEligibility(wave, [baseState(), baseState()]);
    expect(next[0]!.eligible).toBe(true);
  });

  it("does not trust a zero living count as cleared before the predecessor has ever spawned", () => {
    const next = evaluateSlotEligibility(wave, [baseState(), baseState()]);
    expect(next[1]!.eligible).toBe(false);
  });

  it("cascades eligibility in one pass once the predecessor has spawned and cleared", () => {
    const next = evaluateSlotEligibility(wave, [baseState({ hasEverSpawned: true, livingCount: 0 }), baseState()]);
    expect(next[0]!.eligible).toBe(true);
    expect(next[1]!.eligible).toBe(true);
  });

  it("never revokes eligibility once latched", () => {
    const eligibleButNowUnspawned = baseState({ eligible: true, hasEverSpawned: false });
    const next = evaluateSlotEligibility(wave, [eligibleButNowUnspawned, baseState()]);
    expect(next[0]!.eligible).toBe(true);
  });

  it("respects the survivor-at-most threshold", () => {
    const survivorWave: WaveDefinition = {
      id: "wave-2",
      populationCap: 10,
      slots: [
        slotFor("grunts", { startCondition: "immediate-overlap" }),
        slotFor("mixed", {
          startCondition: "previous-group-survivors-at-most",
          survivorThreshold: 2,
        }),
      ],
    };
    const tooMany = evaluateSlotEligibility(survivorWave, [
      baseState({ eligible: true, hasEverSpawned: true, livingCount: 3 }),
      baseState(),
    ]);
    expect(tooMany[1]!.eligible).toBe(false);

    const atThreshold = evaluateSlotEligibility(survivorWave, [
      baseState({ eligible: true, hasEverSpawned: true, livingCount: 2 }),
      baseState(),
    ]);
    expect(atThreshold[1]!.eligible).toBe(true);
  });
});

describe("selectAtomicBatch", () => {
  const wave: WaveDefinition = {
    id: "wave-1",
    populationCap: 3,
    slots: [slotFor("grunts"), slotFor("mixed")],
  };
  const groups = [fixedGroup, weightedGroup];

  function state(overrides: Partial<SlotState>): SlotState {
    return {
      remainingQueue: [],
      eligible: false,
      hasEverSpawned: false,
      livingCount: 0,
      ...overrides,
    };
  }

  it("returns undefined when no slot is eligible or every eligible queue is empty", () => {
    const result = selectAtomicBatch(
      wave,
      groups,
      [state({ eligible: false, remainingQueue: [{ enemyId: "a", level: 1 }] }), state({})],
      0,
    );
    expect(result).toBeUndefined();
  });

  it("admits the earliest eligible non-empty slot's entire queue", () => {
    const members = [
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
    ];
    const result = selectAtomicBatch(
      wave,
      groups,
      [state({ eligible: true, remainingQueue: members }), state({ eligible: true })],
      0,
    );
    expect(result).toEqual({
      slotIndex: 0,
      members,
      warningTicks: 2,
      placementStrategy: "scatter",
    });
  });

  it("skips an eligible slot with an already-empty queue in favor of the next one", () => {
    const members = [{ enemyId: "thrust_enemy", level: 1 }];
    const result = selectAtomicBatch(
      wave,
      groups,
      [state({ eligible: true, remainingQueue: [] }), state({ eligible: true, remainingQueue: members })],
      0,
    );
    expect(result?.slotIndex).toBe(1);
    expect(result?.placementStrategy).toBe("player-ring");
  });

  it("rejects the batch when it exceeds population headroom, leaving the queue untouched", () => {
    const members = [
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
    ];
    const slotStates = [state({ eligible: true, remainingQueue: members }), state({ eligible: true })];
    const result = selectAtomicBatch(wave, groups, slotStates, 2);
    expect(result).toBeUndefined();
    expect(slotStates[0]!.remainingQueue).toBe(members);
  });

  it("never lets a later slot bypass a blocked earlier slot", () => {
    const blockedMembers = [
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
      { enemyId: "thrust_enemy", level: 1 },
    ];
    const fittingMembers = [{ enemyId: "slash_enemy", level: 1 }];
    const result = selectAtomicBatch(
      wave,
      groups,
      [
        state({ eligible: true, remainingQueue: blockedMembers }),
        state({ eligible: true, remainingQueue: fittingMembers }),
      ],
      0,
    );
    expect(result).toBeUndefined();
  });
});
