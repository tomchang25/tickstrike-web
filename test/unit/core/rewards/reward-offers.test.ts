import { describe, expect, it } from "vitest";
import type { ArtifactDefinition } from "@core/content/artifact-schema";
import type { RunBuildState } from "@core/model/types";
import {
  classifyArtifactEffect,
  createEmptyRunBuild,
  generateRewardOffer,
  getArtifactStackCount,
  hasAcquiredTrigger,
  isArtifactEligible,
  isArtifactMobilityCompatible,
  isArtifactSupported,
  isMilestoneWave,
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

const MINORS = [
  ATTACK_UP,
  DASH_ATTACK_UP,
  MOBILITY_COOLDOWN_DOWN,
  MOBILITY_RANGE_UP,
  MAX_HEALTH_UP,
] as const;
const MAJORS = [GUARD_SHREDDER, EXECUTION] as const;

/** A constant zero draw always takes the head of the remaining pool, i.e. content order. */
const takeInOrder = () => 0;

describe("reward offer: milestone cadence", () => {
  it("treats every third completed wave as a milestone and nothing else", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(isMilestoneWave)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
      true,
    ]);
    expect(isMilestoneWave(0)).toBe(false);
  });
});

describe("reward offer: ordinary waves", () => {
  it("offers three distinct Minor cards at one stack, in draw order", () => {
    const offer = generateRewardOffer({
      artifacts: [...MINORS, ...MAJORS],
      build: createEmptyRunBuild(),
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toEqual({
      waveNumber: 2,
      cards: [
        { artifactId: "attack_up", resultingStackCount: 1 },
        { artifactId: "dash_attack_up", resultingStackCount: 1 },
        { artifactId: "mobility_cooldown_down", resultingStackCount: 1 },
      ],
    });
  });

  it("never offers a Major on an ordinary wave, even when one is eligible", () => {
    const offer = generateRewardOffer({
      artifacts: MAJORS,
      build: createEmptyRunBuild(),
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toBeUndefined();
  });

  it("renders only the available cards when fewer than three Minors are eligible", () => {
    const offer = generateRewardOffer({
      artifacts: [ATTACK_UP, DASH_ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer?.cards).toHaveLength(2);
  });

  it("carries the next stack count for a partly-owned Minor and excludes a capped one", () => {
    const build = withArtifactStackCount(
      withArtifactStackCount(createEmptyRunBuild(), "attack_up", 2),
      "dash_attack_up",
      3,
    );
    const offer = generateRewardOffer({
      artifacts: [ATTACK_UP, DASH_ATTACK_UP, MOBILITY_COOLDOWN_DOWN],
      build,
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer?.cards).toEqual([
      { artifactId: "attack_up", resultingStackCount: 3 },
      { artifactId: "mobility_cooldown_down", resultingStackCount: 1 },
    ]);
  });

  it("never generates speed_up or chain_dash even when supplied", () => {
    const offer = generateRewardOffer({
      artifacts: [SPEED_UP, CHAIN_DASH],
      build: createEmptyRunBuild(),
      waveNumber: 2,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toBeUndefined();
  });
});

describe("reward offer: milestone waves", () => {
  it("fills slot one with a Minor at two stacks, then eligible Majors at one stack", () => {
    const offer = generateRewardOffer({
      artifacts: [...MINORS, ...MAJORS],
      build: createEmptyRunBuild(),
      waveNumber: 3,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toEqual({
      waveNumber: 3,
      cards: [
        { artifactId: "attack_up", resultingStackCount: 2 },
        { artifactId: "guard_shredder", resultingStackCount: 1 },
        { artifactId: "execution", resultingStackCount: 1 },
      ],
    });
  });

  it("falls back per empty Major slot to another distinct Minor at two stacks", () => {
    const offer = generateRewardOffer({
      artifacts: [...MINORS, GUARD_SHREDDER],
      build: createEmptyRunBuild(),
      waveNumber: 3,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toEqual({
      waveNumber: 3,
      cards: [
        { artifactId: "attack_up", resultingStackCount: 2 },
        { artifactId: "guard_shredder", resultingStackCount: 1 },
        { artifactId: "dash_attack_up", resultingStackCount: 2 },
      ],
    });
  });

  it("uses three distinct Minor two-stack cards when no Major is eligible (a Smash run)", () => {
    const offer = generateRewardOffer({
      artifacts: [...MINORS, ...MAJORS],
      build: createEmptyRunBuild(),
      waveNumber: 3,
      playerMobilityKind: "smash",
      draw: takeInOrder,
    });
    expect(offer?.cards).toEqual([
      { artifactId: "attack_up", resultingStackCount: 2 },
      { artifactId: "dash_attack_up", resultingStackCount: 2 },
      { artifactId: "mobility_cooldown_down", resultingStackCount: 2 },
    ]);
  });

  it("excludes a one-from-cap Minor from the two-stack pool rather than partially granting", () => {
    const build = withArtifactStackCount(createEmptyRunBuild(), "max_health_up", 1);
    const offer = generateRewardOffer({
      artifacts: [MAX_HEALTH_UP],
      build,
      waveNumber: 3,
      playerMobilityKind: "dash",
      draw: takeInOrder,
    });
    expect(offer).toBeUndefined();
  });
});

describe("reward offer: determinism", () => {
  it("is a pure function of its inputs: the same draw sequence yields the same offer", () => {
    const draws = [0.9, 0.1, 0.5, 0.2];
    const makeDraw = () => {
      let index = 0;
      return () => draws[index++ % draws.length]!;
    };
    const input = {
      artifacts: [...MINORS, ...MAJORS],
      build: createEmptyRunBuild(),
      waveNumber: 3,
      playerMobilityKind: "dash" as const,
    };
    const first = generateRewardOffer({ ...input, draw: makeDraw() });
    const second = generateRewardOffer({ ...input, draw: makeDraw() });
    expect(first).toEqual(second);
    expect(first?.cards).toHaveLength(3);
  });
});
