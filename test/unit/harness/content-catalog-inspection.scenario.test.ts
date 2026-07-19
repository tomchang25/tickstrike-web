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
    expect(contentInspection.chargeEnemy.guard).toMatchObject({
      id: "heavy",
      name: "Heavy",
      base: 64,
    });
    expect(contentInspection.chargeEnemy.attacks.map((attack) => attack.id)).toEqual(["charge"]);
    expect(contentInspection.demoWave09).toMatchObject({
      id: "demo-09",
      populationCap: 9,
      group: { id: "charge", entries: [{ enemyId: "charge_enemy", count: 2 }] },
      slot: { warningTicks: 1, levelOffset: 0, isBoss: false },
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
