import { describe, expect, it, vi } from "vitest";
import { SettingsStore, type PersistedSettings, type SettingsStorage } from "@runtime/settings-store";

function fakeStorage(initial?: PersistedSettings): { storage: SettingsStorage; saved: PersistedSettings[] } {
  const saved: PersistedSettings[] = [];
  return {
    saved,
    storage: {
      load: () => initial,
      save: (settings) => {
        saved.push(settings);
      },
    },
  };
}

describe("SettingsStore", () => {
  it("falls back to defaults when storage is empty", () => {
    const store = new SettingsStore(fakeStorage().storage);
    expect(store.get()).toEqual({ showDebugOverlay: false });
  });

  it("loads and merges a valid persisted payload over the defaults", () => {
    const { storage } = fakeStorage({ version: 1, data: { showDebugOverlay: true } });
    const store = new SettingsStore(storage);
    expect(store.get().showDebugOverlay).toBe(true);
  });

  it("ignores a wrong-version or malformed payload and does not overwrite until an explicit set", () => {
    const wrongVersion = fakeStorage({ version: 2, data: { showDebugOverlay: true } });
    expect(new SettingsStore(wrongVersion.storage).get()).toEqual({ showDebugOverlay: false });
    expect(wrongVersion.saved).toEqual([]);

    const malformed = fakeStorage({ version: 1, data: { showDebugOverlay: "yes" } });
    expect(new SettingsStore(malformed.storage).get()).toEqual({ showDebugOverlay: false });
    expect(malformed.saved).toEqual([]);
  });

  it("persists a versioned envelope and notifies subscribers on set", () => {
    const { storage, saved } = fakeStorage();
    const store = new SettingsStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ showDebugOverlay: true });

    expect(store.get().showDebugOverlay).toBe(true);
    expect(saved).toEqual([{ version: 1, data: { showDebugOverlay: true } }]);
    expect(listener).toHaveBeenCalledWith({ showDebugOverlay: true });
  });

  it("keeps working in memory when the storage adapter reports failure by no-op", () => {
    // A degraded adapter (private mode/quota) loads nothing and drops saves; the store must not throw.
    const store = new SettingsStore({ load: () => undefined, save: () => undefined });
    expect(() => store.set({ showDebugOverlay: true })).not.toThrow();
    expect(store.get().showDebugOverlay).toBe(true);
  });

  it("stops notifying after unsubscribe", () => {
    const store = new SettingsStore(fakeStorage().storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set({ showDebugOverlay: true });
    expect(listener).not.toHaveBeenCalled();
  });
});
