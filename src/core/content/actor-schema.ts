export type MobilityKind = "dash" | "smash";
export type EnemyRole = "thrust" | "slash" | "ranged" | "charge" | "bomb";
export type AttackKind = "tile" | "charge" | "area";
export type CellShape = "line" | "wide" | "square" | "full-line" | "custom-offsets" | "manhattan";

export interface SemanticProfile {
  readonly id: string;
}

export interface CharacterAttack {
  readonly damage: number;
  readonly range: number;
  readonly staggerMultiplier: number;
}

export interface MobilityDefinition extends CharacterAttack {
  readonly kind: MobilityKind;
  readonly cooldown: number;
}

export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly speedFill: number;
  readonly normalAttack: CharacterAttack;
  readonly mobility: MobilityDefinition;
  readonly presentation: SemanticProfile;
  readonly audio: SemanticProfile;
}

export interface GuardDefinition {
  readonly id: string;
  readonly name: string;
  readonly base: number;
  readonly lethalTierGain: number;
  readonly stagger: number;
  readonly protection: number;
  readonly protectionMultiplier: number;
}

export interface LineShape {
  readonly shape: "line";
  readonly length: number;
}

export interface WideShape {
  readonly shape: "wide";
  readonly width: number;
  readonly depth: number;
}

export interface SquareShape {
  readonly shape: "square";
  readonly radius: number;
}

export interface FullLineShape {
  readonly shape: "full-line";
}

export interface CustomOffsetsShape {
  readonly shape: "custom-offsets";
  readonly offsets: readonly { readonly x: number; readonly y: number }[];
}

export interface ManhattanShape {
  readonly shape: "manhattan";
  readonly radius: number;
}

export type AttackShape = LineShape | WideShape | SquareShape | FullLineShape | CustomOffsetsShape | ManhattanShape;

export interface AttackDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: AttackKind;
  readonly damage: number;
  readonly warningTicks: number;
  readonly recoveryTicks: number;
  readonly shape: AttackShape;
}

export interface RangedRoleTuning {
  readonly type: "ranged";
  readonly minDistance: number;
  readonly maxDistance: number;
}

export interface BombRoleTuning {
  readonly type: "bomb";
  readonly commitment: "adjacent";
}

export type EnemyRoleTuning = RangedRoleTuning | BombRoleTuning | null;

export interface EnemyDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: EnemyRole;
  readonly speed: number;
  readonly hp: number;
  readonly defense: number;
  readonly guardId: string | null;
  readonly attackIds: readonly string[];
  readonly roleTuning: EnemyRoleTuning;
  readonly presentation: SemanticProfile;
  readonly audio: SemanticProfile;
}

export interface ActorContentInput {
  readonly characters: readonly CharacterDefinition[];
  readonly guards: readonly GuardDefinition[];
  readonly attacks: readonly AttackDefinition[];
  readonly enemies: readonly EnemyDefinition[];
}

export interface ActorContentCatalog extends ActorContentInput {
  readonly characters: readonly CharacterDefinition[];
  readonly guards: readonly GuardDefinition[];
  readonly attacks: readonly AttackDefinition[];
  readonly enemies: readonly EnemyDefinition[];
}

export interface ActorContentDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class ActorContentValidationError extends Error {
  readonly diagnostics: readonly ActorContentDiagnostic[];

  constructor(diagnostics: readonly ActorContentDiagnostic[]) {
    super(["Actor content validation failed:", ...diagnostics.map(formatDiagnostic)].join("\n"));
    this.name = "ActorContentValidationError";
    this.diagnostics = diagnostics;
  }
}

function formatDiagnostic(diagnostic: ActorContentDiagnostic): string {
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
  return typeof value === "string" && /^[a-z][a-z0-9.-]*$/.test(value);
}

function addDiagnostic(diagnostics: ActorContentDiagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ code, path, message });
}

function requireId(value: unknown, path: string, diagnostics: ActorContentDiagnostic[]): value is string {
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

function requireName(value: unknown, path: string, diagnostics: ActorContentDiagnostic[]): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    addDiagnostic(diagnostics, "invalid-display-name", path, "must be a non-empty trimmed string");
    return false;
  }
  return true;
}

