import { describe, expect, it } from "vitest";
import { ATTACK_KEYS, MOBILITY_MODIFIER_KEY, MOVE_KEYS, normalizeKey } from "@ui/input/keymap";

describe("normalizeKey", () => {
  it("lowercases single-character keys so WASD and IJKL match regardless of shift or caps", () => {
    expect(normalizeKey("W")).toBe("w");
    expect(normalizeKey("L")).toBe("l");
    expect(normalizeKey("a")).toBe("a");
  });

  it("passes named keys through verbatim", () => {
    expect(normalizeKey("ArrowUp")).toBe("ArrowUp");
    expect(normalizeKey("Alt")).toBe("Alt");
  });
});

describe("key tables", () => {
  it("maps every move key to a distinct cardinal direction", () => {
    expect(MOVE_KEYS.w).toEqual({ x: 0, y: -1 });
    expect(MOVE_KEYS.ArrowUp).toEqual({ x: 0, y: -1 });
    expect(MOVE_KEYS.s).toEqual({ x: 0, y: 1 });
    expect(MOVE_KEYS.a).toEqual({ x: -1, y: 0 });
    expect(MOVE_KEYS.d).toEqual({ x: 1, y: 0 });
    expect(MOVE_KEYS.ArrowRight).toEqual({ x: 1, y: 0 });
  });

  it("maps the IJKL attack keys to cardinal directions", () => {
    expect(ATTACK_KEYS.i).toEqual({ x: 0, y: -1 });
    expect(ATTACK_KEYS.j).toEqual({ x: -1, y: 0 });
    expect(ATTACK_KEYS.k).toEqual({ x: 0, y: 1 });
    expect(ATTACK_KEYS.l).toEqual({ x: 1, y: 0 });
  });

  it("names Alt as the Mobility modifier", () => {
    expect(MOBILITY_MODIFIER_KEY).toBe("Alt");
  });
});
