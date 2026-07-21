/** Player-facing settings owned by the runtime. v2 adds the three audio-mixer volumes. */
export interface GameSettings {
  /** Grid/reservation debug overlay; only toggleable in development shells. */
  readonly showDebugOverlay: boolean;
  /** Master gain `0..1`; multiplies both bus volumes and so scales all audio. */
  readonly masterVolume: number;
  /** Effect-bus gain `0..1`. */
  readonly effectVolume: number;
  /** Music-bus gain `0..1`. Wired structurally; no music source plays through it yet. */
  readonly musicVolume: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  showDebugOverlay: false,
  masterVolume: 1,
  effectVolume: 1,
  musicVolume: 1,
};
const SETTINGS_VERSION = 2;

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
 * payload. A v1 envelope migrates forward: its `showDebugOverlay` is preserved and the volumes added
 * in v2 default. The store persists the migrated shape at v2 on the next `set`.
 */
function coerceSettings(persisted: PersistedSettings | undefined): GameSettings {
  if (
    !persisted ||
    (persisted.version !== 1 && persisted.version !== SETTINGS_VERSION) ||
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
  };
}

/** Reads a persisted volume, clamping to `0..1` and falling back when absent or malformed. */
function coerceVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}
