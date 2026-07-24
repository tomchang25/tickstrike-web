import { createShippedArena as createShippedArenaGeometry } from "@core/world/arena";
import { World } from "@core/world/world";
import type { Seed } from "@core/model/types";
import type { WavePhaseContext } from "@core/actions/wave-phase";
import type { ArtifactDefinition } from "@core/content/artifact-schema";
import type {
  GrowthCurve,
  GuardGrowthInput,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveProgressionProfile,
} from "@core/content/wave-schema";
import { createInitialSlotStates } from "@core/waves/wave-scheduler";
import { actorCatalog } from "@content/actor-catalog";
import { artifactCatalog } from "@content/artifact-catalog";

export const MILESTONE_SCENARIO_SEED = "milestone-foundation";

/** Clearing this wave opens the End Run / Continue Endless choice; later waves are the endless run. */
export const MILESTONE_WAVE_NUMBER = 2;

const FIRST_WAVE_NUMBER = 1;
const MILESTONE_ENEMY_HP = 1;

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

const MILESTONE_GROUP: SpawnGroupDefinition = {
  id: "milestone-grunt-group",
  // Spawn the passive grunt in the player-ring band (2-4 cells) rather than scattered anywhere in
  // the arena, so the run-lifecycle browser spec reaches each clear in a couple of moves instead of
  // pathfinding across the whole board. Purely a fixture-speed choice; this scenario is not a
  // determinism golden.
  placementStrategy: "player-ring",
  compositionMode: "fixed",
  weightedTotalCount: 0,
  entries: [{ enemyId: "reward-grunt", count: 1 }],
};

const offerableArtifacts: readonly ArtifactDefinition[] = artifactCatalog.artifacts;

/** One passive 1-HP enemy per wave; wave 1 spawns immediately, every later wave warns first. */
function buildMilestoneWave(waveNumber: number): WaveDefinition {
  return {
    id: `milestone-w${waveNumber}`,
    populationCap: 1,
    slots: [
      {
        spawnGroupId: MILESTONE_GROUP.id,
        startCondition: "immediate-overlap",
        survivorThreshold: 0,
        warningTicks: waveNumber === 1 ? 0 : 1,
        levelOffset: 0,
        isBoss: false,
      },
    ],
  };
}

/**
 * A shortened wave-driven run for the run-lifecycle browser spec. Two authored waves reach the
 * milestone at {@link MILESTONE_WAVE_NUMBER}; `waveFor` keeps serving the same builder wave beyond
 * it so a Continue Endless decision resumes into an endless wave. Every wave is one passive 1-HP
 * enemy, so a clear, the reward pause, the milestone pause, and the endless continuation are all
 * reachable in a handful of commands. `offerableArtifacts` is present so both the ordinary reward
 * pause and the milestone wave's deferred reward are exercised.
 */
export const milestoneScenarioContext: WavePhaseContext = {
  groups: [MILESTONE_GROUP],
  progressionProfile: PROGRESSION_PROFILE,
  offerableArtifacts,
  milestoneWaveNumber: MILESTONE_WAVE_NUMBER,
  waveFor(waveNumber) {
    return buildMilestoneWave(waveNumber);
  },
  buildEnemySpawnInput(request) {
    return {
      id: request.id,
      kind: "enemy",
      archetype: request.enemyId,
      cell: request.cell,
      hp: MILESTONE_ENEMY_HP,
    };
  },
};

/** The shipped arena and regular player with the shortened Wave 1 installed and no fixture enemies. */
export function createMilestoneArena(seed: Seed = MILESTONE_SCENARIO_SEED): World {
  const world = new World(createShippedArenaGeometry(), seed);
  const player = actorCatalog.characters.find((character) => character.id === "ninja");
  if (!player) {
    throw new Error("Shipped combat content is incomplete.");
  }
  world.spawn({
    id: "player",
    kind: "player",
    archetype: "ninja",
    cell: { x: 9, y: 6 },
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

  const firstWave = milestoneScenarioContext.waveFor(FIRST_WAVE_NUMBER);
  if (!firstWave) {
    throw new Error("Milestone scenario Wave 1 content is incomplete.");
  }
  const random = () => world.random.get("waves").nextUnit();
  const slots = createInitialSlotStates(firstWave, milestoneScenarioContext.groups, FIRST_WAVE_NUMBER, random);
  world.setWave(FIRST_WAVE_NUMBER, slots);

  return world;
}
