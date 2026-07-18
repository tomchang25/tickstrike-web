import { describe, expect, it } from "vitest";
import { contentInspection } from "../../../src/harness/content-inspection";
import { requireScenario } from "../../../src/harness/scenario-registry";
import { GameRuntime } from "../../../src/runtime/GameRuntime";

describe("content catalog inspection scenario", () => {
  it("derives representative values from the canonical catalog", () => {
    expect(contentInspection.ninja).toMatchObject({
      id: "ninja",
      name: "Ninja",
      hp: 100,
      speedFill: 20,
      mobility: { kind: "dash", damage: 30, range: 5, cooldown: 4 },
    });
    expect(contentInspection.modeBoss.guard).toMatchObject({ id: "boss", name: "Boss", base: 128 });
    expect(contentInspection.modeBoss.attacks.map((attack) => attack.id)).toEqual([
      "mode_boss_tile_wide",
      "mode_boss_tile_square",
      "mode_boss_tile_line",
      "mode_boss_charge",
      "mode_boss_area",
    ]);
    expect(contentInspection.demoWave10).toMatchObject({
      id: "demo-10",
      populationCap: 1,
      bossGroup: { id: "boss", entries: [{ enemyId: "mode_boss", count: 1 }] },
      slot: { warningTicks: 2, levelOffset: 3, isBoss: true },
    });
    expect(contentInspection.guardShredder).toMatchObject({
      category: "major",
      requiredMobility: "dash",
      trigger: "guard-shredder",
    });
  });

  it("creates an empty deterministic world and refuses commands", async () => {
    const scenario = requireScenario("content-catalog-inspection");
    const runtime = new GameRuntime();
    runtime.loadScenario(scenario);

    expect(runtime.snapshot()).toMatchObject({ tick: 0, entities: [], lastEvents: [] });
    expect(runtime.getContentInspection()).toBe(contentInspection);

    const resolution = await runtime.execute({
      type: "move",
      actorId: "player",
      direction: { x: 1, y: 0 },
    });

    expect(resolution).toEqual({
      accepted: false,
      consumedTime: false,
      reason: "Commands are disabled for this scenario.",
      events: [],
    });
    expect(runtime.snapshot()).toMatchObject({ tick: 0, entities: [], lastEvents: [] });

    runtime.reset();
    expect(runtime.snapshot()).toMatchObject({ tick: 0, entities: [], lastEvents: [] });
  });

  it("does not expose inspection data for training scenarios", () => {
    const scenario = requireScenario("smash-water");
    const runtime = new GameRuntime();
    runtime.loadScenario(scenario);

    expect(runtime.getContentInspection()).toBeUndefined();
  });
});
