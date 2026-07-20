import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, MobilityKind, WorldSnapshot } from "../core/model/types";
import { installDebugApi } from "../harness/debug-api";
import { requireScenario, scenarios } from "../harness/scenario-registry";
import { GameRuntime } from "../runtime/GameRuntime";
import type { PointerCommit, PointerMode } from "../presentation/pixi/PixiGameRenderer";
import { RewardOverlay } from "../ui/RewardOverlay";
import { SemanticMirror } from "../ui/SemanticMirror";
import { TestbedPanel } from "../ui/TestbedPanel";

const DEFAULT_SCENARIO = "tick-arena";
const MOVE_REPEAT_MS = 50;

function scenarioFromUrl(): string {
  const id = new URLSearchParams(window.location.search).get("scenario");
  return id && scenarios.some((scenario) => scenario.id === id) ? id : DEFAULT_SCENARIO;
}

export function App() {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GameRuntime | undefined>(undefined);
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarioFromUrl);
  const [snapshot, setSnapshot] = useState<WorldSnapshot>();
  const [busy, setBusy] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [pointerMode, setPointerMode] = useState<PointerMode>("attack");
  const selectedScenario = useMemo(() => requireScenario(selectedScenarioId), [selectedScenarioId]);
  const commandsEnabled = selectedScenario.commandsEnabled !== false;
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

    void runtime.mount(host).then(() => {
      if (cancelled) {
        return;
      }
      runtime.loadScenario(selectedScenario);
      unsubscribe = runtime.subscribe(setSnapshot);
      uninstallDebug = installDebugApi(runtime);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      uninstallDebug();
      runtime.destroy();
      runtimeRef.current = undefined;
    };
  }, []);

  const changeScenario = useCallback((id: string) => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const scenario = requireScenario(id);
    setPointerMode("attack");
    setSelectedScenarioId(id);
    runtime.loadScenario(scenario);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", id);
    window.history.replaceState({}, "", url);
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
      await execute(() =>
        runtime.execute({ type: "dash", actorId: "player", direction, distance }),
      );
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

  const activeMobility: MobilityKind =
    snapshot?.entities.find((entity) => entity.kind === "player")?.mobility?.kind ?? "dash";

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Agent-first vertical slice</p>
          <h1>Tickstrike Web Base</h1>
        </div>
        <p>Pure TypeScript rules · Pixi presentation · React testbed · Playwright hooks</p>
      </header>

      <div className="workspace">
        <section className="game-column" aria-label="Game viewport">
          <div className="canvas-frame" data-testid="game-canvas-host">
            <div ref={canvasHostRef} className="canvas-host" />
            {snapshot && snapshot.outcome !== "running" ? (
              <div
                className={`terminal-banner terminal-banner-${snapshot.outcome}`}
                data-testid="encounter-result"
                data-outcome={snapshot.outcome}
                role="status"
                aria-live="polite"
              >
                <strong>{snapshot.outcome === "victory" ? "Victory" : "Defeat"}</strong>
                <span>
                  {snapshot.outcome === "victory" ? "Arena cleared." : "The player fell."}
                </span>
              </div>
            ) : null}
            {snapshot ? (
              <SemanticMirror
                snapshot={snapshot}
                generation={runtimeRef.current?.generation}
                isIdle={Boolean(runtimeRef.current?.isIdle)}
              />
            ) : null}
            {pendingReward ? (
              <RewardOverlay offer={pendingReward} busy={busy} onSelect={selectReward} />
            ) : null}
          </div>
          <p className="hint">
            {commandsEnabled
              ? "WASD / arrows move · IJKL attack · Hold Alt + hover for selected Mobility"
              : "Static inspection: gameplay commands disabled"}
          </p>
        </section>

        {snapshot ? (
          <TestbedPanel
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            snapshot={snapshot}
            busy={busy}
            commandsEnabled={commandsEnabled}
            selectedMobility={activeMobility}
            debugMode={debugMode}
            outcome={snapshot.outcome}
            inspection={selectedScenario.inspection}
            onScenarioChange={changeScenario}
            onDebugModeChange={setDebugMode}
            onReset={reset}
          />
        ) : (
          <aside className="testbed-panel">Initializing renderer…</aside>
        )}
      </div>
    </main>
  );
}
