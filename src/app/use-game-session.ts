import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { previewAttack } from "@core/actions/action-preview";
import type { Cell, MilestoneChoice, WorldSnapshot } from "@core/model/types";
import { createLocalStorageSettingsStorage } from "@platform/settings-storage";
import type { TestScenario } from "@harness/types";
import type { PointerCommit, PointerMode } from "@presentation/pixi/pixi-game-renderer";
import {
  parseEntityPresentationProfileCatalog,
  setRuntimeEntityPresentationProfileCatalog,
} from "@presentation/pixi/entity-presentation-profiles";
import {
  parseActionPresentationCatalog,
  setRuntimeActionPresentationCatalog,
} from "@presentation/actions/action-presentation-catalog";
import { GameRuntime } from "@runtime/game-runtime";
import { SettingsStore, type GameSettings } from "@runtime/settings-store";
import { useKeyboardInput } from "@ui/input/use-keyboard-input";

export interface GameSessionOptions {
  initialScenario: TestScenario;
  /**
   * Install the window debug API used by Playwright and manual inspection.
   * Development builds only: the DEV-guarded dynamic import below keeps the debug
   * API and the full scenario registry out of the production bundle.
   */
  debugApi: boolean;
}

export interface GameSession {
  canvasHostRef: RefObject<HTMLDivElement | null>;
  runtimeRef: RefObject<GameRuntime | undefined>;
  scenario: TestScenario;
  snapshot: WorldSnapshot | undefined;
  busy: boolean;
  pointerMode: PointerMode;
  interactive: boolean;
  settings: GameSettings;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  buildOpen: boolean;
  setBuildOpen: (open: boolean) => void;
  setShowDebugOverlay: (value: boolean) => void;
  setMasterVolume: (value: number) => void;
  setEffectVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setMuteAudioInBackground: (value: boolean) => void;
  loadScenario: (scenario: TestScenario) => void;
  reset: () => void;
  selectReward: (artifactId: string) => Promise<void>;
  selectMilestoneDecision: (choice: MilestoneChoice) => Promise<void>;
}

