import { describe, expect, it } from "vitest";
import {
  createMilestoneArena,
  MILESTONE_SCENARIO_SEED,
  MILESTONE_WAVE_NUMBER,
  milestoneScenarioContext,
} from "@harness/fixtures/milestone-arena";

describe("milestone scenario fixture", () => {
  it("starts with only the regular player, Wave 1 slots, and no enemies or telegraphs", () => {
    const world = createMilestoneArena();

    const entities = world.listEntities();
    expect(entities).toHaveLength(1);
    expect(world.requireEntity("player")).toMatchObject({ kind: "player", archetype: "ninja" });

    const snapshot = world.snapshot();
    expect(snapshot.telegraphs).toEqual([]);
    expect(snapshot.reservations).toEqual([]);
    expect(snapshot.waveRuntime).toMatchObject({ waveNumber: 1 });
    expect(snapshot.waveRuntime?.slots).toHaveLength(1);
    expect(snapshot.waveRuntime?.pendingBatch).toBeUndefined();
    expect(snapshot.pendingReward).toBeUndefined();
    expect(snapshot.pendingMilestone).toBeUndefined();
  });

  it("reproduces the same initial snapshot under the fixed seed", () => {
    const first = createMilestoneArena(MILESTONE_SCENARIO_SEED);
    const second = createMilestoneArena(MILESTONE_SCENARIO_SEED);

    expect(second.snapshot()).toEqual(first.snapshot());
  });

  it("keeps serving an authored wave past the milestone so a Continue Endless decision has a next wave", () => {
    expect(milestoneScenarioContext.milestoneWaveNumber).toBe(MILESTONE_WAVE_NUMBER);
    expect(milestoneScenarioContext.waveFor(MILESTONE_WAVE_NUMBER + 1)).toBeDefined();
    expect(milestoneScenarioContext.offerableArtifacts?.length ?? 0).toBeGreaterThan(0);
  });
});
