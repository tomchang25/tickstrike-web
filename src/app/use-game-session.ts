import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Cell, WorldSnapshot } from "@core/model/types";
import type { TestScenario } from "@harness/types";
import type { PointerCommit, PointerMode } from "@presentation/pixi/pixi-game-renderer";
import { GameRuntime } from "@runtime/game-runtime";

const MOVE_REPEAT_MS = 50;

export interface GameSessionOptions {
  initialScenario: TestScenario;
  /**
   * Install the window debug API used by Playwright and manual inspection.
   * Development builds only: the DEV-guarded dynamic import below keeps the debug
   * API and the full scenario registry out of the production bundle.
   */
  debugApi: boolean;
  /** Forwarded to the renderer's debug overlay; command flow is unaffected. */
  debugMode: boolean;
}

export interface GameSession {
  canvasHostRef: RefObject<HTMLDivElement | null>;
  runtimeRef: RefObject<GameRuntime | undefined>;
  scenario: TestScenario;
  snapshot: WorldSnapshot | undefined;
  busy: boolean;
  pointerMode: PointerMode;
  interactive: boolean;
  loadScenario: (scenario: TestScenario) => void;
  reset: () => void;
  selectReward: (artifactId: string) => Promise<void>;
}

export function useGameSession({ initialScenario, debugApi, debugMode }: GameSessionOptions): GameSession {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntime | undefined>(undefined);
  const [scenario, setScenario] = useState(initialScenario);
  const [snapshot, setSnapshot] = useState<WorldSnapshot>();
  const [busy, setBusy] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>("attack");
  const commandsEnabled = scenario.commandsEnabled !== false;
  const encounterRunning = snapshot?.outcome === "running";
  const pendingReward = snapshot?.pendingReward;
  // React disabling is supplementary; the runtime's own command serialization already rejects a
  // command while a reward selection is pending (see resolveCommand).
  const interactive = commandsEnabled && encounterRunning && !pendingReward;

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

  useEffect(() => {
    const heldMovement = new Map<string, number>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        if (interactive) {
          event.preventDefault();
          setPointerMode("mobility");
        }
        return;
      }
      if (!interactive) {
        return;
      }
      const directions: Record<string, Cell | undefined> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const attackDirections: Record<string, Cell> = {
        i: { x: 0, y: -1 },
        j: { x: -1, y: 0 },
        k: { x: 0, y: 1 },
        l: { x: 1, y: 0 },
      };
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const direction = directions[key];
      if (direction) {
        event.preventDefault();
        if (heldMovement.has(key)) {
          return;
        }
        const repeatMove = () => {
          const runtime = runtimeRef.current;
          if (!runtime || !runtime.isIdle) {
            return;
          }
          void move(direction);
        };
        repeatMove();
        heldMovement.set(key, window.setInterval(repeatMove, MOVE_REPEAT_MS));
        return;
      }
      const attackDirection = attackDirections[key];
      if (attackDirection) {
        if (event.repeat) {
          return;
        }
        event.preventDefault();
        void attack(attackDirection);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setPointerMode("attack");
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const timer = heldMovement.get(key);
      if (timer !== undefined) {
        window.clearInterval(timer);
        heldMovement.delete(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.documentElement.dataset.keyboardInputReady = "true";
    return () => {
      for (const timer of heldMovement.values()) {
        window.clearInterval(timer);
      }
      heldMovement.clear();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      delete document.documentElement.dataset.keyboardInputReady;
    };
  }, [attack, interactive, move]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !snapshot) {
      return;
    }
    runtime.renderer.setDebugMode(debugMode);
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
    });
  }, [attack, dash, debugMode, interactive, pointerMode, smash, snapshot]);

  return {
    canvasHostRef,
    runtimeRef,
    scenario,
    snapshot,
    busy,
    pointerMode,
    interactive,
    loadScenario,
    reset,
    selectReward,
  };
}
