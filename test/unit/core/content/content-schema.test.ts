import { describe, expect, it } from "vitest";
import {
  ContentCatalogValidationError,
  createContentCatalog,
  validateContentCatalog,
} from "../../../../src/core/content/content-schema";
import { actorCatalog } from "../../../../src/content/actor-catalog";
import { artifactCatalog } from "../../../../src/content/artifact-catalog";
import { waveCatalog } from "../../../../src/content/wave-catalog";

const validInput = { actor: actorCatalog, wave: waveCatalog, artifact: artifactCatalog };

describe("content catalog aggregation", () => {
  it("loads the complete Port 1 inventory in authored order", () => {
    const catalog = createContentCatalog(validInput);

    expect(catalog.actor.characters.map((value) => value.id)).toEqual(["ninja", "viking"]);
    expect(catalog.actor.guards).toHaveLength(4);
    expect(catalog.actor.attacks).toHaveLength(15);
    expect(catalog.actor.enemies).toHaveLength(7);
    expect(catalog.wave.groups).toHaveLength(7);
    expect(catalog.wave.demoWaves).toHaveLength(10);
    expect(catalog.wave.endlessTemplate.id).toBe("endless");
    expect(catalog.artifact.artifacts).toHaveLength(9);
    expect(catalog.wave.demoWaves[9]?.id).toBe("demo-10");
    expect(catalog.actor.enemies[6]?.attackIds).toEqual([
      "mode_boss_tile_wide",
      "mode_boss_tile_square",
      "mode_boss_tile_line",
      "mode_boss_charge",
      "mode_boss_area",
    ]);
  });

  it("rejects missing cross-catalog references and unavailable Mobility deterministically", () => {
    const malformed = {
      actor: {
        ...actorCatalog,
        characters: actorCatalog.characters.map((character) => ({
          ...character,
          mobility: { ...character.mobility, kind: "smash" as const },
        })),
      },
      wave: {
        ...waveCatalog,
        groups: waveCatalog.groups.map((group, index) =>
          index === 0
            ? { ...group, entries: [{ ...group.entries[0]!, enemyId: "missing-enemy" }] }
            : group,
        ),
      },
      artifact: artifactCatalog,
    };

    expect(validateContentCatalog(malformed).map(({ code, path }) => `${code}:${path}`)).toContain(
      "unknown-reference:wave.groups[0].entries[0].enemyId",
    );
    expect(validateContentCatalog(malformed).map(({ code, path }) => `${code}:${path}`)).toContain(
      "missing-mobility:artifact.artifacts[6].requiredMobility",
    );
    expect(() => createContentCatalog(malformed as never)).toThrow(ContentCatalogValidationError);
  });

  it("reports incomplete leaf domains instead of dereferencing malformed input", () => {
    expect(validateContentCatalog({ actor: {}, wave: {}, artifact: {} })).toEqual([
      { code: "invalid-domain", path: "actor.characters", message: "must be an array" },
      { code: "invalid-domain", path: "actor.guards", message: "must be an array" },
      { code: "invalid-domain", path: "actor.attacks", message: "must be an array" },
      { code: "invalid-domain", path: "actor.enemies", message: "must be an array" },
      { code: "invalid-domain", path: "wave.groups", message: "must be an array" },
      { code: "invalid-domain", path: "wave.demoWaves", message: "must be an array" },
      { code: "invalid-domain", path: "artifact.artifacts", message: "must be an array" },
      { code: "invalid-domain", path: "wave.endlessTemplate", message: "must be a wave definition" },
      { code: "invalid-domain", path: "wave.progressionProfile", message: "must be a progression profile" },
    ]);
  });

  it("keeps accepted leaf catalogs and the aggregate immutable", () => {
    const catalog = createContentCatalog(validInput);

    expect(catalog.actor).toBe(actorCatalog);
    expect(catalog.wave).toBe(waveCatalog);
    expect(catalog.artifact).toBe(artifactCatalog);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.actor.characters[0])).toBe(true);
    expect(Object.isFrozen(catalog.wave.groups[0]?.entries)).toBe(true);
    expect(Object.isFrozen(catalog.artifact.artifacts[6]?.effects)).toBe(true);
  });
});
