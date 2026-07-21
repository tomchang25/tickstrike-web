import type { CombatEvent } from "@core/events/combat-events";
import type { EntityId } from "@core/model/types";
import type { AudioMixer } from "./audio-mixer";
import { CueLibrary, type CueId } from "./cue-library";

/**
 * Events that each play their own cue, one per matching event. Events without an entry here or in
 * {@link HIT_FEEDBACK} are intentionally silent (movement, telegraph, stagger, terminal transitions).
 * `player_damaged` reuses the `damaged` cue and the death aliases reuse `died`, matching the reference
 * cue set rather than adding cues.
 */
const EVENT_CUES: Partial<Record<CombatEvent["type"], CueId>> = {
  player_attacked: "action_whoosh",
  player_dashed: "action_whoosh",
  smash_armed: "smash_windup",
  smash_impact: "smash_impact",
  player_damaged: "damaged",
  enemy_died: "died",
  enemy_self_destructed: "died",
  enemy_crushed: "died",
  reward_selected: "pickup",
};

/**
 * A single enemy hit emits several of these at once (a guard chip plus the damage, or a guard break
 * plus the damage), so only the highest-priority one is allowed to sound per enemy per resolution.
 * Lower `rank` wins: guard chip over guard break over plain damage.
 */
const HIT_FEEDBACK: Partial<Record<CombatEvent["type"], { readonly cue: CueId; readonly rank: number }>> = {
  enemy_guard_damaged: { cue: "blocked", rank: 0 },
  enemy_guard_broken: { cue: "guard_break", rank: 1 },
  enemy_damaged: { cue: "damaged", rank: 2 },
};

export interface AudioDirectorOptions {
  /** Injected so tests are deterministic; drives stream choice and pitch. Defaults to `Math.random`. */
  readonly random?: () => number;
}

/**
 * Plays the reference SFX cue for each mapped combat event on the mixer. Parallel to
 * `PresentationDirector`: it consumes the same semantic event list, reads no gameplay state, and is
 * fire-and-forget — audio is instantaneous, so it never awaits or gates the command loop. It holds no
 * `AudioContext`; the mixer owns playback and teardown. Cue buffers load once the mixer is unlocked.
 */
export class AudioDirector {
  private readonly library: CueLibrary;
  private readonly lastStreamIndex = new Map<CueId, number>();
  private readonly random: () => number;

  constructor(
    private readonly mixer: AudioMixer,
    library: CueLibrary = new CueLibrary(),
    options: AudioDirectorOptions = {},
  ) {
    this.library = library;
    this.random = options.random ?? Math.random;
  }

  /** Triggers the mapped cue for each event, lazily starting the one-time load once unlocked. */
  play(events: readonly CombatEvent[]): void {
    if (this.mixer.isUnlocked && !this.library.isLoaded && !this.library.isLoading) {
      void this.load();
    }

    // The guard/damage family is collapsed to one winning cue per enemy; every other cue fires as it
    // is seen. The winners are triggered after the pass so a later, higher-priority hit event on the
    // same enemy can still take over.
    const feedbackByEnemy = new Map<EntityId, { readonly cue: CueId; readonly rank: number }>();
    for (const event of events) {
      const feedback = HIT_FEEDBACK[event.type];
      if (feedback && "enemyId" in event) {
        const best = feedbackByEnemy.get(event.enemyId);
        if (!best || feedback.rank < best.rank) {
          feedbackByEnemy.set(event.enemyId, feedback);
        }
        continue;
      }

      const cueId = EVENT_CUES[event.type];
      if (cueId) {
        this.trigger(cueId);
      }
    }

    for (const feedback of feedbackByEnemy.values()) {
      this.trigger(feedback.cue);
    }
  }

  /** Idempotent; also invoked directly on unlock so buffers are ready before combat. */
  load(): Promise<void> {
    return this.library.load((bytes) => this.mixer.decode(bytes));
  }

  private trigger(cueId: CueId): void {
    const definition = this.library.definition(cueId);
    const buffers = this.library.buffersFor(cueId);
    if (!definition || !buffers || buffers.length === 0) {
      return;
    }

    const buffer = this.pickStream(cueId, buffers);
    if (!buffer) {
      return;
    }

    this.mixer.play({
      buffer,
      bus: "effect",
      limiterKey: definition.limiterKey,
      maxPerWindow: definition.maxPerWindow,
      windowSec: definition.windowSec,
      volume: definition.volume,
      playbackRate: definition.pitchMin + this.random() * (definition.pitchMax - definition.pitchMin),
    });
  }

  private pickStream(cueId: CueId, buffers: readonly AudioBuffer[]): AudioBuffer | undefined {
    if (buffers.length === 1) {
      return buffers[0];
    }

    let index = Math.floor(this.random() * buffers.length) % buffers.length;
    if (index === this.lastStreamIndex.get(cueId)) {
      index = (index + 1) % buffers.length;
    }
    this.lastStreamIndex.set(cueId, index);
    return buffers[index];
  }
}
