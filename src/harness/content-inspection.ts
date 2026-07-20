import type { AttackDefinition, GuardDefinition } from "@core/content/actor-schema";
import type { ArtifactDefinition } from "@core/content/artifact-schema";
import type { WaveGroupSlot } from "@core/content/wave-schema";
import { contentCatalog } from "@content/content-catalog";

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
  readonly chargeEnemy: {
    readonly id: string;
    readonly name: string;
    readonly speed: number;
    readonly hp: number;
    readonly defense: number;
    readonly guard: GuardDefinition;
    readonly attacks: readonly AttackDefinition[];
  };
  readonly demoWave09: {
    readonly id: string;
    readonly populationCap: number;
    readonly group: {
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
const chargeEnemy = requireValue(
  contentCatalog.actor.enemies.find((enemy) => enemy.id === "charge_enemy"),
  "charge_enemy",
);
const chargeGuard = requireValue(
  contentCatalog.actor.guards.find((guard) => guard.id === chargeEnemy.guardId),
  "charge guard",
);
const chargeEnemyAttacks = chargeEnemy.attackIds.map((id) =>
  requireValue(
    contentCatalog.actor.attacks.find((attack) => attack.id === id),
    `attack ${id}`,
  ),
);
const demoWave09 = requireValue(
  contentCatalog.wave.demoWaves.find((wave) => wave.id === "demo-09"),
  "demo-09",
);
const wave09Slot = requireValue(demoWave09.slots[0], "demo-09 slot");
const wave09Group = requireValue(
  contentCatalog.wave.groups.find((group) => group.id === wave09Slot.spawnGroupId),
  "demo-09 group",
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
  chargeEnemy: {
    id: chargeEnemy.id,
    name: chargeEnemy.name,
    speed: chargeEnemy.speed,
    hp: chargeEnemy.hp,
    defense: chargeEnemy.defense,
    guard: { ...chargeGuard },
    attacks: chargeEnemyAttacks.map((attack) => ({ ...attack, shape: { ...attack.shape } })),
  },
  demoWave09: {
    id: demoWave09.id,
    populationCap: demoWave09.populationCap,
    group: {
      ...wave09Group,
      entries: wave09Group.entries.map((entry) => ({ ...entry })),
    },
    slot: { ...wave09Slot },
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
