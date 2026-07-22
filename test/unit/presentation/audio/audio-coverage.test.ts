/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CombatEvent } from "@core/events/combat-events";
import { AudioDirector, AUDIBLE_EVENT_TYPES } from "@presentation/audio/audio-director";
import type { AudioCue, AudioMixer } from "@presentation/audio/audio-mixer";
import { CUE_DEFINITIONS, CueLibrary } from "@presentation/audio/cue-library";

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../determinism/__golden__");
const GOLDEN_NAMES = ["charge-enemy", "rewards", "waves"];

/** One golden log entry; only `events` matters here (a trailing entry carries `snapshot` instead). */
interface GoldenEntry {
  readonly events?: readonly CombatEvent[];
}

/**
 * Event types present in the goldens that intentionally produce no cue. The classification test fails
 * on any golden event type that is neither audible nor listed here, so a new upstream event type
 * cannot slip through unmapped and unnoticed.
 */
const INTENTIONALLY_SILENT: ReadonlySet<CombatEvent["type"]> = new Set([
  "command_resolved",
  "world_advanced",
  "actor_moved",
  "enemy_moved",
  "telegraph_changed",
  "enemy_attack_committed",
  "enemy_attack_detonated",
  "enemy_recovering",
  "enemy_recovered",
  "charge_landed",
  "charge_impact",
  "entity_displaced",
  "directional_hit",
  "wave_group_warned",
  "wave_group_spawned",
  "wave_started",
  "wave_cleared",
  "reward_offered",
]);

function loadGolden(name: string): readonly GoldenEntry[] {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, `${name}.json`), "utf8")) as readonly GoldenEntry[];
}

/** Each resolution's events as a separate group, mirroring how the runtime calls the director. */
function resolutions(golden: readonly GoldenEntry[]): readonly (readonly CombatEvent[])[] {
  return golden.map((entry) => entry.events ?? []).filter((events) => events.length > 0);
}

async function coverageDirector(): Promise<{ director: AudioDirector; plays: AudioCue[] }> {
  const plays: AudioCue[] = [];
  const mixer = {
    isUnlocked: true,
    play: (cue: AudioCue) => plays.push(cue),
    decode: async () => ({}) as unknown as AudioBuffer,
  } as unknown as AudioMixer;
  const library = new CueLibrary(CUE_DEFINITIONS, async () => new ArrayBuffer(8));
  const director = new AudioDirector(mixer, library, { random: () => 0 });
  await director.load();
  return { director, plays };
}

describe("audio cue coverage over deterministic goldens", () => {
  it("plays the expected cues across full deterministic runs", async () => {
    const { director, plays } = await coverageDirector();

    for (const name of GOLDEN_NAMES) {
      for (const events of resolutions(loadGolden(name))) {
        director.play(events);
      }
    }

    const cues = new Set(plays.map((cue) => cue.limiterKey));
    // The command walk always attacks into enemies, chips guard, and takes hits back.
    expect(cues.has("action_whoosh")).toBe(true);
    expect(cues.has("damaged")).toBe(true);
    expect(cues.has("blocked")).toBe(true);
  });

  it("classifies every golden event type as audible or intentionally silent", () => {
    const unclassified = new Set<string>();

    for (const name of GOLDEN_NAMES) {
      for (const entry of loadGolden(name)) {
        for (const event of entry.events ?? []) {
          if (!AUDIBLE_EVENT_TYPES.has(event.type) && !INTENTIONALLY_SILENT.has(event.type)) {
            unclassified.add(event.type);
          }
        }
      }
    }

    expect([...unclassified]).toEqual([]);
  });
});
