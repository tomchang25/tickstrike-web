import { createShippedArena as createShippedArenaGeometry } from "@core/world/arena";
import { World } from "@core/world/world";
import type { Seed } from "@core/model/types";
import type { WavePhaseContext } from "@core/actions/wave-phase";
import { createInitialSlotStates } from "@core/waves/wave-scheduler";
import { waveCatalog } from "@content/wave-catalog";
import { buildEnemySpawnInput } from "@content/wave-enemy-spawn";
import { actorCatalog } from "@content/actor-catalog";
import { artifactCatalog } from "@content/artifact-catalog";

export const WAVE_SCENARIO_SEED = "waves-foundation";

const FIRST_WAVE_NUMBER = 1;

/**
 * Immutable content-backed setup the wave phase reads through `src/core`'s content-free
 * boundary. The mutable queue/pending-batch state lives solely in the `World` this fixture
 * creates, never here.
 */
export const waveScenarioContext: WavePhaseContext = {
  groups: waveCatalog.groups,
  progressionProfile: waveCatalog.progressionProfile,
  waveFor(waveNumber) {
    return waveCatalog.demoWaves[waveNumber - 1] ?? waveCatalog.endlessTemplate;
  },
  buildEnemySpawnInput,
};

/**
 * The full authored run the home page plays: the same wave setup plus the shipped reward pool and
 * the milestone at the final authored wave, so clearing it opens the End Run / Continue Endless
 * choice before the endless template. `waveScenarioContext` stays reward-free and milestone-free so
 * the `waves` scenario and its determinism golden are unchanged.
 */
export const runScenarioContext: WavePhaseContext = {
  ...waveScenarioContext,
  offerableArtifacts: artifactCatalog.artifacts,
  milestoneWaveNumber: waveCatalog.demoWaves.length,
};

/** The shipped arena and regular player with Wave 1 installed and no fixture enemies. */
export function createWaveArena(seed: Seed = WAVE_SCENARIO_SEED): World {
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

  const firstWave = waveScenarioContext.waveFor(FIRST_WAVE_NUMBER);
  if (!firstWave) {
    throw new Error("Wave 1 content is incomplete.");
  }
  const random = () => world.random.get("waves").nextUnit();
  const slots = createInitialSlotStates(firstWave, waveScenarioContext.groups, FIRST_WAVE_NUMBER, random);
  world.setWave(FIRST_WAVE_NUMBER, slots);

  return world;
}
