/**
 * Player-facing settings owned by the runtime. v2 adds the three audio-mixer volumes, v3 adds the
 * background-audio mute preference, v4 adds turn-order playback pacing, and v5 simplifies that
 * pacing to the two overlap handoff speeds.
 */
export type TurnOrderPacing = "fast" | "normal";

export interface GameSettings {
  /** Grid/reservation debug overlay; only toggleable in development shells. */
  readonly showDebugOverlay: boolean;
  /** Master gain `0..1`; multiplies both bus volumes and so scales all audio. */
  readonly masterVolume: number;
  /** Effect-bus gain `0..1`. */
  readonly effectVolume: number;
  /** Music-bus gain `0..1`; scales the looping background track. */
  readonly musicVolume: number;
  /** When true, audio suspends while the browser tab is hidden. */
  readonly muteAudioInBackground: boolean;
  /** Controls the fixed visual handoff between overlapping logical actor slots. */
  readonly turnOrderPacing: TurnOrderPacing;
}

const DEFAULT_SETTINGS: GameSettings = {
  showDebugOverlay: false,
  masterVolume: 1,
  effectVolume: 1,
  musicVolume: 1,
  muteAudioInBackground: true,
  turnOrderPacing: "fast",
};
const SETTINGS_VERSION = 5;
const KNOWN_VERSIONS: ReadonlySet<number> = new Set([1, 2, 3, 4, SETTINGS_VERSION]);

/** The versioned envelope a `SettingsStorage` persists. `data` is untyped bytes until the store validates it. */
export interface PersistedSettings {
  readonly version: number;
  readonly data: unknown;
}

/**
 * The storage port the store persists through. A platform adapter implements it structurally; the
 * runtime never imports the platform layer. Every method must be total — the adapter swallows its own
 * failures so the store never throws into render.
 */
export interface SettingsStorage {
  load(): PersistedSettings | undefined;
  save(settings: PersistedSettings): void;
}

type SettingsListener = (settings: GameSettings) => void;

/**
 * The single owner of persisted settings. It loads and validates once on construction, exposes the
 * current value and a subscribe seam for the UI, and writes through the injected storage port on every
 * change. It holds no browser or platform knowledge — the adapter is constructor-injected.
 */
export class SettingsStore {
  private current: GameSettings;
  private readonly listeners = new Set<SettingsListener>();

  constructor(private readonly storage: SettingsStorage) {
    this.current = coerceSettings(storage.load());
  }

  get(): GameSettings {
    return this.current;
  }

  set(partial: Partial<GameSettings>): void {
    const next: GameSettings = { ...this.current, ...partial };
    this.current = next;
    this.storage.save({ version: SETTINGS_VERSION, data: next });
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * Merges a loaded envelope over the defaults, ignoring an absent, unknown-version, or malformed
 * payload. Older envelopes migrate forward by field: a v1 payload keeps its `showDebugOverlay` and
 * defaults the v2 volumes; a v1 or v2 payload defaults the v3 background-mute preference; and every
 * v1-v3 payload defaults the v4 pacing preference. v5 maps the retired `staggered` and
 * `wait-for-vfx` values to `fast` and `normal`; the store persists the migrated shape at the
 * current version on the next `set`.
 */
function coerceSettings(persisted: PersistedSettings | undefined): GameSettings {
  if (
    !persisted ||
    !KNOWN_VERSIONS.has(persisted.version) ||
    typeof persisted.data !== "object" ||
    persisted.data === null
  ) {
    return DEFAULT_SETTINGS;
  }

  const record = persisted.data as Record<string, unknown>;
  return {
    showDebugOverlay:
      typeof record.showDebugOverlay === "boolean" ? record.showDebugOverlay : DEFAULT_SETTINGS.showDebugOverlay,
    masterVolume: coerceVolume(record.masterVolume, DEFAULT_SETTINGS.masterVolume),
    effectVolume: coerceVolume(record.effectVolume, DEFAULT_SETTINGS.effectVolume),
    musicVolume: coerceVolume(record.musicVolume, DEFAULT_SETTINGS.musicVolume),
    muteAudioInBackground:
      typeof record.muteAudioInBackground === "boolean"
        ? record.muteAudioInBackground
        : DEFAULT_SETTINGS.muteAudioInBackground,
    turnOrderPacing: coerceTurnOrderPacing(record.turnOrderPacing),
  };
}

function coerceTurnOrderPacing(value: unknown): TurnOrderPacing {
  if (value === "fast" || value === "normal") {
    return value;
  }
  if (value === "staggered") {
    return "fast";
  }
  if (value === "wait-for-vfx") {
    return "normal";
  }
  return DEFAULT_SETTINGS.turnOrderPacing;
}

/** Reads a persisted volume, clamping to `0..1` and falling back when absent or malformed. */
function coerceVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}
