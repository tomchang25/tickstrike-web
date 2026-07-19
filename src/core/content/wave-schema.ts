import type { ActorContentInput } from "./actor-schema";

export type WaveCompositionMode = "fixed" | "weighted";
export type PlacementStrategy = "player-ring" | "anchor-cluster" | "scatter";
export type WaveStartCondition =
  "previous-group-cleared" | "previous-group-survivors-at-most" | "immediate-overlap";

export interface FixedCompositionEntry {
  readonly enemyId: string;
  readonly count: number;
}

export interface WeightedCompositionEntry {
  readonly enemyId: string;
  readonly weight: number;
}

export interface FixedSpawnGroupDefinition {
  readonly id: string;
  readonly placementStrategy: PlacementStrategy;
  readonly compositionMode: "fixed";
  readonly weightedTotalCount: number;
  readonly entries: readonly FixedCompositionEntry[];
}

export interface WeightedSpawnGroupDefinition {
  readonly id: string;
  readonly placementStrategy: PlacementStrategy;
  readonly compositionMode: "weighted";
  readonly weightedTotalCount: number;
  readonly entries: readonly WeightedCompositionEntry[];
}

export type SpawnGroupDefinition = FixedSpawnGroupDefinition | WeightedSpawnGroupDefinition;

export interface WaveGroupSlot {
  readonly spawnGroupId: string;
  readonly startCondition: WaveStartCondition;
  readonly survivorThreshold: number;
  readonly warningTicks: number;
  readonly levelOffset: number;
  readonly isBoss: boolean;
}

export interface WaveDefinition {
  readonly id: string;
  readonly populationCap: number;
  readonly slots: readonly WaveGroupSlot[];
}

export interface GrowthCurve {
  readonly standardCoefficient: number;
  readonly standardExponent: number;
  readonly lethalCoefficient: number;
  readonly lethalExponent: number;
}

export interface GuardGrowthInput {
  readonly basis: "base-wave";
  readonly standardWaveLimit: number;
  readonly lethalTierCadence: number;
}

export interface WaveProgressionProfile {
  readonly lethalLevelStart: number;
  readonly hpCurve: GrowthCurve;
  readonly damageCurve: GrowthCurve;
  readonly defenseCurve: GrowthCurve;
  readonly guardGrowth: GuardGrowthInput;
}

export interface WaveContentInput {
  readonly groups: readonly SpawnGroupDefinition[];
  readonly demoWaves: readonly WaveDefinition[];
  readonly endlessTemplate: WaveDefinition;
  readonly progressionProfile: WaveProgressionProfile;
}

export interface WaveContentCatalog extends WaveContentInput {}

export interface WaveContentDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class WaveContentValidationError extends Error {
  readonly diagnostics: readonly WaveContentDiagnostic[];

  constructor(diagnostics: readonly WaveContentDiagnostic[]) {
    super(["Wave content validation failed:", ...diagnostics.map(formatDiagnostic)].join("\n"));
    this.name = "WaveContentValidationError";
    this.diagnostics = diagnostics;
  }
}

function formatDiagnostic(diagnostic: WaveContentDiagnostic): string {
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

function addDiagnostic(
  diagnostics: WaveContentDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function requireId(
  value: unknown,
  path: string,
  diagnostics: WaveContentDiagnostic[],
): value is string {
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

function requirePositive(
  value: unknown,
  path: string,
  diagnostics: WaveContentDiagnostic[],
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

function requireNonNegative(
  value: unknown,
  path: string,
  diagnostics: WaveContentDiagnostic[],
  integer = false,
): boolean {
  if ((integer ? !isInteger(value) : !isFiniteNumber(value)) || (value as number) < 0) {
    addDiagnostic(
      diagnostics,
      integer ? "invalid-non-negative-integer" : "invalid-non-negative-number",
      path,
      integer ? "must be a non-negative integer" : "must be a finite number zero or greater",
    );
    return false;
  }
  return true;
}

function requireEnum(
  value: unknown,
  values: readonly string[],
  path: string,
  diagnostics: WaveContentDiagnostic[],
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
  diagnostics: WaveContentDiagnostic[],
): boolean {
  if (typeof value !== "boolean") {
    addDiagnostic(diagnostics, "invalid-boolean", path, "must be true or false");
    return false;
  }
  return true;
}

function validateUniqueIds(
  values: readonly unknown[],
  domain: string,
  diagnostics: WaveContentDiagnostic[],
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
        `${domain}[${index}].id`,
        `duplicates ${domain} ID ${value.id}`,
      );
    }
    seen.add(value.id);
  });
}

