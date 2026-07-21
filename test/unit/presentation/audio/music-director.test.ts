import { describe, expect, it, vi } from "vitest";
import type { AudioMixer } from "@presentation/audio/audio-mixer";
import { MusicDirector } from "@presentation/audio/music-director";

const BYTES = new ArrayBuffer(8);

describe("MusicDirector", () => {
  it("fetches, decodes, and starts the looping track once", async () => {
    const buffer = {} as AudioBuffer;
    const decode = vi.fn(async () => buffer);
    const playMusic = vi.fn();
    const fetcher = vi.fn(async () => BYTES);
    const mixer = { decode, playMusic } as unknown as AudioMixer;
    const director = new MusicDirector(mixer, fetcher);

    await director.start();
    await director.start();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(playMusic).toHaveBeenCalledTimes(1);
    expect(playMusic).toHaveBeenCalledWith(buffer, expect.any(Number));
    expect(director.isPlaying).toBe(true);
  });

  it("stays idle and retries when the context cannot decode yet", async () => {
    const buffer = {} as AudioBuffer;
    const decode = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(buffer);
    const playMusic = vi.fn();
    const fetcher = vi.fn(async () => BYTES);
    const mixer = { decode, playMusic } as unknown as AudioMixer;
    const director = new MusicDirector(mixer, fetcher);

    await director.start();
    expect(director.isPlaying).toBe(false);
    expect(playMusic).not.toHaveBeenCalled();

    await director.start();
    expect(director.isPlaying).toBe(true);
    expect(playMusic).toHaveBeenCalledTimes(1);
  });

  it("swallows a fetch failure and stays silent", async () => {
    const decode = vi.fn();
    const playMusic = vi.fn();
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    const mixer = { decode, playMusic } as unknown as AudioMixer;
    const director = new MusicDirector(mixer, fetcher);

    await director.start();

    expect(director.isPlaying).toBe(false);
    expect(decode).not.toHaveBeenCalled();
    expect(playMusic).not.toHaveBeenCalled();
  });
});