function requireProfile(value: unknown, path: string, diagnostics: ActorContentDiagnostic[]): value is SemanticProfile {
  if (!isRecord(value) || !isProfileId(value.id)) {
    addDiagnostic(diagnostics, "invalid-profile-id", `${path}.id`, "must be a semantic profile identifier");
    return false;
  }
  return true;
}

function requirePositive(
  value: unknown,
  path: string,
  diagnostics: ActorContentDiagnostic[],
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
  diagnostics: ActorContentDiagnostic[],
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
  diagnostics: ActorContentDiagnostic[],
): boolean {
  if (typeof value !== "string" || !values.includes(value)) {
    addDiagnostic(diagnostics, "invalid-enum", path, `must be one of: ${values.join(", ")}`);
    return false;
  }
  return true;
}

function validateCharacter(value: unknown, index: number, diagnostics: ActorContentDiagnostic[]): void {
  const path = `characters[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requireName(value.name, `${path}.name`, diagnostics);
  requirePositive(value.hp, `${path}.hp`, diagnostics, true);
  requirePositive(value.speedFill, `${path}.speedFill`, diagnostics);
  validateCharacterAttack(value.normalAttack, `${path}.normalAttack`, diagnostics, false);
  validateCharacterAttack(value.mobility, `${path}.mobility`, diagnostics, true);
  if (isRecord(value.mobility)) {
    requireEnum(value.mobility.kind, ["dash", "smash"], `${path}.mobility.kind`, diagnostics);
    requireNonNegative(value.mobility.cooldown, `${path}.mobility.cooldown`, diagnostics, true);
  }
  requireProfile(value.presentation, `${path}.presentation`, diagnostics);
  requireProfile(value.audio, `${path}.audio`, diagnostics);
}

function validateCharacterAttack(
  value: unknown,
  path: string,
  diagnostics: ActorContentDiagnostic[],
  mobility: boolean,
): void {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requirePositive(value.damage, `${path}.damage`, diagnostics);
  requirePositive(value.range, `${path}.range`, diagnostics, true);
  requirePositive(value.staggerMultiplier, `${path}.staggerMultiplier`, diagnostics);
  if (mobility) {
    requireNonNegative(value.cooldown, `${path}.cooldown`, diagnostics, true);
  }
}

function validateGuard(value: unknown, index: number, diagnostics: ActorContentDiagnostic[]): void {
  const path = `guards[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requireName(value.name, `${path}.name`, diagnostics);
  requirePositive(value.base, `${path}.base`, diagnostics, true);
  requireNonNegative(value.lethalTierGain, `${path}.lethalTierGain`, diagnostics, true);
  requireNonNegative(value.stagger, `${path}.stagger`, diagnostics, true);
  requireNonNegative(value.protection, `${path}.protection`, diagnostics, true);
  if (!isFiniteNumber(value.protectionMultiplier) || value.protectionMultiplier < 0 || value.protectionMultiplier > 1) {
    addDiagnostic(
      diagnostics,
      "invalid-protection-multiplier",
      `${path}.protectionMultiplier`,
      "must be a finite number between zero and one",
    );
  }
}

function validateAttack(value: unknown, index: number, diagnostics: ActorContentDiagnostic[]): void {
  const path = `attacks[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requireName(value.name, `${path}.name`, diagnostics);
  const kindValid = requireEnum(value.kind, ["tile", "charge", "area"], `${path}.kind`, diagnostics);
  requirePositive(value.damage, `${path}.damage`, diagnostics);
  requireNonNegative(value.warningTicks, `${path}.warningTicks`, diagnostics, true);
  requireNonNegative(value.recoveryTicks, `${path}.recoveryTicks`, diagnostics, true);
  if (!isRecord(value.shape)) {
    addDiagnostic(diagnostics, "invalid-shape", `${path}.shape`, "must be a shape object");
    return;
  }
  const shape = value.shape;
  const shapeValid = requireEnum(
    shape.shape,
    ["line", "wide", "square", "full-line", "custom-offsets", "manhattan"],
    `${path}.shape.shape`,
    diagnostics,
  );
  if (kindValid && shapeValid && !isSupportedShape(value.kind as string, shape.shape as string)) {
    addDiagnostic(
      diagnostics,
      "unsupported-shape",
      `${path}.shape.shape`,
      `${value.kind} attacks cannot use ${shape.shape} shapes`,
    );
  }
  validateShape(shape, `${path}.shape`, diagnostics);
}

function isSupportedShape(kind: string, shape: string): boolean {
  return (
    (kind === "tile" && ["line", "wide", "square", "custom-offsets"].includes(shape)) ||
    (kind === "charge" && ["line", "full-line"].includes(shape)) ||
    (kind === "area" && ["square", "manhattan"].includes(shape))
  );
}

function validateShape(value: Record<string, unknown>, path: string, diagnostics: ActorContentDiagnostic[]): void {
  switch (value.shape) {
    case "line":
      requirePositive(value.length, `${path}.length`, diagnostics, true);
      break;
    case "wide":
      requirePositive(value.width, `${path}.width`, diagnostics, true);
      requirePositive(value.depth, `${path}.depth`, diagnostics, true);
      break;
    case "square":
    case "manhattan":
      requirePositive(value.radius, `${path}.radius`, diagnostics, true);
      break;
    case "full-line":
      break;
    case "custom-offsets":
      if (!Array.isArray(value.offsets) || value.offsets.length === 0) {
        addDiagnostic(diagnostics, "invalid-offsets", `${path}.offsets`, "must contain at least one cell");
        break;
      }
      {
        const seen = new Set<string>();
        value.offsets.forEach((offset, index) => {
          const offsetPath = `${path}.offsets[${index}]`;
          if (!isRecord(offset) || !isInteger(offset.x) || !isInteger(offset.y)) {
            addDiagnostic(diagnostics, "invalid-coordinate", offsetPath, "must contain integer x and y coordinates");
            return;
          }
          const key = `${offset.x},${offset.y}`;
          if (seen.has(key)) {
            addDiagnostic(diagnostics, "duplicate-offset", offsetPath, `duplicates cell ${key}`);
          }
          seen.add(key);
        });
      }
      break;
    default:
      break;
  }
}

function validateRoleTuning(value: unknown, role: unknown, path: string, diagnostics: ActorContentDiagnostic[]): void {
  if (role === "ranged") {
    if (!isRecord(value) || value.type !== "ranged") {
      addDiagnostic(diagnostics, "invalid-role-tuning", path, "ranged enemies require ranged tuning");
      return;
    }
    requirePositive(value.minDistance, `${path}.minDistance`, diagnostics, true);
    requirePositive(value.maxDistance, `${path}.maxDistance`, diagnostics, true);
    if (isInteger(value.minDistance) && isInteger(value.maxDistance) && value.minDistance > value.maxDistance) {
      addDiagnostic(diagnostics, "invalid-role-tuning", path, "minimum distance cannot exceed maximum distance");
    }
    return;
  }
  if (role === "bomb") {
    if (!isRecord(value) || value.type !== "bomb" || value.commitment !== "adjacent") {
      addDiagnostic(diagnostics, "invalid-role-tuning", path, "bomb enemies require adjacent commitment tuning");
    }
    return;
  }
  if (value !== null) {
    addDiagnostic(diagnostics, "invalid-role-tuning", path, `${String(role)} enemies must not have role tuning`);
  }
}

function validateEnemy(value: unknown, index: number, diagnostics: ActorContentDiagnostic[]): void {
  const path = `enemies[${index}]`;
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, "invalid-definition", path, "must be an object");
    return;
  }
  requireId(value.id, `${path}.id`, diagnostics);
  requireName(value.name, `${path}.name`, diagnostics);
  const roleValid = requireEnum(
    value.role,
    ["thrust", "slash", "ranged", "charge", "bomb"],
    `${path}.role`,
    diagnostics,
  );
  requirePositive(value.speed, `${path}.speed`, diagnostics, true);
  requirePositive(value.hp, `${path}.hp`, diagnostics, true);
  requireNonNegative(value.defense, `${path}.defense`, diagnostics, true);
  if (value.guardId !== null) {
    if (typeof value.guardId !== "string") {
      addDiagnostic(diagnostics, "invalid-reference", `${path}.guardId`, "must be a guard ID or null");
    } else {
      requireId(value.guardId, `${path}.guardId`, diagnostics);
    }
  }
  if (!Array.isArray(value.attackIds) || value.attackIds.length === 0) {
    addDiagnostic(diagnostics, "invalid-attack-list", `${path}.attackIds`, "must contain at least one attack ID");
  } else {
    const seen = new Set<string>();
    value.attackIds.forEach((attackId, attackIndex) => {
      const attackPath = `${path}.attackIds[${attackIndex}]`;
      if (!requireId(attackId, attackPath, diagnostics)) {
        return;
      }
      if (seen.has(attackId)) {
        addDiagnostic(diagnostics, "duplicate-attack-reference", attackPath, `duplicates attack ${attackId}`);
      }
      seen.add(attackId);
    });
  }
  if (roleValid) {
    validateRoleTuning(value.roleTuning, value.role, `${path}.roleTuning`, diagnostics);
  }
  requireProfile(value.presentation, `${path}.presentation`, diagnostics);
  requireProfile(value.audio, `${path}.audio`, diagnostics);
}

function validateUniqueIds(values: readonly unknown[], domain: string, diagnostics: ActorContentDiagnostic[]): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return;
    }
    if (seen.has(value.id)) {
      addDiagnostic(diagnostics, "duplicate-id", `${domain}[${index}].id`, `duplicates ${domain} ID ${value.id}`);
    }
    seen.add(value.id);
  });
}

function validateReferences(input: ActorContentInput, diagnostics: ActorContentDiagnostic[]): void {
  const guardIds = new Set(input.guards.map((guard) => guard.id));
  const attackIds = new Set(input.attacks.map((attack) => attack.id));
  input.enemies.forEach((enemyValue, index) => {
    if (!isRecord(enemyValue)) {
      return;
    }
    if (typeof enemyValue.guardId === "string" && !guardIds.has(enemyValue.guardId)) {
      addDiagnostic(
        diagnostics,
        "unknown-reference",
        `enemies[${index}].guardId`,
        `unknown guard ID ${enemyValue.guardId}`,
      );
    }
    if (!Array.isArray(enemyValue.attackIds)) {
      return;
    }
    enemyValue.attackIds.forEach((attackId, attackIndex) => {
      if (typeof attackId === "string" && !attackIds.has(attackId)) {
        addDiagnostic(
          diagnostics,
          "unknown-reference",
          `enemies[${index}].attackIds[${attackIndex}]`,
          `unknown attack ID ${attackId}`,
        );
      }
    });
  });
}

export function validateActorContent(input: unknown): readonly ActorContentDiagnostic[] {
  const diagnostics: ActorContentDiagnostic[] = [];
  if (!isRecord(input)) {
    return [{ code: "invalid-catalog", path: "content", message: "must be an object" }];
  }
  const domains = ["characters", "guards", "attacks", "enemies"] as const;
  const lists: Record<(typeof domains)[number], readonly unknown[]> = {
    characters: Array.isArray(input.characters) ? input.characters : [],
    guards: Array.isArray(input.guards) ? input.guards : [],
    attacks: Array.isArray(input.attacks) ? input.attacks : [],
    enemies: Array.isArray(input.enemies) ? input.enemies : [],
  };
  domains.forEach((domain) => {
    if (!Array.isArray(input[domain])) {
      addDiagnostic(diagnostics, "invalid-domain", domain, "must be an array");
    }
    validateUniqueIds(lists[domain], domain, diagnostics);
  });
  lists.characters.forEach((value, index) => validateCharacter(value, index, diagnostics));
  lists.guards.forEach((value, index) => validateGuard(value, index, diagnostics));
  lists.attacks.forEach((value, index) => validateAttack(value, index, diagnostics));
  lists.enemies.forEach((value, index) => validateEnemy(value, index, diagnostics));
  if (lists.enemies.every(isRecord) && lists.guards.every(isRecord) && lists.attacks.every(isRecord)) {
    validateReferences(
      {
        characters: lists.characters as readonly CharacterDefinition[],
        guards: lists.guards as unknown as readonly GuardDefinition[],
        attacks: lists.attacks as unknown as readonly AttackDefinition[],
        enemies: lists.enemies as unknown as readonly EnemyDefinition[],
      },
      diagnostics,
    );
  }
  return diagnostics;
}

function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    const clone = value.map((item) => cloneAndFreeze(item));
    return Object.freeze(clone) as T;
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

export function createActorContentCatalog(input: ActorContentInput): ActorContentCatalog {
  const diagnostics = validateActorContent(input);
  if (diagnostics.length > 0) {
    throw new ActorContentValidationError(diagnostics);
  }
  return cloneAndFreeze(input);
}