function validateCompositionEntry(
  value: unknown,
  groupPath: string,
  index: number,
  mode: WaveCompositionMode,
  enemyIds: ReadonlySet<string>,
  diagnostics: WaveContentDiagnostic[],
): void {
  const path = `${groupPath}.entries[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  const enemyIdValid = requireId(value.enemyId, `${path}.enemyId`, diagnostics);
  if (enemyIdValid && !enemyIds.has(value.enemyId as string)) {
    addDiagnostic(
      diagnostics,
      "unknown-reference",
      `${path}.enemyId`,
      `unknown enemy ID ${value.enemyId as string}`,
    );
  }
  if (mode === "fixed") {
    requirePositive(value.count, `${path}.count`, diagnostics, true);
  } else {
    requirePositive(value.weight, `${path}.weight`, diagnostics);
  }
}

function validateGroup(
  value: unknown,
  index: number,
  enemyIds: ReadonlySet<string>,
  diagnostics: WaveContentDiagnostic[],
): void {
  const path = `groups[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requireEnum(
    value.placementStrategy,
    ["player-ring", "anchor-cluster", "scatter"],
    `${path}.placementStrategy`,
    diagnostics,
  );
  const modeValid = requireEnum(
    value.compositionMode,
    ["fixed", "weighted"],
    `${path}.compositionMode`,
    diagnostics,
  );
  requireNonNegative(value.weightedTotalCount, `${path}.weightedTotalCount`, diagnostics, true);
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    addDiagnostic(
      diagnostics,
      "empty-group",
      `${path}.entries`,
      "must contain at least one composition entry",
    );
  } else if (modeValid) {
    value.entries.forEach((entry, entryIndex) => {
      validateCompositionEntry(
        entry,
        path,
        entryIndex,
        value.compositionMode as WaveCompositionMode,
        enemyIds,
        diagnostics,
      );
    });
  }
  if (value.compositionMode === "weighted") {
    requirePositive(value.weightedTotalCount, `${path}.weightedTotalCount`, diagnostics, true);
  } else if (value.compositionMode === "fixed" && value.weightedTotalCount !== 0) {
    addDiagnostic(
      diagnostics,
      "invalid-composition-field",
      `${path}.weightedTotalCount`,
      "must be zero for fixed composition",
    );
  }
}

