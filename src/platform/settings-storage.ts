const STORAGE_KEY = "tickstrike.settings";

/** The versioned envelope stored in `localStorage`. Structurally matches the runtime `SettingsStorage` port. */
interface StoredSettings {
  readonly version: number;
  readonly data: unknown;
}

/** The storage port shape the runtime's `SettingsStore` consumes; declared locally so this leaf imports nothing. */
export interface SettingsStorage {
  load(): StoredSettings | undefined;
  save(settings: StoredSettings): void;
}

/**
 * A `localStorage`-backed settings storage adapter. All access is wrapped so an unavailable store
 * (private mode, disabled storage, quota) degrades to in-memory operation: `load` returns undefined
 * (the store falls back to defaults) and `save` is a caught no-op. It never throws.
 */
export function createLocalStorageSettingsStorage(): SettingsStorage {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return undefined;
        }
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || typeof (parsed as StoredSettings).version !== "number") {
          return undefined;
        }
        return parsed as StoredSettings;
      } catch {
        return undefined;
      }
    },
    save(settings) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // Storage unavailable (private mode, quota); keep the in-memory session working.
      }
    },
  };
}
