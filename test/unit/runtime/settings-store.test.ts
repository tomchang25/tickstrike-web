import { describe, expect, it, vi } from "vitest";
import {
  SettingsStore,
  type GameSettings,
  type PersistedSettings,
  type SettingsStorage,
} from "@runtime/settings-store";

const DEFAULTS: GameSettings = {
  showDebugOverlay: false,
  masterVolume: 1,
  effectVolume: 1,
  musicVolume: 1,
  muteAudioInBackground: true,
  turnOrderPacing: "staggered",
};

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
    expect(store.get()).toEqual(DEFAULTS);
  });

  it("loads and merges a valid v4 payload over the defaults", () => {
    const { storage } = fakeStorage({
      version: 4,
      data: {
        showDebugOverlay: true,
        masterVolume: 0.5,
        effectVolume: 0.25,
        musicVolume: 0,
        muteAudioInBackground: false,
        turnOrderPacing: "wait-for-vfx",
      },
    });
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual({
      showDebugOverlay: true,
      masterVolume: 0.5,
      effectVolume: 0.25,
      musicVolume: 0,
      muteAudioInBackground: false,
      turnOrderPacing: "wait-for-vfx",
    });
  });

  it("migrates a v2 payload forward, keeping the volumes and defaulting the background-mute flag", () => {
    const { storage } = fakeStorage({
      version: 2,
      data: { showDebugOverlay: true, masterVolume: 0.5, effectVolume: 0.25, musicVolume: 0 },
    });
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual({
      showDebugOverlay: true,
      masterVolume: 0.5,
      effectVolume: 0.25,
      musicVolume: 0,
      muteAudioInBackground: true,
      turnOrderPacing: "staggered",
    });
  });

  it("migrates a v1 payload forward, preserving the debug flag and defaulting the later fields", () => {
    const { storage } = fakeStorage({ version: 1, data: { showDebugOverlay: true } });
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual({ ...DEFAULTS, showDebugOverlay: true });
  });

  it("clamps out-of-range volumes and defaults malformed fields", () => {
    const { storage } = fakeStorage({
      version: 3,
      data: {
        showDebugOverlay: false,
        masterVolume: 2,
        effectVolume: -1,
        musicVolume: "loud",
        muteAudioInBackground: "nope",
      },
    });
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual({
      showDebugOverlay: false,
      masterVolume: 1,
      effectVolume: 0,
      musicVolume: 1,
      muteAudioInBackground: true,
      turnOrderPacing: "staggered",
    });
  });

  it("ignores an unknown-version or malformed payload and does not overwrite until an explicit set", () => {
    const unknownVersion = fakeStorage({ version: 5, data: { showDebugOverlay: true } });
    expect(new SettingsStore(unknownVersion.storage).get()).toEqual(DEFAULTS);
    expect(unknownVersion.saved).toEqual([]);

    const malformed = fakeStorage({ version: 3, data: { showDebugOverlay: "yes" } });
    expect(new SettingsStore(malformed.storage).get()).toEqual(DEFAULTS);
    expect(malformed.saved).toEqual([]);
  });

  it("persists a v4 envelope and notifies subscribers on set", () => {
    const { storage, saved } = fakeStorage();
    const store = new SettingsStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ effectVolume: 0.4 });

    const expected: GameSettings = { ...DEFAULTS, effectVolume: 0.4 };
    expect(store.get()).toEqual(expected);
    expect(saved).toEqual([{ version: 4, data: expected }]);
    expect(listener).toHaveBeenCalledWith(expected);
  });

  it("persists a toggled background-mute preference", () => {
    const { storage, saved } = fakeStorage();
    const store = new SettingsStore(storage);

    store.set({ muteAudioInBackground: false });

    const expected: GameSettings = { ...DEFAULTS, muteAudioInBackground: false };
    expect(store.get()).toEqual(expected);
    expect(saved).toEqual([{ version: 4, data: expected }]);
  });

  it("persists the turn-order pacing preference and defaults invalid values", () => {
    const invalid = new SettingsStore(
      fakeStorage({ version: 4, data: { ...DEFAULTS, turnOrderPacing: "cinematic" } }).storage,
    );
    expect(invalid.get().turnOrderPacing).toBe("staggered");

    const { storage, saved } = fakeStorage();
    const store = new SettingsStore(storage);
    store.set({ turnOrderPacing: "wait-for-vfx" });

    expect(store.get().turnOrderPacing).toBe("wait-for-vfx");
    expect(saved).toEqual([
      {
        version: 4,
        data: { ...DEFAULTS, turnOrderPacing: "wait-for-vfx" },
      },
    ]);
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
