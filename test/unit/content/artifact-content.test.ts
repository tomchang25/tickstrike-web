import { describe, expect, it } from "vitest";
import { artifactContent } from "../../../src/content/artifact-content";

describe("canonical artifact content", () => {
  it("contains the nine shipped artifacts in registry order", () => {
    expect(artifactContent.artifacts.map((artifact) => artifact.id)).toEqual([
      "attack_up",
      "speed_up",
      "dash_attack_up",
      "mobility_cooldown_down",
      "mobility_range_up",
      "max_health_up",
      "guard_shredder",
      "execution",
      "chain_dash",
    ]);
    expect(artifactContent.artifacts.filter((artifact) => artifact.category === "minor")).toHaveLength(6);
    expect(artifactContent.artifacts.filter((artifact) => artifact.category === "major")).toHaveLength(3);
    expect(artifactContent.artifacts.filter((artifact) => artifact.isCurse)).toHaveLength(0);
  });

  it("records every shipped display value and immutable metadata", () => {
    expect(artifactContent.artifacts.map(({ id, name, descriptionTemplate, category, maxStacks, minWave, magnitude }) => ({
      id,
      name,
      descriptionTemplate,
      category,
      maxStacks,
      minWave,
      magnitude,
    }))).toEqual([
      {
        id: "attack_up",
        name: "Sharpened Edge",
        descriptionTemplate: "+%d normal attack damage",
        category: "minor",
        maxStacks: 3,
        minWave: 1,
        magnitude: 10,
      },
      {
        id: "speed_up",
        name: "Fleet Step",
        descriptionTemplate: "+%d Speed",
        category: "minor",
        maxStacks: 5,
        minWave: 1,
        magnitude: 1,
      },
      {
        id: "dash_attack_up",
        name: "Impact Dash",
        descriptionTemplate: "+%d dash attack damage",
        category: "minor",
        maxStacks: 3,
        minWave: 1,
        magnitude: 20,
      },
      {
        id: "mobility_cooldown_down",
        name: "Light Footwork",
        descriptionTemplate: "-%d mobility cooldown (ticks)",
        category: "minor",
        maxStacks: 3,
        minWave: 1,
        magnitude: 1,
      },
      {
        id: "mobility_range_up",
        name: "Extended Mobility",
        descriptionTemplate: "+%d Mobility Range",
        category: "minor",
        maxStacks: 3,
        minWave: 1,
        magnitude: 1,
      },
      {
        id: "max_health_up",
        name: "Vital Spark",
        descriptionTemplate: "+%d max health",
        category: "minor",
        maxStacks: 2,
        minWave: 1,
        magnitude: 20,
      },
      {
        id: "guard_shredder",
        name: "Guard Shredder",
        descriptionTemplate: "Back-angle dash hits break guard instantly (%d)",
        category: "major",
        maxStacks: 1,
        minWave: 2,
        magnitude: 1,
      },
      {
        id: "execution",
        name: "Execution",
        descriptionTemplate: "Dash hits on staggered targets kill instantly (%d)",
        category: "major",
        maxStacks: 1,
        minWave: 2,
        magnitude: 1,
      },
      {
        id: "chain_dash",
        name: "Chain Dash",
        descriptionTemplate: "Back, guard-break, stagger, or kill Dash hits clear Dash cooldown and ready your next move or attack (%d)",
        category: "major",
        maxStacks: 1,
        minWave: 2,
        magnitude: 1,
      },
    ]);
    expect(artifactContent.artifacts.every((artifact) => artifact.exclusivityGroup === "")).toBe(true);
    expect(artifactContent.artifacts.every((artifact) => artifact.isCurse === false)).toBe(true);
  });

  it("records semantic effects and only the three shipped Dash restrictions", () => {
    expect(artifactContent.artifacts.map(({ id, requiredMobility, presentation, effects }) => ({
      id,
      requiredMobility,
      presentation,
      effects,
    }))).toEqual([
      {
        id: "attack_up",
        requiredMobility: null,
        presentation: { id: "artifact.attack_up" },
        effects: [{ kind: "channel", channel: "normal-attack-damage", amount: 10 }],
      },
      {
        id: "speed_up",
        requiredMobility: null,
        presentation: { id: "artifact.speed_up" },
        effects: [{ kind: "channel", channel: "speed", amount: 1 }],
      },
      {
        id: "dash_attack_up",
        requiredMobility: null,
        presentation: { id: "artifact.dash_attack_up" },
        effects: [{ kind: "channel", channel: "mobility-attack-damage", amount: 20 }],
      },
      {
        id: "mobility_cooldown_down",
        requiredMobility: null,
        presentation: { id: "artifact.mobility_cooldown_down" },
        effects: [{ kind: "channel", channel: "mobility-cooldown", amount: 1 }],
      },
      {
        id: "mobility_range_up",
        requiredMobility: null,
        presentation: { id: "artifact.mobility_range_up" },
        effects: [{ kind: "channel", channel: "mobility-range", amount: 1 }],
      },
      {
        id: "max_health_up",
        requiredMobility: null,
        presentation: { id: "artifact.max_health_up" },
        effects: [{ kind: "channel", channel: "max-health", amount: 20 }],
      },
      {
        id: "guard_shredder",
        requiredMobility: "dash",
        presentation: { id: "artifact.guard_shredder" },
        effects: [{ kind: "trigger", trigger: "guard-shredder" }],
      },
      {
        id: "execution",
        requiredMobility: "dash",
        presentation: { id: "artifact.execution" },
        effects: [{ kind: "trigger", trigger: "execution" }],
      },
      {
        id: "chain_dash",
        requiredMobility: "dash",
        presentation: { id: "artifact.chain_dash" },
        effects: [{ kind: "trigger", trigger: "chain-dash" }],
      },
    ]);
    expect(artifactContent.artifacts.find((artifact) => artifact.id === "dash_attack_up")?.requiredMobility).toBeNull();
  });
});
