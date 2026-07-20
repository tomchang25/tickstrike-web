import { describe, expect, it } from "vitest";
import { actorCatalog } from "@content/actor-catalog";

describe("canonical actor content", () => {
  it("contains the complete shipped inventory", () => {
    expect(actorCatalog.characters.map((entry) => entry.id)).toEqual(["ninja", "viking"]);
    expect(actorCatalog.guards.map((entry) => entry.id)).toEqual(["small", "heavy"]);
    expect(actorCatalog.attacks).toHaveLength(5);
    expect(actorCatalog.enemies.map((entry) => entry.id)).toEqual([
      "thrust_enemy",
      "slash_enemy",
      "ranged_enemy",
      "charge_enemy",
      "bomb_enemy",
    ]);
  });

  it("records the effective character values", () => {
    expect(actorCatalog.characters).toMatchObject([
      {
        id: "ninja",
        name: "Ninja",
        hp: 100,
        speedFill: 20,
        normalAttack: { damage: 20, range: 1, staggerMultiplier: 1 },
        mobility: { kind: "dash", damage: 30, range: 5, cooldown: 4, staggerMultiplier: 2 },
        presentation: { id: "character.ninja" },
        audio: { id: "player.combat" },
      },
      {
        id: "viking",
        name: "Viking",
        hp: 100,
        speedFill: 10,
        normalAttack: { damage: 20, range: 1, staggerMultiplier: 1 },
        mobility: { kind: "smash", damage: 30, range: 3, cooldown: 6, staggerMultiplier: 2 },
        presentation: { id: "character.viking" },
        audio: { id: "player.combat" },
      },
    ]);
  });

  it("records guard values, attack payloads, and every enemy assignment", () => {
    expect(
      actorCatalog.guards.map(({ id, base, lethalTierGain }) => ({ id, base, lethalTierGain })),
    ).toEqual([
      { id: "small", base: 32, lethalTierGain: 8 },
      { id: "heavy", base: 64, lethalTierGain: 16 },
    ]);

    const rangedCross = actorCatalog.attacks.find((attack) => attack.id === "ranged_cross");
    expect(rangedCross?.shape).toEqual({
      shape: "custom-offsets",
      offsets: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ],
    });
    expect(
      actorCatalog.attacks.filter((attack) => attack.id === "thrust" || attack.id === "slash"),
    ).toMatchObject([
      { id: "thrust", warningTicks: 2, recoveryTicks: 2 },
      { id: "slash", warningTicks: 2, recoveryTicks: 2 },
    ]);

    expect(
      actorCatalog.enemies.map(({ id, guardId, attackIds }) => ({ id, guardId, attackIds })),
    ).toEqual([
      { id: "thrust_enemy", guardId: "small", attackIds: ["thrust"] },
      { id: "slash_enemy", guardId: "small", attackIds: ["slash"] },
      { id: "ranged_enemy", guardId: "small", attackIds: ["ranged_cross"] },
      { id: "charge_enemy", guardId: "heavy", attackIds: ["charge"] },
      { id: "bomb_enemy", guardId: null, attackIds: ["bomb_area"] },
    ]);
    expect(
      actorCatalog.enemies.find((enemy) => enemy.id === "charge_enemy")?.roleTuning,
    ).toBeNull();
  });
});
