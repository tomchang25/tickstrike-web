import type { MobilityKind } from "./actor-schema";

export type ArtifactCategory = "minor" | "major";
export type ArtifactChannel =
  | "normal-attack-damage"
  | "speed"
  | "mobility-attack-damage"
  | "mobility-cooldown"
  | "mobility-range"
  | "max-health";
export type ArtifactTrigger = "guard-shredder" | "execution" | "chain-dash";

export interface ArtifactPresentationProfile {
  readonly id: string;
}

export interface ArtifactChannelEffect {
  readonly kind: "channel";
  readonly channel: ArtifactChannel;
  readonly amount: number;
}

export interface ArtifactTriggerEffect {
  readonly kind: "trigger";
  readonly trigger: ArtifactTrigger;
}

export type ArtifactEffect = ArtifactChannelEffect | ArtifactTriggerEffect;

export interface ArtifactDefinition {
  readonly id: string;
  readonly name: string;
  readonly descriptionTemplate: string;
  readonly category: ArtifactCategory;
  readonly maxStacks: number;
  readonly exclusivityGroup: string;
  readonly isCurse: boolean;
  readonly minWave: number;
  readonly magnitude: number;
  readonly requiredMobility: MobilityKind | null;
  readonly effects: readonly ArtifactEffect[];
  readonly presentation: ArtifactPresentationProfile;
}

export interface ArtifactContentInput {
  readonly artifacts: readonly ArtifactDefinition[];
}

export interface ArtifactContentCatalog extends ArtifactContentInput {}

export interface ArtifactContentDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class ArtifactContentValidationError extends Error {
  readonly diagnostics: readonly ArtifactContentDiagnostic[];

  constructor(diagnostics: readonly ArtifactContentDiagnostic[]) {
    super(["Artifact content validation failed:", ...diagnostics.map(formatDiagnostic)].join("\n"));
    this.name = "ArtifactContentValidationError";
    this.diagnostics = diagnostics;
  }
}

