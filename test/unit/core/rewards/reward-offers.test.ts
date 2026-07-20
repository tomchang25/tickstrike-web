import { describe, expect, it } from "vitest";
import type { ArtifactDefinition } from "@core/content/artifact-schema";
import type { RunBuildState } from "@core/model/types";
import {
  classifyArtifactEffect,
  createEmptyRunBuild,
  generateSingleCardOffer,
  getArtifactStackCount,
  hasAcquiredTrigger,
  isArtifactEligible,
  isArtifactMobilityCompatible,
  isArtifactSupported,
  withAcquiredTrigger,
  withArtifactStackCount,
} from "@core/rewards/reward-offers";

function artifact(overrides: Partial<ArtifactDefinition> = {}): ArtifactDefinition {
  return {
    id: "attack_up",
    name: "Sharpened Edge",
    descriptionTemplate: "+%d normal attack damage",
    category: "minor",
    maxStacks: 3,
    exclusivityGroup: "",
    isCurse: false,
    minWave: 1,
    magnitude: 10,
    requiredMobility: null,
    effects: [{ kind: "channel", channel: "normal-attack-damage", amount: 10 }],
    presentation: { id: "artifact.attack_up" },
    ...overrides,
  };
}

const ATTACK_UP = artifact();
const DASH_ATTACK_UP = artifact({
  id: "dash_attack_up",
  effects: [{ kind: "channel", channel: "mobility-attack-damage", amount: 20 }],
});
const MOBILITY_COOLDOWN_DOWN = artifact({
  id: "mobility_cooldown_down",
  effects: [{ kind: "channel", channel: "mobility-cooldown", amount: 1 }],
});
const MOBILITY_RANGE_UP = artifact({
  id: "mobility_range_up",
  effects: [{ kind: "channel", channel: "mobility-range", amount: 1 }],
});
const MAX_HEALTH_UP = artifact({
  id: "max_health_up",
  maxStacks: 2,
  effects: [{ kind: "channel", channel: "max-health", amount: 20 }],
});
const SPEED_UP = artifact({
  id: "speed_up",
  maxStacks: 5,
  effects: [{ kind: "channel", channel: "speed", amount: 1 }],
});
const GUARD_SHREDDER = artifact({
  id: "guard_shredder",
  category: "major",
  maxStacks: 1,
  minWave: 2,
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "guard-shredder" }],
});
const EXECUTION = artifact({
  id: "execution",
  category: "major",
  maxStacks: 1,
  minWave: 2,
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "execution" }],
});
const CHAIN_DASH = artifact({
  id: "chain_dash",
  category: "major",
  maxStacks: 1,
  minWave: 2,
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "chain-dash" }],
});

describe("run-build: stack bookkeeping", () => {
  it("starts empty with no stacks or triggers", () => {
    const build = createEmptyRunBuild();
    expect(build).toEqual({ stacks: {}, triggers: [] });
    expect(getArtifactStackCount(build, "attack_up")).toBe(0);
  });

  it("returns a new build with the artifact's stack count set, leaving the input untouched", () => {
    const build = createEmptyRunBuild();
    const next = withArtifactStackCount(build, "attack_up", 1);
    expect(getArtifactStackCount(next, "attack_up")).toBe(1);
    expect(getArtifactStackCount(build, "attack_up")).toBe(0);
    expect(build).toEqual({ stacks: {}, triggers: [] });
  });

  it("preserves triggers when a stack count is updated", () => {
    const build: RunBuildState = { stacks: { attack_up: 2 }, triggers: ["guard-shredder"] };
    const next = withArtifactStackCount(build, "attack_up", 3);
    expect(next).toEqual({ stacks: { attack_up: 3 }, triggers: ["guard-shredder"] });
  });
});

describe("run-build: acquired triggers", () => {
  it("reports no trigger as acquired on an empty build", () => {
    expect(hasAcquiredTrigger(createEmptyRunBuild(), "guard-shredder")).toBe(false);
  });

  it("adds a trigger without disturbing existing stacks", () => {
    const build: RunBuildState = { stacks: { attack_up: 1 }, triggers: [] };
    const next = withAcquiredTrigger(build, "guard-shredder");
    expect(next).toEqual({ stacks: { attack_up: 1 }, triggers: ["guard-shredder"] });
    expect(hasAcquiredTrigger(next, "guard-shredder")).toBe(true);
  });

  it("is idempotent: acquiring the same trigger twice does not duplicate it", () => {
    const once = withAcquiredTrigger(createEmptyRunBuild(), "execution");
    const twice = withAcquiredTrigger(once, "execution");
    expect(twice.triggers).toEqual(["execution"]);
  });
});

