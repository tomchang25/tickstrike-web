import blockUrl from "./assets/block.mp3";
import crystalPlingUrl from "./assets/crystal_pling.wav";
import hitUrl from "./assets/hit.wav";
import punch2Url from "./assets/Punch_2.wav";
import whoosh001Url from "./assets/whoosh-001.wav";
import whoosh002Url from "./assets/whoosh-002.wav";
import whoosh003Url from "./assets/whoosh-003.wav";
import whoosh004Url from "./assets/whoosh-004.wav";
import whoosh005Url from "./assets/whoosh-005.wav";
import windowBreakUrl from "./assets/window-break-sfx-333914.wav";

export type CueId =
  "action_whoosh" | "smash_windup" | "smash_impact" | "damaged" | "blocked" | "guard_break" | "died" | "pickup";

export interface CueDefinition {
  readonly id: CueId;
  /** One or more asset URLs; multi-stream cues pick one per play with avoid-repeat. */
  readonly urls: readonly string[];
  readonly limiterKey: string;
  readonly maxPerWindow: number;
  readonly windowSec: number;
  /** Linear gain precomputed from the reference dB value. */
  readonly volume: number;
  readonly pitchMin: number;
  readonly pitchMax: number;
}

/** Converts a reference decibel offset to a linear gain multiplier. */
export function fromDb(db: number): number {
  return 10 ** (db / 20);
}

const PITCH_MIN = 0.95;
const PITCH_MAX = 1.05;

/** The reference SFX cue set, values carried verbatim from the Godot audio presets. */
export const CUE_DEFINITIONS: readonly CueDefinition[] = [
  {
    id: "action_whoosh",
    urls: [whoosh001Url, whoosh002Url, whoosh003Url, whoosh004Url, whoosh005Url],
    limiterKey: "action_whoosh",
    maxPerWindow: 8,
    windowSec: 0.3,
    volume: fromDb(-20),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "smash_windup",
    urls: [whoosh001Url, whoosh002Url, whoosh003Url],
    limiterKey: "smash_windup",
    maxPerWindow: 4,
    windowSec: 0.3,
    volume: fromDb(-20),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "smash_impact",
    urls: [hitUrl],
    limiterKey: "smash_impact",
    maxPerWindow: 4,
    windowSec: 0.3,
    volume: fromDb(-20),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "damaged",
    urls: [hitUrl],
    limiterKey: "damaged",
    maxPerWindow: 8,
    windowSec: 0.5,
    volume: fromDb(-20),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "blocked",
    urls: [blockUrl],
    limiterKey: "blocked",
    maxPerWindow: 8,
    windowSec: 0.5,
    volume: fromDb(-10),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "guard_break",
    urls: [windowBreakUrl],
    limiterKey: "guard_break",
    maxPerWindow: 8,
    windowSec: 0.5,
    volume: fromDb(-24),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "died",
    urls: [punch2Url],
    limiterKey: "died",
    maxPerWindow: 4,
    windowSec: 1.0,
    volume: fromDb(-20),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
  {
    id: "pickup",
    urls: [crystalPlingUrl],
    limiterKey: "pickup",
    maxPerWindow: 8,
    windowSec: 0.5,
    volume: fromDb(-10),
    pitchMin: PITCH_MIN,
    pitchMax: PITCH_MAX,
  },
];

export type CueFetcher = (url: string) => Promise<ArrayBuffer>;
export type CueDecoder = (bytes: ArrayBuffer) => Promise<AudioBuffer | undefined>;

const defaultFetcher: CueFetcher = (url) => fetch(url).then((response) => response.arrayBuffer());

/**
 * Holds decoded cue buffers keyed by cue id. Fetching needs no audio context; decoding does, so a
 * one-time {@link load} is driven once the mixer is unlocked. A stream that fails to fetch or decode
 * is dropped, leaving the cue with its remaining streams (or none, i.e. silent).
 */
export class CueLibrary {
  private readonly buffers = new Map<CueId, AudioBuffer[]>();
  private state: "idle" | "loading" | "loaded" = "idle";

  constructor(
    private readonly definitions: readonly CueDefinition[] = CUE_DEFINITIONS,
    private readonly fetcher: CueFetcher = defaultFetcher,
  ) {}

  get isLoaded(): boolean {
    return this.state === "loaded";
  }

  get isLoading(): boolean {
    return this.state === "loading";
  }

  definition(id: CueId): CueDefinition | undefined {
    return this.definitions.find((definition) => definition.id === id);
  }

  buffersFor(id: CueId): readonly AudioBuffer[] | undefined {
    return this.buffers.get(id);
  }

  /** Idempotent: fetches and decodes every cue stream once, then marks the library loaded. */
  async load(decode: CueDecoder): Promise<void> {
    if (this.state !== "idle") {
      return;
    }

    this.state = "loading";
    await Promise.all(
      this.definitions.map(async (definition) => {
        const decoded = await Promise.all(
          definition.urls.map(async (url) => {
            try {
              return await decode(await this.fetcher(url));
            } catch {
              return undefined;
            }
          }),
        );
        this.buffers.set(
          definition.id,
          decoded.filter((buffer): buffer is AudioBuffer => buffer !== undefined),
        );
      }),
    );
    this.state = "loaded";
  }
}
