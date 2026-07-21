import type { AudioMixer } from "./audio-mixer";
import { fromDb } from "./cue-library";
import musicUrl from "./assets/lightbeatsmusic-joyful-rhythm-walk-funk-513936.mp3";

/**
 * Linear gain for the looping background track, layered under the Music bus and Master gain so the
 * loop sits below the combat cues. See `assets/ATTRIBUTION.md` for the track's source and licence.
 */
const MUSIC_VOLUME = fromDb(-12);

export type MusicFetcher = (url: string) => Promise<ArrayBuffer>;

const defaultFetcher: MusicFetcher = (url) => fetch(url).then((response) => response.arrayBuffer());

/**
 * Owns the single looping background track. Parallel to `AudioDirector`: a presentation output that
 * holds no gameplay state and no `AudioContext` — the mixer owns playback and teardown. The track
 * fetches and decodes once, then loops on the Music bus. {@link start} is driven from the runtime's
 * gesture unlock, after the mixer's context exists, and is idempotent.
 */
export class MusicDirector {
  private state: "idle" | "loading" | "playing" = "idle";

  constructor(
    private readonly mixer: AudioMixer,
    private readonly fetcher: MusicFetcher = defaultFetcher,
  ) {}

  get isPlaying(): boolean {
    return this.state === "playing";
  }

  /**
   * Fetches, decodes, and starts the looping track once. A no-op while already loading or playing. If
   * the mixer has no live context yet the decode resolves undefined and the director stays idle so a
   * later unlock retries. A fetch or decode failure is swallowed and leaves the director silent.
   */
  async start(): Promise<void> {
    if (this.state !== "idle") {
      return;
    }

    this.state = "loading";
    try {
      const buffer = await this.mixer.decode(await this.fetcher(musicUrl));
      if (buffer) {
        this.mixer.playMusic(buffer, MUSIC_VOLUME);
        this.state = "playing";
      } else {
        this.state = "idle";
      }
    } catch {
      this.state = "idle";
    }
  }
}
