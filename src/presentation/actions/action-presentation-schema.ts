// Data schema for multi-state action presentation (idle / prepare / execute / end), tuned in the
// Action Lab and (later) consumed by the runtime action presenter. Kept dependency-free so the
// Vite dev catalog writer can import and validate it without pulling Pixi into the config graph.
// Sheet keys are opaque strings here; the scene's per-action sheet registry binds them to textures
// and frame sizes. Body and weapon offsets are DIRECTIONAL (one Vec2 per cardinal facing) so a
// single direction of a single state can be calibrated without disturbing the others.

export const ACTION_DIRECTIONS = ["down", "up", "left", "right"] as const;
export type ActionDirection = (typeof ACTION_DIRECTIONS)[number];

export interface ActionVec2 {
  readonly x: number;
  readonly y: number;
}

export type ActionDirectionalOffset = Readonly<Record<ActionDirection, ActionVec2>>;

/** One frame of a directional body animation: the sheet row and how long it holds. */
export interface ActionBodyFrame {
  readonly row: number;
  readonly holdSec: number;
}

export interface ActionBreathing {
  readonly amplitudeX: number;
  readonly amplitudeY: number;
  readonly periodSec: number;
}

export interface ActionMotion {
  readonly durationSec: number;
  readonly ease: string;
}

export interface ActionAfterimage {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly fadeSec: number;
  readonly tint: number;
}

export interface ActionWeaponLayer {
  readonly sheet: string;
  readonly offset: ActionDirectionalOffset;
}

export interface ActionStatePresentation {
  readonly bodySheet: string;
  readonly bodyRow: number;
  readonly bodyOffset: ActionDirectionalOffset;
  /** When present, a directional body animation played from `bodySheet` instead of the single bodyRow. */
  readonly bodyFrames?: readonly ActionBodyFrame[];
  readonly weapon?: ActionWeaponLayer;
  readonly breathing?: ActionBreathing;
  readonly motion?: ActionMotion;
  readonly afterimage?: ActionAfterimage;
}

export const ACTION_STATE_KEYS = ["idle", "prepare", "execute", "end", "attack"] as const;
export type ActionStateKey = (typeof ACTION_STATE_KEYS)[number];

export interface ActionPresentation {
  readonly label: string;
  readonly profileId: string;
  // States are optional: each action defines only the ones it uses (the dash lifecycle vs a normal
  // attack), and the lab shows exactly the present states.
  readonly idle?: ActionStatePresentation;
  readonly prepare?: ActionStatePresentation;
  readonly execute?: ActionStatePresentation;
  readonly end?: ActionStatePresentation;
  readonly attack?: ActionStatePresentation;
}

export interface ActionPresentationCatalog {
  readonly schemaVersion: 1;
  readonly actions: Readonly<Record<string, ActionPresentation>>;
}

