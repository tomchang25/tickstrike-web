import { describe, expect, it } from "vitest";
import {
  createEntityPresentationProfileOverride,
  entityPresentationProfileCatalog,
  parseEntityPresentationProfileCatalog,
  resolveEntityPresentationProfile,
} from "@presentation/pixi/entity-presentation-profiles";

describe("entity presentation profiles", () => {
  it("uses General when an entity has no specific override", () => {
    expect(resolveEntityPresentationProfile("character.ninja")).toEqual(entityPresentationProfileCatalog.general);
  });

  it("merges a sparse entity override onto General", () => {
    const ranged = resolveEntityPresentationProfile("enemy.ranged");

    expect(ranged.bodyScale).toBe(entityPresentationProfileCatalog.profiles["enemy.ranged"]?.bodyScale);
    expect(ranged.groundY).toBe(entityPresentationProfileCatalog.general.groundY);
    expect(ranged.bodyFoot).toEqual(entityPresentationProfileCatalog.general.bodyFoot);
    expect(ranged.shadow).toEqual(entityPresentationProfileCatalog.general.shadow);
  });

  it("exports only values that differ from General", () => {
    const override = createEntityPresentationProfileOverride(entityPresentationProfileCatalog.general, {
      ...entityPresentationProfileCatalog.general,
      bodyScale: 4,
      shadow: { ...entityPresentationProfileCatalog.general.shadow, offsetY: 3 },
    });

    expect(override).toEqual({ bodyScale: 4, shadow: { offsetY: 3 } });
  });

  it("validates imported JSON before resolving it", () => {
    const catalog = parseEntityPresentationProfileCatalog({
      schemaVersion: 1,
      general: entityPresentationProfileCatalog.general,
      profiles: {
        "enemy.charge": { bodyScale: 4.2, shadow: { radiusX: 24 } },
      },
    });

    expect(resolveEntityPresentationProfile("enemy.charge", catalog)).toMatchObject({
      bodyScale: 4.2,
      shadow: { radiusX: 24, radiusY: entityPresentationProfileCatalog.general.shadow.radiusY },
    });
    expect(() =>
      parseEntityPresentationProfileCatalog({
        schemaVersion: 1,
        general: { ...entityPresentationProfileCatalog.general, shadow: { alpha: 2 } },
        profiles: {},
      }),
    ).toThrow(/catalog\.general\.shadow/);
  });
});
