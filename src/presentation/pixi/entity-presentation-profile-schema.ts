import type { EntityShadowStyle } from "./entity-shadow";

export interface EntityBodyFoot {
  readonly x: number;
  readonly y: number;
}

export interface EntityPresentationProfile {
  readonly groundY: number;
  readonly bodyFoot: EntityBodyFoot;
  readonly bodyScale: number;
  readonly shadow: EntityShadowStyle;
}

export interface EntityPresentationProfileOverride {
  readonly groundY?: number;
  readonly bodyFoot?: Partial<EntityBodyFoot>;
  readonly bodyScale?: number;
  readonly shadow?: Partial<EntityShadowStyle>;
}

export interface EntityPresentationProfileCatalog {
  readonly schemaVersion: 1;
  readonly general: EntityPresentationProfile;
  readonly profiles: Readonly<Record<string, EntityPresentationProfileOverride>>;
}

const PROFILE_KEYS = ["groundY", "bodyFoot", "bodyScale", "shadow"] as const;
const BODY_FOOT_KEYS = ["x", "y"] as const;
const SHADOW_KEYS = ["offsetX", "offsetY", "radiusX", "radiusY", "color", "alpha"] as const;

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

function optionalNumber(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : requireNumber(value, path);
}

function parseBodyFoot(value: unknown, path: string): EntityBodyFoot {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, BODY_FOOT_KEYS, path);
  return {
    x: requireNumber(record.x, `${path}.x`),
    y: requireNumber(record.y, `${path}.y`),
  };
}

function parseBodyFootOverride(value: unknown, path: string): Partial<EntityBodyFoot> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, BODY_FOOT_KEYS, path);
  return {
    ...(record.x === undefined ? {} : { x: requireNumber(record.x, `${path}.x`) }),
    ...(record.y === undefined ? {} : { y: requireNumber(record.y, `${path}.y`) }),
  };
}

function parseShadow(value: unknown, path: string): EntityShadowStyle {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, SHADOW_KEYS, path);
  const radiusX = requireNumber(record.radiusX, `${path}.radiusX`);
  const radiusY = requireNumber(record.radiusY, `${path}.radiusY`);
  const color = requireNumber(record.color, `${path}.color`);
  const alpha = requireNumber(record.alpha, `${path}.alpha`);
  if (radiusX <= 0 || radiusY <= 0) {
    throw new Error(`${path} radii must be greater than zero.`);
  }
  if (!Number.isInteger(color) || color < 0 || color > 0xffffff) {
    throw new Error(`${path}.color must be an integer from 0 to 16777215.`);
  }
  if (alpha < 0 || alpha > 1) {
    throw new Error(`${path}.alpha must be from 0 to 1.`);
  }
  return {
    offsetX: requireNumber(record.offsetX, `${path}.offsetX`),
    offsetY: requireNumber(record.offsetY, `${path}.offsetY`),
    radiusX,
    radiusY,
    color,
    alpha,
  };
}

function parseShadowOverride(value: unknown, path: string): Partial<EntityShadowStyle> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, SHADOW_KEYS, path);
  const parsed = Object.fromEntries(
    SHADOW_KEYS.flatMap((key) =>
      record[key] === undefined ? [] : [[key, requireNumber(record[key], `${path}.${key}`)]],
    ),
  ) as Partial<EntityShadowStyle>;
  if (parsed.radiusX !== undefined && parsed.radiusX <= 0) {
    throw new Error(`${path}.radiusX must be greater than zero.`);
  }
  if (parsed.radiusY !== undefined && parsed.radiusY <= 0) {
    throw new Error(`${path}.radiusY must be greater than zero.`);
  }
  if (parsed.color !== undefined && (!Number.isInteger(parsed.color) || parsed.color < 0 || parsed.color > 0xffffff)) {
    throw new Error(`${path}.color must be an integer from 0 to 16777215.`);
  }
  if (parsed.alpha !== undefined && (parsed.alpha < 0 || parsed.alpha > 1)) {
    throw new Error(`${path}.alpha must be from 0 to 1.`);
  }
  return parsed;
}

