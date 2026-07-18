import { describe, expect, it } from "vitest";
import {
  ActorContentValidationError,
  createActorContentCatalog,
  validateActorContent,
  type ActorContentInput,
} from "../../../../src/core/content/actor-content";

const validContent: ActorContentInput = {
  characters: [
    {
      id: "ninja",
      name: "Ninja",
      hp: 100,
      speedFill: 20,
      normalAttack: { damage: 20, range: 1, staggerMultiplier: 1 },
      mobility: {
        kind: "dash",
        damage: 30,
        range: 5,
        cooldown: 4,
        staggerMultiplier: 2,
      },
      presentation: { id: "character.ninja" },
      audio: { id: "player.combat" },
    },
  ],
  guards: [
    {
      id: "small",
      name: "Small",
      base: 32,
      lethalTierGain: 8,
      stagger: 3,
      protection: 5,
      protectionMultiplier: 0.5,
    },
  ],
  attacks: [
    {
      id: "thrust",
      name: "Thrust",
      kind: "tile",
      damage: 10,
      warningTicks: 1,
      recoveryTicks: 1,
      shape: {
        shape: "custom-offsets",
        offsets: [{ x: 1, y: 0 }, { x: 2, y: 0 }],
      },
    },
  ],
  enemies: [
    {
      id: "thrust_enemy",
      name: "Thrust Enemy",
      role: "thrust",
      speed: 75,
      hp: 100,
      defense: 0,
      guardId: "small",
      attackIds: ["thrust"],
      roleTuning: null,
      presentation: { id: "enemy.thrust" },
      audio: { id: "enemy.guarded" },
    },
  ],
};

describe("actor content validation", () => {
  it("returns deterministic aggregate diagnostics without normalizing input", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const characters = malformed.characters as Array<Record<string, unknown>>;
    characters[0]!.id = "Bad ID";
    characters[0]!.hp = Number.NaN;
    const attacks = malformed.attacks as Array<Record<string, unknown>>;
    attacks[0]!.shape = {
      shape: "custom-offsets",
      offsets: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    };
    const enemies = malformed.enemies as Array<Record<string, unknown>>;
    enemies[0]!.guardId = "missing";

    const diagnostics = validateActorContent(malformed);

    expect(diagnostics.map(({ code, path }) => `${code}:${path}`)).toEqual([
      "invalid-id:characters[0].id",
      "invalid-positive-integer:characters[0].hp",
      "duplicate-offset:attacks[0].shape.offsets[1]",
      "unknown-reference:enemies[0].guardId",
    ]);
    expect(characters[0]!.id).toBe("Bad ID");
  });

  it("rejects invalid enum, shape, duplicate references, and non-integral values together", () => {
    const malformed = structuredClone(validContent) as unknown as Record<string, unknown>;
    const attack = (malformed.attacks as Array<Record<string, unknown>>)[0]!;
    attack.kind = "unknown";
    attack.shape = { shape: "line", length: 1.5 };
    const enemy = (malformed.enemies as Array<Record<string, unknown>>)[0]!;
    enemy.attackIds = ["thrust", "thrust"];

    expect(() => createActorContentCatalog(malformed as unknown as ActorContentInput)).toThrow(
      ActorContentValidationError,
    );
    expect(validateActorContent(malformed).map((diagnostic) => diagnostic.code)).toEqual([
      "invalid-enum",
      "invalid-positive-integer",
      "duplicate-attack-reference",
    ]);
  });

  it("preserves authored order and recursively freezes accepted content", () => {
    const catalog = createActorContentCatalog(validContent);

    expect(catalog.enemies[0]!.attackIds).toEqual(["thrust"]);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.characters[0]!.mobility)).toBe(true);
    const shape = catalog.attacks[0]!.shape;
    expect(Object.isFrozen(shape)).toBe(true);
    if (shape.shape !== "custom-offsets") throw new Error("Expected custom offsets");
    expect(Object.isFrozen(shape.offsets)).toBe(true);
    expect(() => {
      (shape.offsets as unknown as Array<{ x: number; y: number }>)[0]!.x = 99;
    }).toThrow();
  });
});
