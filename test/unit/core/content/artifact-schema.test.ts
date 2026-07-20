import { describe, expect, it } from "vitest";
import {
  ArtifactContentValidationError,
  createArtifactContentCatalog,
  validateArtifactContent,
  type ArtifactContentInput,
} from "@core/content/artifact-schema";

const validContent: ArtifactContentInput = {
  artifacts: [
    {
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
    },
    {
      id: "chain_dash",
      name: "Chain Dash",
      descriptionTemplate: "Dash hits (%d)",
      category: "major",
      maxStacks: 1,
      exclusivityGroup: "",
      isCurse: false,
      minWave: 2,
      magnitude: 1,
      requiredMobility: "dash",
      effects: [{ kind: "trigger", trigger: "chain-dash" }],
      presentation: { id: "artifact.chain_dash" },
    },
  ],
};

describe("artifact content validation", () => {
  it("returns deterministic aggregate diagnostics without normalizing authored input", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const artifact = (malformed.artifacts as Array<Record<string, unknown>>)[0]!;
    artifact.id = "Bad ID";
    artifact.category = "unknown";
    artifact.maxStacks = 0;
    artifact.requiredMobility = "teleport";
    artifact.presentation = { id: "Bad Profile" };
    const effect = (artifact.effects as Array<Record<string, unknown>>)[0]!;
    effect.channel = "unknown-channel";
    effect.amount = Number.NaN;

    const diagnostics = validateArtifactContent(malformed);

    expect(diagnostics.map(({ code, path }) => `${code}:${path}`)).toEqual([
      "invalid-id:artifacts[0].id",
      "invalid-enum:artifacts[0].category",
      "invalid-positive-integer:artifacts[0].maxStacks",
      "invalid-enum:artifacts[0].requiredMobility",
      "invalid-enum:artifacts[0].effects[0].channel",
      "invalid-positive-number:artifacts[0].effects[0].amount",
      "invalid-profile-id:artifacts[0].presentation.id",
    ]);
    expect(artifact.id).toBe("Bad ID");
  });

  it("rejects unsupported category effects and invalid numeric domains together", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const artifact = (malformed.artifacts as Array<Record<string, unknown>>)[1]!;
    artifact.requiredMobility = null;
    artifact.effects = [{ kind: "channel", channel: "speed", amount: 1 }];
    artifact.minWave = 1.5;

    expect(() =>
      createArtifactContentCatalog(malformed as unknown as ArtifactContentInput),
    ).toThrow(ArtifactContentValidationError);
    expect(validateArtifactContent(malformed).map(({ code }) => code)).toEqual([
      "invalid-positive-integer",
      "invalid-mobility-requirement",
      "unsupported-effect",
    ]);
  });

  it("rejects empty effects, duplicate IDs, and invalid stack declarations", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const artifacts = malformed.artifacts as Array<Record<string, unknown>>;
    artifacts[1]!.id = artifacts[0]!.id;
    artifacts[0]!.effects = [];
    artifacts[1]!.maxStacks = 1.25;

    expect(validateArtifactContent(malformed).map(({ code, path }) => `${code}:${path}`)).toEqual([
      "duplicate-id:artifacts[1].id",
      "empty-effects:artifacts[0].effects",
      "invalid-positive-integer:artifacts[1].maxStacks",
    ]);
  });

  it("preserves authored order and recursively freezes accepted content", () => {
    const catalog = createArtifactContentCatalog(validContent);

    expect(catalog.artifacts.map((artifact) => artifact.id)).toEqual(["attack_up", "chain_dash"]);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.artifacts)).toBe(true);
    expect(Object.isFrozen(catalog.artifacts[0]!.effects[0])).toBe(true);
    expect(Object.isFrozen(catalog.artifacts[1]!.presentation)).toBe(true);
    expect(() => {
      (catalog.artifacts[0]!.effects[0] as { amount: number }).amount = 99;
    }).toThrow();
  });
});
