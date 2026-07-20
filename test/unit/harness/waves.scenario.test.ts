import { describe, expect, it } from "vitest";
import { resolveCommand } from "@core/actions/action-resolver";
import {
  createWaveArena,
  WAVE_SCENARIO_SEED,
  waveScenarioContext,
} from "@harness/fixtures/wave-arena";
import { waveCatalog } from "@content/wave-catalog";

describe("waves scenario fixture", () => {
  it("starts with only the regular player, Wave 1 slots, and no enemies or telegraphs", () => {
    const world = createWaveArena();

    const entities = world.listEntities();
    expect(entities).toHaveLength(1);
    expect(world.requireEntity("player")).toMatchObject({ kind: "player", archetype: "ninja" });

    const snapshot = world.snapshot();
    expect(snapshot.telegraphs).toEqual([]);
    expect(snapshot.reservations).toEqual([]);
    expect(snapshot.waveRuntime).toMatchObject({ waveNumber: 1 });
    expect(snapshot.waveRuntime?.slots).toHaveLength(1);
    expect(snapshot.waveRuntime?.pendingBatch).toBeUndefined();

    const slot = snapshot.waveRuntime?.slots[0];
    expect(slot?.eligible).toBe(false);
    expect(slot?.hasEverSpawned).toBe(false);
    expect(slot?.livingCount).toBe(0);
    expect(slot?.remainingQueue).toHaveLength(waveCatalog.demoWaves[0]!.populationCap);
  });

  it("reproduces the same initial wave runtime under the fixed seed", () => {
    const first = createWaveArena(WAVE_SCENARIO_SEED);
    const second = createWaveArena(WAVE_SCENARIO_SEED);

    expect(second.waveRuntime).toEqual(first.waveRuntime);
    expect(second.snapshot().arena).toEqual(first.snapshot().arena);
  });

  it("admits and warns the first authored group on the first accepted command", () => {
    const world = createWaveArena();

    const result = resolveCommand(
      world,
      { type: "attack", actorId: "player", direction: { x: 0, y: -1 } },
      waveScenarioContext,
    );

    expect(result.accepted).toBe(true);
    const snapshot = world.snapshot();
    expect(snapshot.telegraphs).toHaveLength(1);
    expect(snapshot.telegraphs[0]).toMatchObject({ phase: "spawning" });
    expect(
      snapshot.reservations.filter((reservation) => reservation.purpose === "spawn"),
    ).toHaveLength(1);
    expect(snapshot.waveRuntime?.slots[0]?.eligible).toBe(true);
    expect(snapshot.waveRuntime?.pendingBatch).toBeDefined();
  });

  it("resolves the nine authored demo waves by 1-based wave number", () => {
    for (let waveNumber = 1; waveNumber <= 9; waveNumber += 1) {
      expect(waveScenarioContext.waveFor(waveNumber)).toBe(waveCatalog.demoWaves[waveNumber - 1]);
    }
  });

  it("falls back to the endless template for every wave beyond the final demo wave", () => {
    expect(waveScenarioContext.waveFor(10)).toBe(waveCatalog.endlessTemplate);
    expect(waveScenarioContext.waveFor(500)).toBe(waveCatalog.endlessTemplate);
  });
});
