import { describe, expect, it } from "vitest";
import { AudioMixer } from "@presentation/audio/audio-mixer";

interface FakeGain {
  gain: { value: number };
  connectedTo: unknown;
  connect: (target: unknown) => void;
  disconnect: () => void;
}

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connectedTo: unknown = undefined;
  readonly playbackRate = { value: 1 };

  connect(target: unknown): void {
    this.connectedTo = target;
  }

  disconnect(): void {
    this.connectedTo = undefined;
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    if (this.stopped) {
      throw new Error("already stopped");
    }
    this.stopped = true;
  }

  /** Test helper: fire the natural end-of-playback callback. */
  end(): void {
    this.onended?.();
  }
}

class FakeContext {
  state: "suspended" | "running" | "closed" = "suspended";
  readonly destination = { id: "destination" };
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];

  createGain(): FakeGain {
    const gain: FakeGain = {
      gain: { value: 1 },
      connectedTo: undefined,
      connect(target: unknown) {
        gain.connectedTo = target;
      },
      disconnect() {
        gain.connectedTo = undefined;
      },
    };
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = "suspended";
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = "closed";
  }
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`Expected an element at index ${index}.`);
  }
  return value;
}

function createMixer(options: { now?: () => number; maxVoices?: number } = {}) {
  const context = new FakeContext();
  let factoryCalls = 0;
  const mixer = new AudioMixer({
    createContext: () => {
      factoryCalls += 1;
      return context as unknown as AudioContext;
    },
    now: options.now,
    maxVoices: options.maxVoices,
  });
  const buffer = {} as unknown as AudioBuffer;
  return { mixer, context, buffer, factoryCalls: () => factoryCalls };
}

const [MASTER, EFFECT, MUSIC] = [0, 1, 2];