export function useGameSession({ initialScenario, debugApi }: GameSessionOptions): GameSession {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntime | undefined>(undefined);
  const settingsStoreRef = useRef<SettingsStore | undefined>(undefined);
  if (!settingsStoreRef.current) {
    settingsStoreRef.current = new SettingsStore(createLocalStorageSettingsStorage());
  }
  const settingsStore = settingsStoreRef.current;
  const [scenario, setScenario] = useState(initialScenario);
  const [snapshot, setSnapshot] = useState<WorldSnapshot>();
  const [busy, setBusy] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>("attack");
  const [settings, setSettings] = useState<GameSettings>(() => settingsStore.get());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const commandsEnabled = scenario.commandsEnabled !== false;
  const encounterRunning = snapshot?.outcome === "running";
  const pendingReward = snapshot?.pendingReward;
  const pendingMilestone = snapshot?.pendingMilestone;
  // React disabling is supplementary; the runtime's own command serialization already rejects a
  // command while a reward selection or milestone decision is pending (see resolveCommand). The
  // settings and build panels join this gate so gameplay input is inert while either is open.
  const interactive =
    commandsEnabled && encounterRunning && !pendingReward && !pendingMilestone && !settingsOpen && !buildOpen;

  useEffect(() => settingsStore.subscribe(setSettings), [settingsStore]);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }
    const refreshProfiles = async () => {
      try {
        const response = await fetch("/__debug/entity-presentation-profile-catalog");
        if (!response.ok) {
          return;
        }
        setRuntimeEntityPresentationProfileCatalog(parseEntityPresentationProfileCatalog(await response.json()));
        runtimeRef.current?.refreshEntityPresentationProfiles();
      } catch {
        // The dev authoring panel reports endpoint failures to its own user. A stale
        // gameplay preview is safer than taking down an active session here.
      }
    };
    import.meta.hot.on("entity-presentation-catalog-updated", refreshProfiles);
    return () => import.meta.hot?.off("entity-presentation-catalog-updated", refreshProfiles);
  }, []);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }
    const refreshActions = async () => {
      try {
        const response = await fetch("/__debug/action-presentation-catalog");
        if (!response.ok) {
          return;
        }
        setRuntimeActionPresentationCatalog(parseActionPresentationCatalog(await response.json()));
        runtimeRef.current?.refreshPlayerPresentation();
      } catch {
        // A stale player preview is safer than interrupting an active session on a dev endpoint error.
      }
    };
    import.meta.hot.on("action-presentation-catalog-updated", refreshActions);
    return () => import.meta.hot?.off("action-presentation-catalog-updated", refreshActions);
  }, []);

  // Escape is the single settings entry/exit: it closes whichever panel is open, does nothing while a
  // reward or milestone decision is pending, and otherwise summons the settings panel.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
      } else if (buildOpen) {
        setBuildOpen(false);
      } else if (!pendingReward && !pendingMilestone) {
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, buildOpen, pendingReward, pendingMilestone]);

  const setShowDebugOverlay = useCallback(
    (value: boolean) => settingsStore.set({ showDebugOverlay: value }),
    [settingsStore],
  );

  const setMasterVolume = useCallback((value: number) => settingsStore.set({ masterVolume: value }), [settingsStore]);
  const setEffectVolume = useCallback((value: number) => settingsStore.set({ effectVolume: value }), [settingsStore]);
  const setMusicVolume = useCallback((value: number) => settingsStore.set({ musicVolume: value }), [settingsStore]);
  const setMuteAudioInBackground = useCallback(
    (value: boolean) => settingsStore.set({ muteAudioInBackground: value }),
    [settingsStore],
  );

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }

    const runtime = new GameRuntime();
    runtimeRef.current = runtime;
    let unsubscribe: () => void = () => undefined;
    let uninstallDebug: () => void = () => undefined;
    let cancelled = false;

    void runtime.mount(host).then(async () => {
      if (cancelled) {
        return;
      }
      runtime.loadScenario(scenario);
      unsubscribe = runtime.subscribe(setSnapshot);
      if (debugApi && import.meta.env.DEV) {
        const { installDebugApi } = await import("@harness/debug-api");
        if (!cancelled) {
          uninstallDebug = installDebugApi(runtime);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
      uninstallDebug();
      runtime.destroy();
      runtimeRef.current = undefined;
    };
  }, []);

  const loadScenario = useCallback((next: TestScenario) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    setPointerMode("attack");
    setScenario(next);
    runtime.loadScenario(next);
  }, []);

  const reset = useCallback(() => {
    setPointerMode("attack");
    runtimeRef.current?.reset();
  }, []);

  const execute = useCallback(async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await operation();
    } finally {
      setBusy(false);
    }
  }, []);

  const move = useCallback(
    async (direction: Cell) => {
      if (!interactive) {
        return;
      }
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      await execute(() => runtime.execute({ type: "move", actorId: "player", direction }));
    },
    [execute, interactive],
  );

  const attack = useCallback(
    async (direction: Cell) => {
      if (!interactive) {
        return;
      }
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      await execute(() => runtime.execute({ type: "attack", actorId: "player", direction }));
    },
    [execute, interactive],
  );

  const dash = useCallback(
    async (direction: Cell, distance?: number) => {
      if (!interactive) {
        return;
      }
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      await execute(() => runtime.execute({ type: "dash", actorId: "player", direction, distance }));
    },
    [execute, interactive],
  );

  const smash = useCallback(
    async (target: Cell) => {
      if (!interactive) {
        return;
      }
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      const player = runtime.snapshot().entities.find((entity) => entity.id === "player");
      if (!player) {
        return;
      }
      await execute(() =>
        runtime.execute({
          type: "smash",
          actorId: player.id,
          target,
        }),
      );
    },
    [execute, interactive],
  );

  const selectReward = useCallback(
    async (artifactId: string) => {
      const runtime = runtimeRef.current;
      if (!runtime || !pendingReward) {
        return;
      }
      await execute(() => runtime.selectReward(artifactId));
    },
    [execute, pendingReward],
  );

  const selectMilestoneDecision = useCallback(
    async (choice: MilestoneChoice) => {
      const runtime = runtimeRef.current;
      if (!runtime || !pendingMilestone) {
        return;
      }
      await execute(() => runtime.selectMilestoneDecision(choice));
    },
    [execute, pendingMilestone],
  );

  const cancelArmedSmash = useCallback(async () => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    await execute(() => runtime.cancelArmedSmash());
  }, [execute]);

  // A movement key attacks instead of moving when its direction has an attack target; otherwise it
  // moves. Re-decided against the current snapshot on every held-repeat step.
  const moveOrAttack = useCallback(
    async (direction: Cell) => {
      const runtime = runtimeRef.current;
      if (!interactive || !runtime) {
        return;
      }
      const currentSnapshot = runtime.snapshot();
      const player = currentSnapshot.entities.find((entity) => entity.id === "player");
      const preview = player ? previewAttack(currentSnapshot, player.id, direction) : undefined;
      if (preview?.accepted && preview.hasTarget) {
        await attack(direction);
      } else {
        await move(direction);
      }
    },
    [attack, interactive, move],
  );

  useKeyboardInput({
    interactive,
    handlers: {
      moveOrAttack,
      attack,
      setMobilityActive: (active: boolean) => setPointerMode(active ? "mobility" : "attack"),
    },
  });

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !snapshot) {
      return;
    }
    runtime.renderer.setDebugMode(settings.showDebugOverlay);
  }, [settings.showDebugOverlay, snapshot]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !snapshot) {
      return;
    }
    runtime.audio.setVolumes({
      master: settings.masterVolume,
      effect: settings.effectVolume,
      music: settings.musicVolume,
    });
  }, [settings.masterVolume, settings.effectVolume, settings.musicVolume, snapshot]);

  // The browser audio context starts suspended; unlock it on the first user gesture. The listeners
  // remove themselves once the runtime is mounted and unlocked, and on unmount. A gesture that lands
  // before mount is a no-op and leaves the listeners in place for the next one.
  useEffect(() => {
    const unlock = () => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      runtime.unlockAudio();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Pause audio while the tab is hidden and resume it on return, unless the player has opted to keep
  // audio playing in the background. Resume stays unconditional: it is a guarded no-op when the
  // context was never suspended, so it also recovers audio if the preference was turned off while
  // hidden. Separate from the input layer's own visibility handler; both suspend/resume are guarded
  // no-ops before the context is unlocked.
  useEffect(() => {
    const onVisibilityChange = () => {
      const runtime = runtimeRef.current;
      if (!runtime) {
        return;
      }
      if (document.visibilityState === "hidden") {
        if (settings.muteAudioInBackground) {
          runtime.audio.suspend();
        }
      } else {
        runtime.audio.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [settings.muteAudioInBackground]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !snapshot) {
      return;
    }
    runtime.renderer.setPointerMode(pointerMode);
    return runtime.renderer.bindPointerInput({
      canInteract: () => interactive,
      onPrimaryClick: (commit: PointerCommit) => {
        if (commit.kind === "attack") {
          return attack(commit.direction);
        }
        if (commit.kind === "dash") {
          return dash(commit.direction, commit.distance);
        }
        return smash(commit.target);
      },
      onCancel: () => cancelArmedSmash(),
    });
  }, [attack, cancelArmedSmash, dash, interactive, pointerMode, smash, snapshot]);

  return {
    canvasHostRef,
    runtimeRef,
    scenario,
    snapshot,
    busy,
    pointerMode,
    interactive,
    settings,
    settingsOpen,
    setSettingsOpen,
    buildOpen,
    setBuildOpen,
    setShowDebugOverlay,
    setMasterVolume,
    setEffectVolume,
    setMusicVolume,
    setMuteAudioInBackground,
    loadScenario,
    reset,
    selectReward,
    selectMilestoneDecision,
  };
}
