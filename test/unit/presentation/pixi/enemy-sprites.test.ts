import { Texture } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEnemyPresentation,
  type EnemyWaterAnimation,
  type EnemyPresentation,
} from "@presentation/pixi/enemy-sprites";

let presentation: EnemyPresentation | undefined;
const WATER_ANIMATION: EnemyWaterAnimation = {
  sheet: Texture.WHITE,
  frameDurationsMs: [10, 10, 10, 10, 10, 10, 10, 10],
};

beforeEach(() => {
  presentation = undefined;
});

afterEach(() => {
  presentation?.reset();
});

describe("small enemy sprite profiles", () => {
  it("uses the reference four-direction, four-pose frame layout", () => {
    presentation = createEnemyPresentation("enemy.thrust", Texture.WHITE, WATER_ANIMATION);
    if (!presentation) {
      throw new Error("Thrust presentation is missing.");
    }

    expect(presentation.profileId).toBe("enemy.thrust");
    expect(presentation.palette).toBe("green");
    expect(presentation.pose).toBe("idle");
    expect(presentation.body.texture.frame).toMatchObject({ x: 0, y: 0, width: 16, height: 16 });

    presentation.setFacing({ x: -1, y: 0 });
    expect(presentation.body.texture.frame).toMatchObject({ x: 32, y: 0 });

    presentation.playPrepareAttack();
    expect(presentation.pose).toBe("prepareAttack");
    expect(presentation.body.texture.frame).toMatchObject({ x: 32, y: 32 });

    presentation.playAttackCommit();
    expect(presentation.pose).toBe("commitCue");
    expect(presentation.body.texture.frame).toMatchObject({ x: 32, y: 48 });
  });

  it("uses a fixed Slash palette sheet without a runtime filter", () => {
    const thrust = createEnemyPresentation("enemy.thrust", Texture.WHITE, WATER_ANIMATION);
    presentation = createEnemyPresentation("enemy.slash", Texture.WHITE, WATER_ANIMATION);
    if (!thrust || !presentation) {
      throw new Error("Small enemy presentations are missing.");
    }

    expect(thrust.palette).toBe("green");
    expect(thrust.body.filters ?? []).toHaveLength(0);
    expect(presentation.profileId).toBe("enemy.slash");
    expect(presentation.palette).toBe("purple");
    expect(presentation.body.filters ?? []).toHaveLength(0);
    thrust.reset();
  });

  it("uses the authored Eye profile through the small-enemy renderer path", () => {
    presentation = createEnemyPresentation("enemy.ranged", Texture.WHITE, WATER_ANIMATION);
    if (!presentation) {
      throw new Error("Ranged presentation is missing.");
    }

    expect(presentation.profileId).toBe("enemy.ranged");
    expect(presentation.palette).toBe("eye");
    expect(presentation.body.scale).toMatchObject({ x: 5, y: 5 });
    presentation.setFacing({ x: 1, y: 0 });
    expect(presentation.body.texture.frame).toMatchObject({ x: 48, y: 0, width: 16, height: 16 });
  });

  it("keeps unknown enemy archetypes on the generic renderer path", () => {
    expect(createEnemyPresentation("enemy.unknown", Texture.WHITE, WATER_ANIMATION)).toBeUndefined();
  });

  it("settles action and tint feedback back to idle base visuals", () => {
    presentation = createEnemyPresentation("enemy.slash", Texture.WHITE, WATER_ANIMATION);
    if (!presentation) {
      throw new Error("Slash presentation is missing.");
    }

    presentation.playMove().progress(1);
    expect(presentation.pose).toBe("idle");
    expect(presentation.root.position).toMatchObject({ x: 0, y: 0 });
    expect(presentation.root.scale).toMatchObject({ x: 1, y: 1 });

    presentation.playStaggered()?.progress(1);
    expect(presentation.body.tint).toBe(0x4d80ff);
    presentation.playStaggerEnded()?.progress(1);
    expect(presentation.body.tint).toBe(0xffffff);
    presentation.playDamage().progress(1);
    expect(presentation.body.tint).toBe(0xffffff);
  });

  it("plays entered-water frames from the motion direction column through the final row", () => {
    presentation = createEnemyPresentation("enemy.charge", Texture.WHITE, WATER_ANIMATION);
    if (!presentation) {
      throw new Error("Charge presentation is missing.");
    }

    presentation.beginEnteredWater({ x: -1, y: 0 });
    presentation.setEnteredWaterFrame(7);

    expect(presentation.facing).toEqual({ x: -1, y: 0 });
    expect(presentation.waterFrame).toBe(7);
    expect(presentation.body.texture.frame).toMatchObject({ x: 32, y: 112, width: 16, height: 16 });
  });
});