describe("AudioMixer", () => {
  it("does not create the context until the first unlock", () => {
    const { mixer, factoryCalls } = createMixer();
    expect(mixer.isUnlocked).toBe(false);
    expect(factoryCalls()).toBe(0);

    mixer.unlock();

    expect(mixer.isUnlocked).toBe(true);
    expect(factoryCalls()).toBe(1);
  });

  it("builds the effect/music -> master -> destination gain graph on unlock", () => {
    const { mixer, context } = createMixer();
    mixer.unlock();

    expect(context.gains).toHaveLength(3);
    expect(at(context.gains, MASTER).connectedTo).toBe(context.destination);
    expect(at(context.gains, EFFECT).connectedTo).toBe(at(context.gains, MASTER));
    expect(at(context.gains, MUSIC).connectedTo).toBe(at(context.gains, MASTER));
  });

  it("is idempotent and resumes only a suspended context", () => {
    const { mixer, context, factoryCalls } = createMixer();
    mixer.unlock();
    mixer.unlock();

    expect(factoryCalls()).toBe(1);
    expect(context.gains).toHaveLength(3);
    expect(context.resumeCalls).toBe(1);
  });

  it("applies clamped volumes to the master and bus gains", () => {
    const { mixer, context } = createMixer();
    mixer.unlock();

    mixer.setVolumes({ master: 0.5, effect: 0.25, music: 0 });
    expect(at(context.gains, MASTER).gain.value).toBe(0.5);
    expect(at(context.gains, EFFECT).gain.value).toBe(0.25);
    expect(at(context.gains, MUSIC).gain.value).toBe(0);

    mixer.setVolumes({ master: 2, effect: -1 });
    expect(at(context.gains, MASTER).gain.value).toBe(1);
    expect(at(context.gains, EFFECT).gain.value).toBe(0);
  });

  it("records volumes set before unlock and applies them once the graph exists", () => {
    const { mixer, context } = createMixer();
    mixer.setVolumes({ master: 0.3 });
    mixer.unlock();

    expect(at(context.gains, MASTER).gain.value).toBe(0.3);
  });

  it("routes a cue to the effect bus by default and the music bus on request", () => {
    const { mixer, context, buffer } = createMixer();
    mixer.unlock();

    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(1);
    expect(at(context.sources, 0).connectedTo).toBe(at(context.gains, EFFECT));

    mixer.play({ buffer, bus: "music" });
    expect(at(context.sources, 1).connectedTo).toBe(at(context.gains, MUSIC));
  });

  it("applies playback rate and counts every started voice", () => {
    const { mixer, context, buffer } = createMixer();
    mixer.unlock();

    mixer.play({ buffer, playbackRate: 1.2 });
    expect(at(context.sources, 0).playbackRate.value).toBe(1.2);
    expect(mixer.totalPlayed).toBe(1);

    mixer.play({ buffer });
    expect(mixer.totalPlayed).toBe(2);
  });

  it("inserts a per-voice gain when the cue carries its own volume", () => {
    const { mixer, context, buffer } = createMixer();
    mixer.unlock();

    mixer.play({ buffer, volume: 0.5 });

    const voiceGain = at(context.gains, 3);
    expect(voiceGain.gain.value).toBe(0.5);
    expect(voiceGain.connectedTo).toBe(at(context.gains, EFFECT));
    expect(at(context.sources, 0).connectedTo).toBe(voiceGain);
  });

  it("ignores play before unlock and after dispose", () => {
    const { mixer, buffer } = createMixer();
    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(0);

    mixer.unlock();
    mixer.dispose();
    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(0);
  });

  it("drops rate-limited repeats of the same cue key", () => {
    const { mixer, buffer } = createMixer({ now: () => 0 });
    mixer.unlock();

    mixer.play({ buffer, limiterKey: "hit", maxPerWindow: 1, windowSec: 1 });
    mixer.play({ buffer, limiterKey: "hit", maxPerWindow: 1, windowSec: 1 });

    expect(mixer.activeVoiceCount).toBe(1);
  });

  it("caps the number of simultaneous voices", () => {
    const { mixer, buffer } = createMixer({ maxVoices: 1 });
    mixer.unlock();

    mixer.play({ buffer });
    mixer.play({ buffer });

    expect(mixer.activeVoiceCount).toBe(1);
  });

  it("releases a voice when its playback ends", () => {
    const { mixer, context, buffer } = createMixer();
    mixer.unlock();

    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(1);

    at(context.sources, 0).end();
    expect(mixer.activeVoiceCount).toBe(0);
    expect(at(context.sources, 0).connectedTo).toBeUndefined();
  });

  it("stops every voice and resets the limiter on stopAll", () => {
    const { mixer, context, buffer } = createMixer({ now: () => 0 });
    mixer.unlock();

    mixer.play({ buffer, limiterKey: "hit", maxPerWindow: 1, windowSec: 1 });
    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(2);

    mixer.stopAll();

    expect(mixer.activeVoiceCount).toBe(0);
    expect(context.sources.every((source) => source.stopped)).toBe(true);
    // The limiter was cleared, so the previously saturated key may fire again.
    mixer.play({ buffer, limiterKey: "hit", maxPerWindow: 1, windowSec: 1 });
    expect(mixer.activeVoiceCount).toBe(1);
  });

  it("suspends and resumes only a matching context state", () => {
    const { mixer, context } = createMixer();

    // Before unlock there is no context; both are guarded no-ops.
    mixer.suspend();
    mixer.resume();
    expect(context.suspendCalls).toBe(0);
    expect(context.resumeCalls).toBe(0);

    mixer.unlock();
    expect(context.state).toBe("running");

    mixer.suspend();
    expect(context.suspendCalls).toBe(1);
    expect(context.state).toBe("suspended");
    // Suspending an already-suspended context does nothing.
    mixer.suspend();
    expect(context.suspendCalls).toBe(1);

    mixer.resume();
    expect(context.state).toBe("running");
  });

  it("closes the context on dispose and returns to the pre-unlock state", () => {
    const { mixer, context, buffer } = createMixer();
    mixer.unlock();
    mixer.play({ buffer });

    mixer.dispose();

    expect(mixer.isUnlocked).toBe(false);
    expect(mixer.activeVoiceCount).toBe(0);
    expect(context.closeCalls).toBe(1);
  });

  it("degrades to a silent no-op when no audio context is available", () => {
    const mixer = new AudioMixer({ createContext: () => undefined });
    const buffer = {} as unknown as AudioBuffer;

    expect(() => mixer.unlock()).not.toThrow();
    expect(mixer.isUnlocked).toBe(false);

    mixer.setVolumes({ master: 0.5 });
    mixer.play({ buffer });
    expect(mixer.activeVoiceCount).toBe(0);
  });
});
