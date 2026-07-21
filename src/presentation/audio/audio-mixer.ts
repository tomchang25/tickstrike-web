import { RateLimiter } from "./rate-limiter";

/** The two mixer buses. Master multiplies both; this child plays only through `effect`. */
export type AudioBus = "effect" | "music";

export interface AudioMixerVolumes {
  readonly master: number;
  readonly effect: number;
  readonly music: number;
}

export interface AudioCue {
  readonly buffer: AudioBuffer;
  /** Defaults to `effect`. */
  readonly bus?: AudioBus;
  /** When set, the cue is rate limited under this key; absent means no limiting. */
  readonly limiterKey?: string;
  readonly maxPerWindow?: number;
  readonly windowSec?: number;
  /** Per-cue linear attenuation `0..1`, layered under the bus gain. Defaults to `1`. */
  readonly volume?: number;
}

export interface AudioMixerOptions {
  /** Injected so tests supply a fake context; returns undefined when the capability is absent. */
  readonly createContext?: () => AudioContext | undefined;
  readonly now?: () => number;
  readonly maxVoices?: number;
}

const DEFAULT_MAX_VOICES = 24;
const DEFAULT_MAX_PER_WINDOW = 4;
const DEFAULT_WINDOW_SEC = 0.05;

/**
 * The WebAudio delivery engine. It owns the browser `AudioContext` and a fixed gain graph
 * (`effectGain`/`musicGain` -> `masterGain` -> destination) and plays supplied buffers through a bus
 * with per-cue rate limiting and a bounded active-voice count. It is a presentation output: it reads
 * no settings and owns no gameplay state, receiving volumes as an imperative push from the session.
 *
 * The context is created lazily on the first {@link unlock} because browsers block a pre-gesture
 * context, so constructing the mixer is audio-side-effect-free. When no context constructor exists the
 * mixer degrades to a silent no-op and never throws.
 */
export class AudioMixer {
  private readonly limiter: RateLimiter;
  private readonly createContext: () => AudioContext | undefined;
  private readonly maxVoices: number;
  private readonly volumes = { master: 1, effect: 1, music: 1 };
  private readonly activeVoices = new Set<AudioBufferSourceNode>();

  private context: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private busGains: Record<AudioBus, GainNode> | undefined;

  constructor(options: AudioMixerOptions = {}) {
    this.limiter = new RateLimiter({ now: options.now });
    this.createContext = options.createContext ?? defaultContextFactory;
    this.maxVoices = options.maxVoices ?? DEFAULT_MAX_VOICES;
  }

  get activeVoiceCount(): number {
    return this.activeVoices.size;
  }

  get isUnlocked(): boolean {
    return this.context !== undefined;
  }

  /**
   * Builds the context and gain graph on first call and resumes a suspended context. Idempotent: a
   * repeated gesture never creates a second context or duplicate nodes.
   */
  unlock(): void {
    if (!this.context) {
      const context = this.createContext();
      if (!context) {
        return;
      }

      this.context = context;
      this.buildGraph(context);
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  /** Records the given volumes and applies any that map to a live gain node. Safe before unlock. */
  setVolumes(volumes: Partial<AudioMixerVolumes>): void {
    if (volumes.master !== undefined) {
      this.volumes.master = clamp01(volumes.master);
    }
    if (volumes.effect !== undefined) {
      this.volumes.effect = clamp01(volumes.effect);
    }
    if (volumes.music !== undefined) {
      this.volumes.music = clamp01(volumes.music);
    }

    this.applyVolumes();
  }

  /**
   * Plays a cue through its bus. A no-op before unlock, when the cue is rate limited, or when the
   * active-voice cap is reached. Each play creates a single-use source node — WebAudio source nodes
   * cannot restart, so voices are never pooled for reuse; concurrency is bounded by count instead.
   */
  play(cue: AudioCue): void {
    const context = this.context;
    const busGains = this.busGains;
    if (!context || !busGains) {
      return;
    }

    if (
      cue.limiterKey &&
      !this.limiter.tryAcquire(
        cue.limiterKey,
        cue.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW,
        cue.windowSec ?? DEFAULT_WINDOW_SEC,
      )
    ) {
      return;
    }

    if (this.activeVoices.size >= this.maxVoices) {
      return;
    }

    const source = context.createBufferSource();
    source.buffer = cue.buffer;
    source.connect(this.voiceDestination(context, busGains[cue.bus ?? "effect"], cue.volume));

    this.activeVoices.add(source);
    source.onended = () => {
      this.activeVoices.delete(source);
      source.disconnect();
    };
    source.start();
  }

  /** Stops and releases every active voice and clears limiter history. Used at every run boundary. */
  stopAll(): void {
    for (const source of [...this.activeVoices]) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source that already ended throws on stop(); the disconnect below still releases it.
      }
      source.disconnect();
    }

    this.activeVoices.clear();
    this.limiter.clear();
  }

  /** Stops all voices and closes the context; the mixer returns to its pre-unlock state. */
  dispose(): void {
    this.stopAll();

    const context = this.context;
    this.context = undefined;
    this.masterGain = undefined;
    this.busGains = undefined;

    if (context && context.state !== "closed") {
      void context.close();
    }
  }

  private voiceDestination(context: AudioContext, busGain: GainNode, volume: number | undefined): AudioNode {
    if (volume === undefined || volume === 1) {
      return busGain;
    }

    const voiceGain = context.createGain();
    voiceGain.gain.value = clamp01(volume);
    voiceGain.connect(busGain);
    return voiceGain;
  }

  private buildGraph(context: AudioContext): void {
    const masterGain = context.createGain();
    masterGain.connect(context.destination);

    const effectGain = context.createGain();
    effectGain.connect(masterGain);

    const musicGain = context.createGain();
    musicGain.connect(masterGain);

    this.masterGain = masterGain;
    this.busGains = { effect: effectGain, music: musicGain };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this.volumes.master;
    }
    if (this.busGains) {
      this.busGains.effect.gain.value = this.volumes.effect;
      this.busGains.music.gain.value = this.volumes.music;
    }
  }
}

function defaultContextFactory(): AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return ctor ? new ctor() : undefined;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
