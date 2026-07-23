import { Texture } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlayerSprite, setNinjaSpriteSheet } from "@presentation/pixi/character-sprites";
import { resolveEntityPresentationProfile } from "@presentation/pixi/entity-presentation-profiles";

beforeEach(() => setNinjaSpriteSheet(Texture.WHITE));
afterEach(() => setNinjaSpriteSheet(undefined));

describe("character sprite profiles", () => {
  it("creates the authored Ninja profile with an idle pose and default facing", () => {
    const sprite = createPlayerSprite("character.ninja");
    const profile = resolveEntityPresentationProfile("character.ninja");

    expect(sprite).toBeDefined();
    expect(sprite?.profileId).toBe("character.ninja");
    expect(sprite?.pose).toBe("idle");
    expect(sprite?.facing).toEqual({ x: 1, y: 0 });
    expect(sprite?.body.scale.x).toBe(profile.bodyScale);
    expect(sprite?.body.anchor).toMatchObject({ x: profile.bodyFoot.x / 16, y: profile.bodyFoot.y / 16 });
    expect(sprite?.body.position.y).toBe(0);
    expect(sprite?.rig.groundRoot.position.y).toBe(profile.groundY);
    expect(sprite?.root.children).toEqual([sprite?.rig.groundRoot]);
    expect(sprite?.rig.groundRoot.children).toEqual([sprite?.rig.shadow, sprite?.rig.actorRoot]);
    // Body first, then the batto weapon layer stacked above it (hidden until a batto pose).
    expect(sprite?.rig.actorRoot.children[0]).toBe(sprite?.body);
    expect(sprite?.rig.actorRoot.children).toHaveLength(2);
  });

  it("projects cardinal facing and a transient dash pose without a core state", () => {
    const sprite = createPlayerSprite("character.ninja");
    if (!sprite) {
      throw new Error("Ninja profile is missing.");
    }

    sprite.setFacing({ x: 0, y: -1 });
    const idleTexture = sprite.body.texture;
    sprite.setPose("dash");

    expect(sprite.facing).toEqual({ x: 0, y: -1 });
    expect(sprite.pose).toBe("dash");
    expect(sprite.body.texture).not.toBe(idleTexture);

    sprite.setPose("idle");
    expect(sprite.pose).toBe("idle");
    expect(sprite.body.texture).toBe(idleTexture);
  });

  it("uses the authored movement rows for repeated move poses", () => {
    const sprite = createPlayerSprite("character.ninja");
    if (!sprite) {
      throw new Error("Ninja profile is missing.");
    }

    sprite.setPose("move");
    const firstMoveTexture = sprite.body.texture;
    sprite.setPose("move");

    expect(sprite.pose).toBe("move");
    expect(sprite.body.texture).not.toBe(firstMoveTexture);
  });

  it("keeps the movement row when facing changes during movement", () => {
    const sprite = createPlayerSprite("character.ninja");
    if (!sprite) {
      throw new Error("Ninja profile is missing.");
    }

    sprite.setPose("move");
    sprite.setFacing({ x: 0, y: -1 });

    expect(sprite.pose).toBe("move");
    expect(sprite.body.texture.frame.y).toBe(16);
  });

  it("does not invent a visual profile for an unknown archetype", () => {
    expect(createPlayerSprite("character.unknown")).toBeUndefined();
  });
});
