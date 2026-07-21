import type { CombatEvent } from "@core/events/combat-events";
import type { AudioMixer } from "./audio-mixer";
import { CueLibrary, type CueId } from "./cue-library";

/**
 * The single map from a combat event type to its cue. Events without an entry are intentionally
 * silent (movement, telegraph, stagger, terminal transitions). `player_damaged` reuses the `damaged`
 * cue and the death aliases reuse `died`, matching the reference cue set rather than adding cues.
 */
const EVENT_CUES: Partial<Record<CombatEvent["type"], CueId>> = {
  player_attacked: "action_whoosh",
  player_dashed: "action_whoosh",
  smash_armed: "smash_windup",
  smash_impact: "smash_impact",
  enemy_damaged: "damaged",
  player_damaged: "damaged",
  enemy_guard_damaged: "blocked",
  enemy_guard_broken: "guard_break",
  enemy_died: "died",
  enemy_self_destructed: "died",
  enemy_crushed: "died",
  reward_selected: "pickup",
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

    for (const event of events) {
      const cueId = EVENT_CUES[event.type];
      if (cueId) {
        this.trigger(cueId);
      }
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
