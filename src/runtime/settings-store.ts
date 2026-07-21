/** Player-facing settings owned by the runtime. v1 carries a single development-only preference. */
export interface GameSettings {
  /** Grid/reservation debug overlay; only toggleable in development shells. */
  readonly showDebugOverlay: boolean;
}

const DEFAULT_SETTINGS: GameSettings = { showDebugOverlay: false };
const SETTINGS_VERSION = 1;

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

/** Merges a loaded envelope over the defaults, ignoring an absent, wrong-version, or malformed payload. */
function coerceSettings(persisted: PersistedSettings | undefined): GameSettings {
  if (
    !persisted ||
    persisted.version !== SETTINGS_VERSION ||
    typeof persisted.data !== "object" ||
    persisted.data === null
  ) {
    return DEFAULT_SETTINGS;
  }
  const record = persisted.data as Record<string, unknown>;
  return {
    showDebugOverlay:
      typeof record.showDebugOverlay === "boolean" ? record.showDebugOverlay : DEFAULT_SETTINGS.showDebugOverlay,
  };
}