function formatDiagnostic(diagnostic: ArtifactContentDiagnostic): string {
  return `${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]*$/.test(value);
}

function isProfileId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9._-]*$/.test(value);
}

function addDiagnostic(
  diagnostics: ArtifactContentDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function requireId(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
): boolean {
  if (!isSafeId(value)) {
    addDiagnostic(
      diagnostics,
      "invalid-id",
      path,
      "must be lowercase, non-empty, and contain only letters, numbers, underscores, or hyphens",
    );
    return false;
  }
  return true;
}

function requireText(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
  code: string,
): boolean {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    addDiagnostic(diagnostics, code, path, "must be a non-empty trimmed string");
    return false;
  }
  return true;
}

function requirePositive(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
  integer = false,
): boolean {
  if ((integer ? !isInteger(value) : !isFiniteNumber(value)) || (value as number) <= 0) {
    addDiagnostic(
      diagnostics,
      integer ? "invalid-positive-integer" : "invalid-positive-number",
      path,
      integer ? "must be a positive integer" : "must be a finite number greater than zero",
    );
    return false;
  }
  return true;
}

function requireEnum(
  value: unknown,
  values: readonly string[],
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
): boolean {
  if (typeof value !== "string" || !values.includes(value)) {
    addDiagnostic(diagnostics, "invalid-enum", path, `must be one of: ${values.join(", ")}`);
    return false;
  }
  return true;
}

function requireBoolean(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
): boolean {
  if (typeof value !== "boolean") {
    addDiagnostic(diagnostics, "invalid-boolean", path, "must be true or false");
    return false;
  }
  return true;
}

function validatePresentation(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
): void {
  if (!isRecord(value) || !isProfileId(value.id)) {
    addDiagnostic(
      diagnostics,
      "invalid-profile-id",
      `${path}.id`,
      "must be a semantic profile identifier",
    );
  }
}

function validateEffect(
  value: unknown,
  path: string,
  diagnostics: ArtifactContentDiagnostic[],
): void {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an effect object");
    return;
  }

  requireEnum(value.kind, ["channel", "trigger"], `${path}.kind`, diagnostics);
  if (value.kind === "channel") {
    requireEnum(
      value.channel,
      [
        "normal-attack-damage",
        "speed",
        "mobility-attack-damage",
        "mobility-cooldown",
        "mobility-range",
        "max-health",
      ],
      `${path}.channel`,
      diagnostics,
    );
    requirePositive(value.amount, `${path}.amount`, diagnostics);
  } else if (value.kind === "trigger") {
    requireEnum(
      value.trigger,
      ["guard-shredder", "execution", "chain-dash"],
      `${path}.trigger`,
      diagnostics,
    );
  }
}

function validateEffectList(
  value: unknown,
  path: string,
  category: unknown,
  diagnostics: ArtifactContentDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    addDiagnostic(diagnostics, "empty-effects", path, "must contain at least one effect");
    return;
  }

  value.forEach((effect, index) => validateEffect(effect, `${path}[${index}]`, diagnostics));

  if (value.length !== 1) {
    addDiagnostic(
      diagnostics,
      "invalid-effect-list",
      path,
      "must contain exactly one shipped effect",
    );
  }
  const effect = value[0];
  if (!isRecord(effect)) {
    return;
  }
  if (category === "minor" && effect.kind === "trigger") {
    addDiagnostic(
      diagnostics,
      "unsupported-effect",
      `${path}[0].kind`,
      "minor artifacts require a channel effect",
    );
  }
  if (category === "major" && effect.kind === "channel") {
    addDiagnostic(
      diagnostics,
      "unsupported-effect",
      `${path}[0].kind`,
      "major artifacts require a trigger effect",
    );
  }
}

function validateArtifact(
  value: unknown,
  index: number,
  diagnostics: ArtifactContentDiagnostic[],
): void {
  const path = `artifacts[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }

  requireId(value.id, `${path}.id`, diagnostics);
  requireText(value.name, `${path}.name`, diagnostics, "invalid-display-name");
  requireText(
    value.descriptionTemplate,
    `${path}.descriptionTemplate`,
    diagnostics,
    "invalid-description-template",
  );
  const categoryValid = requireEnum(
    value.category,
    ["minor", "major"],
    `${path}.category`,
    diagnostics,
  );
  requirePositive(value.maxStacks, `${path}.maxStacks`, diagnostics, true);
  if (
    typeof value.exclusivityGroup !== "string" ||
    (!value.exclusivityGroup && value.exclusivityGroup !== "")
  ) {
    addDiagnostic(
      diagnostics,
      "invalid-exclusivity-group",
      `${path}.exclusivityGroup`,
      "must be an empty or safe identifier",
    );
  } else if (value.exclusivityGroup !== "" && !isSafeId(value.exclusivityGroup)) {
    addDiagnostic(
      diagnostics,
      "invalid-exclusivity-group",
      `${path}.exclusivityGroup`,
      "must be an empty or safe identifier",
    );
  }
  requireBoolean(value.isCurse, `${path}.isCurse`, diagnostics);
  requirePositive(value.minWave, `${path}.minWave`, diagnostics, true);
  requirePositive(value.magnitude, `${path}.magnitude`, diagnostics);

  if (value.requiredMobility !== null) {
    requireEnum(value.requiredMobility, ["dash", "smash"], `${path}.requiredMobility`, diagnostics);
  }
  if (categoryValid && value.category === "major" && value.requiredMobility !== "dash") {
    addDiagnostic(
      diagnostics,
      "invalid-mobility-requirement",
      `${path}.requiredMobility`,
      "major artifacts require dash Mobility",
    );
  }
  if (categoryValid && value.category === "minor" && value.requiredMobility !== null) {
    addDiagnostic(
      diagnostics,
      "invalid-mobility-requirement",
      `${path}.requiredMobility`,
      "minor artifacts must not require Mobility",
    );
  }

  validateEffectList(value.effects, `${path}.effects`, value.category, diagnostics);
  validatePresentation(value.presentation, `${path}.presentation`, diagnostics);
}

function validateUniqueIds(
  values: readonly unknown[],
  diagnostics: ArtifactContentDiagnostic[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return;
    }
    if (seen.has(value.id)) {
      addDiagnostic(
        diagnostics,
        "duplicate-id",
        `artifacts[${index}].id`,
        `duplicates artifact ID ${value.id}`,
      );
    }
    seen.add(value.id);
  });
}

export function validateArtifactContent(input: unknown): readonly ArtifactContentDiagnostic[] {
  const diagnostics: ArtifactContentDiagnostic[] = [];
  if (!isRecord(input)) {
    return [{ code: "invalid-catalog", path: "content", message: "must be an object" }];
  }
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
  if (!Array.isArray(input.artifacts)) {
    addDiagnostic(diagnostics, "invalid-domain", "artifacts", "must be an array");
  }
  validateUniqueIds(artifacts, diagnostics);
  artifacts.forEach((artifact, index) => validateArtifact(artifact, index, diagnostics));
  return diagnostics;
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreeze(item))) as T;
  }
  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, item]) => {
      clone[key] = cloneAndFreeze(item);
    });
    return Object.freeze(clone) as T;
  }
  return value;
}

export function createArtifactContentCatalog(input: ArtifactContentInput): ArtifactContentCatalog {
  const diagnostics = validateArtifactContent(input);
  if (diagnostics.length > 0) {
    throw new ArtifactContentValidationError(diagnostics);
  }
  return cloneAndFreeze(input);
}