function parseProfile(value: unknown, path: string): EntityPresentationProfile {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, PROFILE_KEYS, path);
  const bodyScale = requireNumber(record.bodyScale, `${path}.bodyScale`);
  if (bodyScale <= 0) {
    throw new Error(`${path}.bodyScale must be greater than zero.`);
  }
  return {
    groundY: requireNumber(record.groundY, `${path}.groundY`),
    bodyFoot: parseBodyFoot(record.bodyFoot, `${path}.bodyFoot`),
    bodyScale,
    shadow: parseShadow(record.shadow, `${path}.shadow`),
  };
}

function parseProfileOverride(value: unknown, path: string): EntityPresentationProfileOverride {
  const record = requireRecord(value, path);
  rejectUnknownKeys(record, PROFILE_KEYS, path);
  const bodyScale = optionalNumber(record.bodyScale, `${path}.bodyScale`);
  if (bodyScale !== undefined && bodyScale <= 0) {
    throw new Error(`${path}.bodyScale must be greater than zero.`);
  }
  const bodyFoot = parseBodyFootOverride(record.bodyFoot, `${path}.bodyFoot`);
  const shadow = parseShadowOverride(record.shadow, `${path}.shadow`);
  return {
    ...(record.groundY === undefined ? {} : { groundY: requireNumber(record.groundY, `${path}.groundY`) }),
    ...(bodyFoot ? { bodyFoot } : {}),
    ...(bodyScale === undefined ? {} : { bodyScale }),
    ...(shadow ? { shadow } : {}),
  };
}

export function parseEntityPresentationProfileCatalog(value: unknown): EntityPresentationProfileCatalog {
  const record = requireRecord(value, "catalog");
  rejectUnknownKeys(record, ["schemaVersion", "general", "profiles"], "catalog");
  if (record.schemaVersion !== 1) {
    throw new Error("catalog.schemaVersion must be 1.");
  }
  const profilesRecord = requireRecord(record.profiles, "catalog.profiles");
  return {
    schemaVersion: 1,
    general: parseProfile(record.general, "catalog.general"),
    profiles: Object.fromEntries(
      Object.entries(profilesRecord).map(([profileId, profile]) => [
        profileId,
        parseProfileOverride(profile, `catalog.profiles.${profileId}`),
      ]),
    ),
  };
}

export function resolveEntityPresentationProfileFromCatalog(
  profileId: string,
  catalog: EntityPresentationProfileCatalog,
): EntityPresentationProfile {
  const override = catalog.profiles[profileId];
  return {
    groundY: override?.groundY ?? catalog.general.groundY,
    bodyFoot: {
      ...catalog.general.bodyFoot,
      ...override?.bodyFoot,
    },
    bodyScale: override?.bodyScale ?? catalog.general.bodyScale,
    shadow: {
      ...catalog.general.shadow,
      ...override?.shadow,
    },
  };
}

export function createEntityPresentationProfileOverride(
  general: EntityPresentationProfile,
  profile: EntityPresentationProfile,
): EntityPresentationProfileOverride {
  const bodyFoot = Object.fromEntries(
    BODY_FOOT_KEYS.flatMap((key) =>
      profile.bodyFoot[key] === general.bodyFoot[key] ? [] : [[key, profile.bodyFoot[key]]],
    ),
  );
  const shadow = Object.fromEntries(
    SHADOW_KEYS.flatMap((key) => (profile.shadow[key] === general.shadow[key] ? [] : [[key, profile.shadow[key]]])),
  );
  return {
    ...(profile.groundY === general.groundY ? {} : { groundY: profile.groundY }),
    ...(Object.keys(bodyFoot).length === 0 ? {} : { bodyFoot }),
    ...(profile.bodyScale === general.bodyScale ? {} : { bodyScale: profile.bodyScale }),
    ...(Object.keys(shadow).length === 0 ? {} : { shadow }),
  };
}