function validateSlot(
  value: unknown,
  wavePath: string,
  index: number,
  groupIds: ReadonlySet<string>,
  diagnostics: WaveContentDiagnostic[],
): void {
  const path = `${wavePath}.slots[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  const groupIdValid = requireId(value.spawnGroupId, `${path}.spawnGroupId`, diagnostics);
  if (groupIdValid && !groupIds.has(value.spawnGroupId as string)) {
    addDiagnostic(
      diagnostics,
      "unknown-reference",
      `${path}.spawnGroupId`,
      `unknown spawn group ID ${value.spawnGroupId as string}`,
    );
  }
  const conditionValid = requireEnum(
    value.startCondition,
    ["previous-group-cleared", "previous-group-survivors-at-most", "immediate-overlap"],
    `${path}.startCondition`,
    diagnostics,
  );
  requireNonNegative(value.survivorThreshold, `${path}.survivorThreshold`, diagnostics, true);
  requireNonNegative(value.warningTicks, `${path}.warningTicks`, diagnostics, true);
  requireNonNegative(value.levelOffset, `${path}.levelOffset`, diagnostics, true);
  requireBoolean(value.isBoss, `${path}.isBoss`, diagnostics);
  if (
    conditionValid &&
    value.startCondition !== "previous-group-survivors-at-most" &&
    value.survivorThreshold !== 0
  ) {
    addDiagnostic(
      diagnostics,
      "invalid-survivor-threshold",
      `${path}.survivorThreshold`,
      "must be zero unless startCondition is previous-group-survivors-at-most",
    );
  }
}

function groupExpansion(value: unknown): number | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return null;
  }
  if (value.compositionMode === "weighted") {
    return isInteger(value.weightedTotalCount) && value.weightedTotalCount > 0
      ? value.weightedTotalCount
      : null;
  }
  if (value.compositionMode !== "fixed") {
    return null;
  }
  let total = 0;
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isInteger(entry.count) || entry.count <= 0) {
      return null;
    }
    total += entry.count;
  }
  return total;
}

function validateWave(
  value: unknown,
  path: string,
  groupIds: ReadonlySet<string>,
  groupsById: ReadonlyMap<string, unknown>,
  diagnostics: WaveContentDiagnostic[],
): void {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requirePositive(value.populationCap, `${path}.populationCap`, diagnostics, true);
  if (!Array.isArray(value.slots) || value.slots.length === 0) {
    addDiagnostic(diagnostics, "empty-wave", `${path}.slots`, "must contain at least one slot");
    return;
  }
  value.slots.forEach((slot, slotIndex) => {
    validateSlot(slot, path, slotIndex, groupIds, diagnostics);
    if (!isRecord(slot) || typeof slot.spawnGroupId !== "string") {
      return;
    }
    const group = groupsById.get(slot.spawnGroupId);
    const expansion = groupExpansion(group);
    if (expansion !== null && isInteger(value.populationCap) && expansion > value.populationCap) {
      addDiagnostic(
        diagnostics,
        "population-cap-exceeded",
        `${path}.slots[${slotIndex}].spawnGroupId`,
        `group ${slot.spawnGroupId} can expand to ${expansion} members, exceeding populationCap ${value.populationCap}`,
      );
    }
  });
}

function validateCurve(value: unknown, path: string, diagnostics: WaveContentDiagnostic[]): void {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireNonNegative(value.standardCoefficient, `${path}.standardCoefficient`, diagnostics);
  requirePositive(value.standardExponent, `${path}.standardExponent`, diagnostics);
  requireNonNegative(value.lethalCoefficient, `${path}.lethalCoefficient`, diagnostics);
  requirePositive(value.lethalExponent, `${path}.lethalExponent`, diagnostics);
}

function validateProgression(value: unknown, diagnostics: WaveContentDiagnostic[]): void {
  const path = "progressionProfile";
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requirePositive(value.lethalLevelStart, `${path}.lethalLevelStart`, diagnostics, true);
  validateCurve(value.hpCurve, `${path}.hpCurve`, diagnostics);
  validateCurve(value.damageCurve, `${path}.damageCurve`, diagnostics);
  validateCurve(value.defenseCurve, `${path}.defenseCurve`, diagnostics);
  const guardPath = `${path}.guardGrowth`;
  if (!isRecord(value.guardGrowth)) {
    addDiagnostic(diagnostics, "invalid-definition", guardPath, "must be an object");
    return;
  }
  requireEnum(value.guardGrowth.basis, ["base-wave"], `${guardPath}.basis`, diagnostics);
  requirePositive(
    value.guardGrowth.standardWaveLimit,
    `${guardPath}.standardWaveLimit`,
    diagnostics,
    true,
  );
  requirePositive(
    value.guardGrowth.lethalTierCadence,
    `${guardPath}.lethalTierCadence`,
    diagnostics,
    true,
  );
}

export function validateWaveContent(
  input: unknown,
  actorCatalog: ActorContentInput,
): readonly WaveContentDiagnostic[] {
  const diagnostics: WaveContentDiagnostic[] = [];
  if (!isRecord(input)) {
    return [{ code: "invalid-catalog", path: "content", message: "must be an object" }];
  }

  const groups = Array.isArray(input.groups) ? input.groups : [];
  const demoWaves = Array.isArray(input.demoWaves) ? input.demoWaves : [];
  if (!Array.isArray(input.groups)) {
    addDiagnostic(diagnostics, "invalid-domain", "groups", "must be an array");
  }
  if (!Array.isArray(input.demoWaves)) {
    addDiagnostic(diagnostics, "invalid-domain", "demoWaves", "must be an array");
  }
  if (!isRecord(input.endlessTemplate)) {
    addDiagnostic(diagnostics, "invalid-domain", "endlessTemplate", "must be an object");
  }

  validateUniqueIds(groups, "groups", diagnostics);
  validateUniqueIds(demoWaves, "demoWaves", diagnostics);
  if (isRecord(input.endlessTemplate) && typeof input.endlessTemplate.id === "string") {
    const endlessId = input.endlessTemplate.id;
    if (demoWaves.some((wave) => isRecord(wave) && wave.id === endlessId)) {
      addDiagnostic(
        diagnostics,
        "duplicate-id",
        "endlessTemplate.id",
        `duplicates demoWaves ID ${endlessId}`,
      );
    }
  }

  const actorValues =
    isRecord(actorCatalog) && Array.isArray(actorCatalog.enemies) ? actorCatalog.enemies : [];
  const enemyIds = new Set(
    actorValues.flatMap((enemy) =>
      isRecord(enemy) && typeof enemy.id === "string" ? [enemy.id] : [],
    ),
  );
  const groupIds = new Set(
    groups.flatMap((group) => (isRecord(group) && typeof group.id === "string" ? [group.id] : [])),
  );
  const groupsById = new Map<string, unknown>();
  groups.forEach((group) => {
    if (isRecord(group) && typeof group.id === "string") {
      groupsById.set(group.id, group);
    }
  });

  groups.forEach((group, index) => validateGroup(group, index, enemyIds, diagnostics));
  demoWaves.forEach((wave, index) => {
    validateWave(wave, `demoWaves[${index}]`, groupIds, groupsById, diagnostics);
  });
  if (isRecord(input.endlessTemplate)) {
    validateWave(input.endlessTemplate, "endlessTemplate", groupIds, groupsById, diagnostics);
  }
  validateProgression(input.progressionProfile, diagnostics);
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

export function createWaveContentCatalog(
  input: WaveContentInput,
  actorCatalog: ActorContentInput,
): WaveContentCatalog {
  const diagnostics = validateWaveContent(input, actorCatalog);
  if (diagnostics.length > 0) {
    throw new WaveContentValidationError(diagnostics);
  }
  return cloneAndFreeze(input);
}
