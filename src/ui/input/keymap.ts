import type { Cell } from "@core/model/types";

/** WASD and arrow keys map to a cardinal Move direction; held for repeat. */
export const MOVE_KEYS: Readonly<Record<string, Cell>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

/** IJKL keys map to a cardinal Normal Attack direction; single-fire. */
export const ATTACK_KEYS: Readonly<Record<string, Cell>> = {
  i: { x: 0, y: -1 },
  j: { x: -1, y: 0 },
  k: { x: 0, y: 1 },
  l: { x: 1, y: 0 },
};

/** Held to enter the pointer Mobility (Dash/Smash) mode; releasing returns to Attack. */
export const MOBILITY_MODIFIER_KEY = "Alt";

/** Single-character keys compare case-insensitively; named keys (arrows, Alt) compare verbatim. */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}
