import { createShippedArena as createShippedArenaGeometry } from "../../core/world/arena";
import { World } from "../../core/world/world";
import type { Seed } from "../../core/model/types";
import type { WavePhaseContext } from "../../core/actions/wave-phase";
import type {
  GrowthCurve,
  GuardGrowthInput,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveProgressionProfile,
} from "../../core/content/wave-schema";
import { createInitialSlotStates } from "../../core/waves/wave-scheduler";
import { actorCatalog } from "../../content/actor-catalog";
import { artifactCatalog } from "../../content/artifact-catalog";

export const REWARD_SCENARIO_SEED = "rewards-foundation";

const FIRST_WAVE_NUMBER = 1;
const REWARD_ENEMY_HP = 1;

const ZERO_CURVE: GrowthCurve = {
  standardCoefficient: 0,
  standardExponent: 1,
  lethalCoefficient: 0,
  lethalExponent: 1,
};

const GUARD_GROWTH: GuardGrowthInput = {
  basis: "base-wave",
  standardWaveLimit: 20,
  lethalTierCadence: 5,
};

const PROGRESSION_PROFILE: WaveProgressionProfile = {
  lethalLevelStart: 10,
  hpCurve: ZERO_CURVE,
  damageCurve: ZERO_CURVE,
  defenseCurve: ZERO_CURVE,
  guardGrowth: GUARD_GROWTH,
};

const REWARD_GROUP: SpawnGroupDefinition = {
  id: "reward-grunt-group",
  placementStrategy: "scatter",
  compositionMode: "fixed",
  weightedTotalCount: 0,
  entries: [{ enemyId: "reward-grunt", count: 1 }],
};

const WAVE_ONE: WaveDefinition = {
  id: "reward-w1",
  populationCap: 1,
  slots: [
    {
      spawnGroupId: REWARD_GROUP.id,
      startCondition: "immediate-overlap",
      survivorThreshold: 0,
      warningTicks: 0,
      levelOffset: 0,
      isBoss: false,
    },
  ],
};

const WAVE_TWO: WaveDefinition = {
  id: "reward-w2",
  populationCap: 1,
  slots: [
    {
      spawnGroupId: REWARD_GROUP.id,
      startCondition: "immediate-overlap",
      survivorThreshold: 0,
      warningTicks: 1,
      levelOffset: 0,
      isBoss: false,
    },
  ],
};

const attackUpArtifact = artifactCatalog.artifacts.find((artifact) => artifact.id === "attack_up");
if (!attackUpArtifact) {
  throw new Error("Shipped artifact content is incomplete.");
}

/**
 * A minimal two-wave, one-passive-enemy-per-wave context so the reward pause boundary can be
 * exercised deterministically without depending on the full shipped wave catalog. The enemy has
 * no `enemyAction`, so it never attacks and dies to a single Normal Attack.
 */
export const rewardScenarioContext: WavePhaseContext = {
  groups: [REWARD_GROUP],
  progressionProfile: PROGRESSION_PROFILE,
  offerableArtifacts: [attackUpArtifact],
  waveFor(waveNumber) {
    return waveNumber === 1 ? WAVE_ONE : waveNumber === 2 ? WAVE_TWO : undefined;
  },
  buildEnemySpawnInput(request) {
    return {
      id: request.id,
      kind: "enemy",
      archetype: request.enemyId,
      cell: request.cell,
      hp: REWARD_ENEMY_HP,
    };
  },
};

/** The shipped arena and regular player with Wave 1 installed and no fixture enemies. */
export function createRewardArena(seed: Seed = REWARD_SCENARIO_SEED): World {
  const world = new World(createShippedArenaGeometry(), seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  if (!player) {
    throw new Error("Shipped combat content is incomplete.");
  }
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 6, y: 6 },
    hp: player.hp,
    normalAttackDamage: player.normalAttack.damage,
    mobility: {
      kind: player.mobility.kind,
      damage: player.mobility.damage,
      range: player.mobility.range,
      cooldown: player.mobility.cooldown,
      staggerMultiplier: player.mobility.staggerMultiplier,
    },
  });

  const firstWave = rewardScenarioContext.waveFor(FIRST_WAVE_NUMBER);
  if (!firstWave) {
    throw new Error("Reward scenario Wave 1 content is incomplete.");
  }
  const random = () => world.random.get("waves").nextUnit();
  const slots = createInitialSlotStates(
    firstWave,
    rewardScenarioContext.groups,
    FIRST_WAVE_NUMBER,
    random,
  );
  world.setWave(FIRST_WAVE_NUMBER, slots);

  return world;
}
