import type { ActorContentCatalog } from "./actor-schema";
import type { ArtifactContentCatalog } from "./artifact-schema";
import type { WaveContentCatalog } from "./wave-schema";

export interface ContentCatalogInput {
  readonly actor: ActorContentCatalog;
  readonly wave: WaveContentCatalog;
  readonly artifact: ArtifactContentCatalog;
}

export interface ContentCatalog extends ContentCatalogInput {}

export interface ContentCatalogDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class ContentCatalogValidationError extends Error {
  readonly diagnostics: readonly ContentCatalogDiagnostic[];

  constructor(diagnostics: readonly ContentCatalogDiagnostic[]) {
    super(["Content catalog validation failed:", ...diagnostics.map(formatDiagnostic)].join("\n"));
    this.name = "ContentCatalogValidationError";
    this.diagnostics = diagnostics;
  }
}

function formatDiagnostic(diagnostic: ContentCatalogDiagnostic): string {
  return `${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`;
}

function addDiagnostic(
  diagnostics: ContentCatalogDiagnostic[],
  code: string,
  path: string,
  message: string,
): void {
  diagnostics.push({ code, path, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateShape(
  input: Record<string, unknown>,
  diagnostics: ContentCatalogDiagnostic[],
): boolean {
  let valid = true;
  const domains = [
    ["actor", ["characters", "guards", "attacks", "enemies"]],
    ["wave", ["groups", "demoWaves"]],
    ["artifact", ["artifacts"]],
  ] as const;

  domains.forEach(([domain, lists]) => {
    const value = input[domain];
    if (!isRecord(value)) {
      addDiagnostic(diagnostics, "invalid-domain", domain, "must be a catalog object");
      valid = false;
      return;
    }
    lists.forEach((list) => {
      if (!Array.isArray(value[list])) {
        addDiagnostic(diagnostics, "invalid-domain", `${domain}.${list}`, "must be an array");
        valid = false;
      }
    });
  });

  const wave = input.wave;
  if (isRecord(wave) && !isRecord(wave.endlessTemplate)) {
    addDiagnostic(
      diagnostics,
      "invalid-domain",
      "wave.endlessTemplate",
      "must be a wave definition",
    );
    valid = false;
  }
  if (isRecord(wave) && !isRecord(wave.progressionProfile)) {
    addDiagnostic(
      diagnostics,
      "invalid-domain",
      "wave.progressionProfile",
      "must be a progression profile",
    );
    valid = false;
  }
  return valid;
}

function validateInventory(
  input: ContentCatalogInput,
  diagnostics: ContentCatalogDiagnostic[],
): void {
  const expected = [
    ["actor.characters", input.actor.characters.length, 2],
    ["actor.guards", input.actor.guards.length, 2],
    ["actor.attacks", input.actor.attacks.length, 5],
    ["actor.enemies", input.actor.enemies.length, 5],
    ["wave.groups", input.wave.groups.length, 6],
    ["wave.demoWaves", input.wave.demoWaves.length, 9],
    ["artifact.artifacts", input.artifact.artifacts.length, 9],
  ] as const;

  expected.forEach(([path, actual, required]) => {
    if (actual !== required) {
      addDiagnostic(
        diagnostics,
        "incomplete-inventory",
        path,
        `expected ${required} definitions, received ${actual}`,
      );
    }
  });

  const orderedIds = [
    ["actor.characters", input.actor.characters.map((value) => value.id), ["ninja", "viking"]],
    ["actor.guards", input.actor.guards.map((value) => value.id), ["small", "heavy"]],
    [
      "actor.attacks",
      input.actor.attacks.map((value) => value.id),
      ["thrust", "slash", "ranged_cross", "charge", "bomb_area"],
    ],
    [
      "actor.enemies",
      input.actor.enemies.map((value) => value.id),
      ["thrust_enemy", "slash_enemy", "ranged_enemy", "charge_enemy", "bomb_enemy"],
    ],
    [
      "wave.groups",
      input.wave.groups.map((value) => value.id),
      ["small", "small-ranged", "small-ranged-charge", "ranged", "charge", "bomb"],
    ],
    [
      "wave.demoWaves",
      input.wave.demoWaves.map((value) => value.id),
      [
        "demo-01",
        "demo-02",
        "demo-03",
        "demo-04",
        "demo-05",
        "demo-06",
        "demo-07",
        "demo-08",
        "demo-09",
      ],
    ],
    [
      "artifact.artifacts",
      input.artifact.artifacts.map((value) => value.id),
      [
        "attack_up",
        "speed_up",
        "dash_attack_up",
        "mobility_cooldown_down",
        "mobility_range_up",
        "max_health_up",
        "guard_shredder",
        "execution",
        "chain_dash",
      ],
    ],
  ] as const;

  orderedIds.forEach(([path, actual, required]) => {
    actual.forEach((id, index) => {
      if (id !== required[index]) {
        addDiagnostic(
          diagnostics,
          "invalid-inventory-order",
          `${path}[${index}].id`,
          `expected ${required[index] ?? "no definition"}, received ${id}`,
        );
      }
    });
  });

  if (input.wave.endlessTemplate.id !== "endless") {
    addDiagnostic(
      diagnostics,
      "invalid-endless-template",
      "wave.endlessTemplate.id",
      "must use the shipped Endless template ID endless",
    );
  }
}

function validateCrossReferences(
  input: ContentCatalogInput,
  diagnostics: ContentCatalogDiagnostic[],
): void {
  const enemyIds = new Set(input.actor.enemies.map((enemy) => enemy.id));
  const guardIds = new Set(input.actor.guards.map((guard) => guard.id));
  const attackIds = new Set(input.actor.attacks.map((attack) => attack.id));
  const groupIds = new Set(input.wave.groups.map((group) => group.id));

  input.wave.groups.forEach((group, groupIndex) => {
    group.entries.forEach((entry, entryIndex) => {
      if (!enemyIds.has(entry.enemyId)) {
        addDiagnostic(
          diagnostics,
          "unknown-reference",
          `wave.groups[${groupIndex}].entries[${entryIndex}].enemyId`,
          `unknown enemy ID ${entry.enemyId}`,
        );
      }
    });
  });

  const waves = [
    ...input.wave.demoWaves.map((wave, index) => ({ wave, path: `demoWaves[${index}]` })),
    { wave: input.wave.endlessTemplate, path: "endlessTemplate" },
  ];
  waves.forEach(({ wave, path }) => {
    wave.slots.forEach((slot, slotIndex) => {
      if (!groupIds.has(slot.spawnGroupId)) {
        addDiagnostic(
          diagnostics,
          "unknown-reference",
          `wave.${path}.slots[${slotIndex}].spawnGroupId`,
          `unknown spawn group ID ${slot.spawnGroupId}`,
        );
      }
    });
  });

  input.actor.enemies.forEach((enemy, enemyIndex) => {
    if (enemy.guardId !== null && !guardIds.has(enemy.guardId)) {
      addDiagnostic(
        diagnostics,
        "unknown-reference",
        `actor.enemies[${enemyIndex}].guardId`,
        `unknown guard ID ${enemy.guardId}`,
      );
    }
    enemy.attackIds.forEach((attackId, attackIndex) => {
      if (!attackIds.has(attackId)) {
        addDiagnostic(
          diagnostics,
          "unknown-reference",
          `actor.enemies[${enemyIndex}].attackIds[${attackIndex}]`,
          `unknown attack ID ${attackId}`,
        );
      }
    });
  });
}

function validateMobilityAvailability(
  input: ContentCatalogInput,
  diagnostics: ContentCatalogDiagnostic[],
): void {
  const mobilityKinds = new Set(input.actor.characters.map((character) => character.mobility.kind));
  input.artifact.artifacts.forEach((artifact, index) => {
    if (artifact.requiredMobility !== null && !mobilityKinds.has(artifact.requiredMobility)) {
      addDiagnostic(
        diagnostics,
        "missing-mobility",
        `artifact.artifacts[${index}].requiredMobility`,
        `no shipped character provides ${artifact.requiredMobility} Mobility`,
      );
    }
  });
}

export function validateContentCatalog(input: unknown): readonly ContentCatalogDiagnostic[] {
  if (typeof input !== "object" || input === null) {
    return [{ code: "invalid-catalog", path: "content", message: "must be an object" }];
  }

  const value = input as Record<string, unknown>;
  const diagnostics: ContentCatalogDiagnostic[] = [];
  if (!validateShape(value, diagnostics)) {
    return diagnostics;
  }

  const catalog = value as unknown as ContentCatalogInput;
  validateInventory(catalog, diagnostics);
  validateCrossReferences(catalog, diagnostics);
  validateMobilityAvailability(catalog, diagnostics);
  return diagnostics;
}

export function createContentCatalog(input: ContentCatalogInput): ContentCatalog {
  const diagnostics = validateContentCatalog(input);
  if (diagnostics.length > 0) {
    throw new ContentCatalogValidationError(diagnostics);
  }

  return Object.freeze({
    actor: input.actor,
    wave: input.wave,
    artifact: input.artifact,
  });
}