describe("run-build: effect classification", () => {
  it("classifies every supported channel with its authored amount", () => {
    expect(classifyArtifactEffect(ATTACK_UP)).toEqual({
      kind: "normal-attack-damage",
      amount: 10,
    });
    expect(classifyArtifactEffect(DASH_ATTACK_UP)).toEqual({
      kind: "mobility-attack-damage",
      amount: 20,
    });
    expect(classifyArtifactEffect(MOBILITY_COOLDOWN_DOWN)).toEqual({
      kind: "mobility-cooldown",
      amount: 1,
    });
    expect(classifyArtifactEffect(MOBILITY_RANGE_UP)).toEqual({
      kind: "mobility-range",
      amount: 1,
    });
    expect(classifyArtifactEffect(MAX_HEALTH_UP)).toEqual({ kind: "max-health", amount: 20 });
  });

  it("classifies both approved Dash triggers", () => {
    expect(classifyArtifactEffect(GUARD_SHREDDER)).toEqual({
      kind: "trigger",
      trigger: "guard-shredder",
    });
    expect(classifyArtifactEffect(EXECUTION)).toEqual({ kind: "trigger", trigger: "execution" });
  });

  it("classifies the deferred speed channel and Chain Dash trigger as unsupported", () => {
    expect(classifyArtifactEffect(SPEED_UP)).toEqual({ kind: "unsupported" });
    expect(classifyArtifactEffect(CHAIN_DASH)).toEqual({ kind: "unsupported" });
  });

  it("reports supported vs. unsupported through isArtifactSupported", () => {
    expect(isArtifactSupported(ATTACK_UP)).toBe(true);
    expect(isArtifactSupported(GUARD_SHREDDER)).toBe(true);
    expect(isArtifactSupported(SPEED_UP)).toBe(false);
    expect(isArtifactSupported(CHAIN_DASH)).toBe(false);
  });
});

describe("run-build: Mobility compatibility", () => {
  it("is compatible with any player when the artifact requires no Mobility", () => {
    expect(isArtifactMobilityCompatible(ATTACK_UP, "dash")).toBe(true);
    expect(isArtifactMobilityCompatible(ATTACK_UP, "smash")).toBe(true);
    expect(isArtifactMobilityCompatible(ATTACK_UP, null)).toBe(true);
  });

  it("requires a matching Mobility kind when the artifact demands one", () => {
    expect(isArtifactMobilityCompatible(GUARD_SHREDDER, "dash")).toBe(true);
    expect(isArtifactMobilityCompatible(GUARD_SHREDDER, "smash")).toBe(false);
    expect(isArtifactMobilityCompatible(GUARD_SHREDDER, null)).toBe(false);
  });
});

describe("run-build: eligibility", () => {
  it("is eligible below its stack cap, at or after its minimum wave, and Mobility-compatible", () => {
    expect(isArtifactEligible(ATTACK_UP, 0, 1, "dash")).toBe(true);
    expect(isArtifactEligible(ATTACK_UP, 2, 1, null)).toBe(true);
  });

  it("is ineligible once the stack cap is reached", () => {
    expect(isArtifactEligible(ATTACK_UP, 3, 1, "dash")).toBe(false);
  });

  it("is ineligible before its minimum wave", () => {
    expect(isArtifactEligible(GUARD_SHREDDER, 0, 1, "dash")).toBe(false);
    expect(isArtifactEligible(GUARD_SHREDDER, 0, 2, "dash")).toBe(true);
  });

  it("excludes a Dash-only artifact for a Smash player — a Viking run stays ineligible", () => {
    expect(isArtifactEligible(GUARD_SHREDDER, 0, 2, "smash")).toBe(false);
    expect(isArtifactEligible(EXECUTION, 0, 2, "smash")).toBe(false);
  });
});

describe("run-build: single-card offer generation", () => {
  it("offers the sole eligible candidate at stack one", () => {
    const offer = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 1,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer).toEqual({
      waveNumber: 1,
      cards: [{ artifactId: "attack_up", resultingStackCount: 1 }],
    });
  });

  it("offers the next stack count when some stacks are already owned", () => {
    const build = withArtifactStackCount(createEmptyRunBuild(), "attack_up", 2);
    const offer = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 3,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer?.cards).toEqual([{ artifactId: "attack_up", resultingStackCount: 3 }]);
  });

  it("returns undefined once the sole candidate is capped, without installing an inert offer", () => {
    const build = withArtifactStackCount(createEmptyRunBuild(), "attack_up", 3);
    const offer = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 3,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer).toBeUndefined();
  });

  it("returns undefined when no candidates are supplied", () => {
    const offer = generateSingleCardOffer({
      artifacts: [],
      build: createEmptyRunBuild(),
      waveNumber: 1,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer).toBeUndefined();
  });

  it("excludes an ineligible candidate and offers only what remains", () => {
    const offer = generateSingleCardOffer({
      artifacts: [GUARD_SHREDDER, ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 1,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer?.cards).toEqual([{ artifactId: "attack_up", resultingStackCount: 1 }]);
  });

  it("excludes a Dash-only major from a Smash run's offer pool", () => {
    const offer = generateSingleCardOffer({
      artifacts: [GUARD_SHREDDER, ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 2,
      playerMobilityKind: "smash",
      draw: () => 0,
    });
    expect(offer?.cards).toEqual([{ artifactId: "attack_up", resultingStackCount: 1 }]);
  });

  it("never generates or grants speed_up or chain_dash, even if mistakenly offerable", () => {
    const offer = generateSingleCardOffer({
      artifacts: [SPEED_UP, CHAIN_DASH],
      build: createEmptyRunBuild(),
      waveNumber: 5,
      playerMobilityKind: "dash",
      draw: () => 0,
    });
    expect(offer).toBeUndefined();
  });

  it("is a pure function of its inputs: the same draw sequence yields the same offer", () => {
    const build = createEmptyRunBuild();
    const first = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: () => 0.4,
    });
    const second = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: () => 0.4,
    });
    expect(first).toEqual(second);
  });
});
