import type { AttackDefinition, GuardDefinition } from "../core/content/actor-schema";
import type { ArtifactDefinition } from "../core/content/artifact-schema";
import type { WaveGroupSlot } from "../core/content/wave-schema";
import { contentCatalog } from "../content/content-catalog";

export interface ContentInspection {
  readonly ninja: {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    readonly speedFill: number;
    readonly normalAttack: {
      readonly damage: number;
      readonly range: number;
      readonly staggerMultiplier: number;
    };
    readonly mobility: {
      readonly kind: string;
      readonly damage: number;
      readonly range: number;
      readonly cooldown: number;
      readonly staggerMultiplier: number;
    };
  };
  readonly modeBoss: {
    readonly id: string;
    readonly name: string;
    readonly speed: number;
    readonly hp: number;
    readonly defense: number;
    readonly guard: GuardDefinition;
    readonly attacks: readonly AttackDefinition[];
  };
  readonly demoWave10: {
    readonly id: string;
    readonly populationCap: number;
    readonly bossGroup: {
      readonly id: string;
      readonly placementStrategy: string;
      readonly compositionMode: string;
      readonly weightedTotalCount: number;
      readonly entries: readonly {
        readonly enemyId: string;
        readonly count?: number;
        readonly weight?: number;
      }[];
    };
    readonly slot: WaveGroupSlot;
  };
  readonly guardShredder: {
    readonly id: string;
    readonly name: string;
    readonly category: ArtifactDefinition["category"];
    readonly maxStacks: number;
    readonly minWave: number;
    readonly magnitude: number;
    readonly requiredMobility: ArtifactDefinition["requiredMobility"];
    readonly trigger: string;
  };
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing inspection content: ${label}`);
  }
  return value;
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freeze(item))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const clone = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freeze(item)]),
    );
    return Object.freeze(clone) as T;
  }
  return value;
}

const ninja = requireValue(
  contentCatalog.actor.characters.find((character) => character.id === "ninja"),
  "ninja",
);
const modeBoss = requireValue(
  contentCatalog.actor.enemies.find((enemy) => enemy.id === "mode_boss"),
  "mode_boss",
);
const bossGuard = requireValue(
  contentCatalog.actor.guards.find((guard) => guard.id === modeBoss.guardId),
  "boss guard",
);
const modeBossAttacks = modeBoss.attackIds.map((id) =>
  requireValue(
    contentCatalog.actor.attacks.find((attack) => attack.id === id),
    `attack ${id}`,
  ),
);
const demoWave10 = requireValue(
  contentCatalog.wave.demoWaves.find((wave) => wave.id === "demo-10"),
  "demo-10",
);
const wave10Slot = requireValue(demoWave10.slots[0], "demo-10 slot");
const bossGroup = requireValue(
  contentCatalog.wave.groups.find((group) => group.id === wave10Slot.spawnGroupId),
  "boss group",
);
const guardShredder = requireValue(
  contentCatalog.artifact.artifacts.find((artifact) => artifact.id === "guard_shredder"),
  "guard_shredder",
);
const trigger = guardShredder.effects[0];
if (!trigger || trigger.kind !== "trigger") {
  throw new Error("Guard Shredder must have a trigger effect.");
}

export const contentInspection: ContentInspection = freeze({
  ninja: {
    id: ninja.id,
    name: ninja.name,
    hp: ninja.hp,
    speedFill: ninja.speedFill,
    normalAttack: { ...ninja.normalAttack },
    mobility: { ...ninja.mobility },
  },
  modeBoss: {
    id: modeBoss.id,
    name: modeBoss.name,
    speed: modeBoss.speed,
    hp: modeBoss.hp,
    defense: modeBoss.defense,
    guard: { ...bossGuard },
    attacks: modeBossAttacks.map((attack) => ({ ...attack, shape: { ...attack.shape } })),
  },
  demoWave10: {
    id: demoWave10.id,
    populationCap: demoWave10.populationCap,
    bossGroup: {
      ...bossGroup,
      entries: bossGroup.entries.map((entry) => ({ ...entry })),
    },
    slot: { ...wave10Slot },
  },
  guardShredder: {
    id: guardShredder.id,
    name: guardShredder.name,
    category: guardShredder.category,
    maxStacks: guardShredder.maxStacks,
    minWave: guardShredder.minWave,
    magnitude: guardShredder.magnitude,
    requiredMobility: guardShredder.requiredMobility,
    trigger: trigger.trigger,
  },
});