const GSAP_EASES = new Set([
  "none",
  "power1.in",
  "power1.out",
  "power1.inOut",
  "power2.in",
  "power2.out",
  "power2.inOut",
  "power3.in",
  "power3.out",
  "power3.inOut",
  "sine.in",
  "sine.out",
  "sine.inOut",
  "back.in",
  "back.out",
  "expo.in",
  "expo.out",
]);

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path}.${key} is not supported.`);
    }
  }
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }
  return value;
}

function parseVec2(value: unknown, path: string): ActionVec2 {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["x", "y"], path);
  return { x: requireNumber(record.x, `${path}.x`), y: requireNumber(record.y, `${path}.y`) };
}

function parseDirectionalOffset(value: unknown, path: string): ActionDirectionalOffset {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ACTION_DIRECTIONS, path);
  return {
    down: parseVec2(record.down, `${path}.down`),
    up: parseVec2(record.up, `${path}.up`),
    left: parseVec2(record.left, `${path}.left`),
    right: parseVec2(record.right, `${path}.right`),
  };
}

function parseBreathing(value: unknown, path: string): ActionBreathing {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["amplitudeX", "amplitudeY", "periodSec"], path);
  const periodSec = requireNumber(record.periodSec, `${path}.periodSec`);
  if (periodSec <= 0) {
    throw new Error(`${path}.periodSec must be greater than zero.`);
  }
  return {
    amplitudeX: requireNumber(record.amplitudeX, `${path}.amplitudeX`),
    amplitudeY: requireNumber(record.amplitudeY, `${path}.amplitudeY`),
    periodSec,
  };
}

function parseMotion(value: unknown, path: string): ActionMotion {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["durationSec", "ease"], path);
  const durationSec = requireNumber(record.durationSec, `${path}.durationSec`);
  if (durationSec <= 0) {
    throw new Error(`${path}.durationSec must be greater than zero.`);
  }
  const ease = requireString(record.ease, `${path}.ease`);
  if (!GSAP_EASES.has(ease)) {
    throw new Error(`${path}.ease "${ease}" is not an allowed easing.`);
  }
  return { durationSec, ease };
}

function parseAfterimage(value: unknown, path: string): ActionAfterimage {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["enabled", "intervalMs", "fadeSec", "tint"], path);
  const intervalMs = requireNumber(record.intervalMs, `${path}.intervalMs`);
  const fadeSec = requireNumber(record.fadeSec, `${path}.fadeSec`);
  const tint = requireNumber(record.tint, `${path}.tint`);
  if (intervalMs <= 0) {
    throw new Error(`${path}.intervalMs must be greater than zero.`);
  }
  if (fadeSec <= 0) {
    throw new Error(`${path}.fadeSec must be greater than zero.`);
  }
  if (!Number.isInteger(tint) || tint < 0 || tint > 0xffffff) {
    throw new Error(`${path}.tint must be an integer from 0 to 16777215.`);
  }
  return { enabled: requireBoolean(record.enabled, `${path}.enabled`), intervalMs, fadeSec, tint };
}

function parseWeapon(value: unknown, path: string): ActionWeaponLayer {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["sheet", "offset"], path);
  return {
    sheet: requireString(record.sheet, `${path}.sheet`),
    offset: parseDirectionalOffset(record.offset, `${path}.offset`),
  };
}

function parseBodyFrames(value: unknown, path: string): readonly ActionBodyFrame[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array.`);
  }
  if (value.length === 0) {
    throw new Error(`${path} must contain at least one frame.`);
  }
  return value.map((frame, index) => {
    const record = requireRecord(frame, `${path}[${index}]`);
    rejectUnknownKeys(record, ["row", "holdSec"], `${path}[${index}]`);
    const holdSec = requireNumber(record.holdSec, `${path}[${index}].holdSec`);
    if (holdSec <= 0) {
      throw new Error(`${path}[${index}].holdSec must be greater than zero.`);
    }
    return { row: requireNumber(record.row, `${path}[${index}].row`), holdSec };
  });
}

function parseState(value: unknown, path: string): ActionStatePresentation {
  const record = requireRecord(value, path);
  rejectUnknownKeys(
    record,
    ["bodySheet", "bodyRow", "bodyOffset", "bodyFrames", "weapon", "breathing", "motion", "afterimage"],
    path,
  );
  return {
    bodySheet: requireString(record.bodySheet, `${path}.bodySheet`),
    bodyRow: requireNumber(record.bodyRow, `${path}.bodyRow`),
    bodyOffset: parseDirectionalOffset(record.bodyOffset, `${path}.bodyOffset`),
    ...(record.bodyFrames === undefined
      ? {}
      : { bodyFrames: parseBodyFrames(record.bodyFrames, `${path}.bodyFrames`) }),
    ...(record.weapon === undefined ? {} : { weapon: parseWeapon(record.weapon, `${path}.weapon`) }),
    ...(record.breathing === undefined ? {} : { breathing: parseBreathing(record.breathing, `${path}.breathing`) }),
    ...(record.motion === undefined ? {} : { motion: parseMotion(record.motion, `${path}.motion`) }),
    ...(record.afterimage === undefined
      ? {}
      : { afterimage: parseAfterimage(record.afterimage, `${path}.afterimage`) }),
  };
}

function parseAction(value: unknown, path: string): ActionPresentation {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, ["label", "profileId", "idle", "prepare", "execute", "end", "attack"], path);
  return {
    label: requireString(record.label, `${path}.label`),
    profileId: requireString(record.profileId, `${path}.profileId`),
    ...(record.idle === undefined ? {} : { idle: parseState(record.idle, `${path}.idle`) }),
    ...(record.prepare === undefined ? {} : { prepare: parseState(record.prepare, `${path}.prepare`) }),
    ...(record.execute === undefined ? {} : { execute: parseState(record.execute, `${path}.execute`) }),
    ...(record.end === undefined ? {} : { end: parseState(record.end, `${path}.end`) }),
    ...(record.attack === undefined ? {} : { attack: parseState(record.attack, `${path}.attack`) }),
  };
}

export function parseActionPresentationCatalog(value: unknown): ActionPresentationCatalog {
  const record = requireRecord(value, "catalog");
  rejectUnknownKeys(record, ["schemaVersion", "actions"], "catalog");
  if (record.schemaVersion !== 1) {
    throw new Error("catalog.schemaVersion must be 1.");
  }
  const actionsRecord = requireRecord(record.actions, "catalog.actions");
  return {
    schemaVersion: 1,
    actions: Object.fromEntries(
      Object.entries(actionsRecord).map(([actionId, action]) => [
        actionId,
        parseAction(action, `catalog.actions.${actionId}`),
      ]),
    ),
  };
}
