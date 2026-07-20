import { describe, expect, it } from "vitest";
import type { ArtifactDefinition } from "../../../../src/core/content/artifact-schema";
import type { RunBuildState } from "../../../../src/core/model/types";
import {
  channelEffectAmount,
  createEmptyRunBuild,
  generateSingleCardOffer,
  getArtifactStackCount,
  isArtifactEligible,
  withArtifactStackCount,
} from "../../../../src/core/rewards/run-build";

const ATTACK_UP: ArtifactDefinition = {
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
};

const HIGH_MIN_WAVE: ArtifactDefinition = {
  ...ATTACK_UP,
  id: "late_artifact",
  minWave: 5,
};

const TRIGGER_ARTIFACT: ArtifactDefinition = {
  ...ATTACK_UP,
  id: "guard_shredder",
  category: "major",
  requiredMobility: "dash",
  effects: [{ kind: "trigger", trigger: "guard-shredder" }],
};

describe("run-build: stack bookkeeping", () => {
  it("starts empty and reports zero stacks for anything unseen", () => {
    const build = createEmptyRunBuild();
    expect(build).toEqual({ stacks: {} });
    expect(getArtifactStackCount(build, "attack_up")).toBe(0);
  });

  it("returns a new build with the artifact's stack count set, leaving the input untouched", () => {
    const build = createEmptyRunBuild();
    const next = withArtifactStackCount(build, "attack_up", 1);
    expect(getArtifactStackCount(next, "attack_up")).toBe(1);
    expect(getArtifactStackCount(build, "attack_up")).toBe(0);
    expect(build).toEqual({ stacks: {} });
  });

  it("preserves other artifacts' stacks when one is updated", () => {
    const build: RunBuildState = { stacks: { attack_up: 2, dash_attack_up: 1 } };
    const next = withArtifactStackCount(build, "attack_up", 3);
    expect(next).toEqual({ stacks: { attack_up: 3, dash_attack_up: 1 } });
  });
});

describe("run-build: eligibility", () => {
  it("is eligible below its stack cap and at or after its minimum wave", () => {
    expect(isArtifactEligible(ATTACK_UP, 0, 1)).toBe(true);
    expect(isArtifactEligible(ATTACK_UP, 2, 1)).toBe(true);
  });

  it("is ineligible once the stack cap is reached", () => {
    expect(isArtifactEligible(ATTACK_UP, 3, 1)).toBe(false);
  });

  it("is ineligible before its minimum wave", () => {
    expect(isArtifactEligible(HIGH_MIN_WAVE, 0, 4)).toBe(false);
    expect(isArtifactEligible(HIGH_MIN_WAVE, 0, 5)).toBe(true);
  });
});

describe("run-build: channel effect amount", () => {
  it("returns the amount for a matching channel effect", () => {
    expect(channelEffectAmount(ATTACK_UP, "normal-attack-damage")).toBe(10);
  });

  it("returns undefined for a non-matching channel", () => {
    expect(channelEffectAmount(ATTACK_UP, "mobility-attack-damage")).toBeUndefined();
  });

  it("returns undefined for a trigger effect", () => {
    expect(channelEffectAmount(TRIGGER_ARTIFACT, "normal-attack-damage")).toBeUndefined();
  });
});

describe("run-build: single-card offer generation", () => {
  it("offers the sole eligible candidate at stack one", () => {
    const offer = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 1,
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
      draw: () => 0,
    });
    expect(offer).toBeUndefined();
  });

  it("returns undefined when no candidates are supplied", () => {
    const offer = generateSingleCardOffer({
      artifacts: [],
      build: createEmptyRunBuild(),
      waveNumber: 1,
      draw: () => 0,
    });
    expect(offer).toBeUndefined();
  });

  it("excludes an ineligible candidate and offers only what remains", () => {
    const offer = generateSingleCardOffer({
      artifacts: [HIGH_MIN_WAVE, ATTACK_UP],
      build: createEmptyRunBuild(),
      waveNumber: 1,
      draw: () => 0,
    });
    expect(offer?.cards).toEqual([{ artifactId: "attack_up", resultingStackCount: 1 }]);
  });

  it("is a pure function of its inputs: the same draw sequence yields the same offer", () => {
    const build = createEmptyRunBuild();
    const first = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 2,
      draw: () => 0.4,
    });
    const second = generateSingleCardOffer({
      artifacts: [ATTACK_UP],
      build,
      waveNumber: 2,
      draw: () => 0.4,
    });
    expect(first).toEqual(second);
  });
});
