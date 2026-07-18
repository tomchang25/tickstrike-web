import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, WorldSnapshot } from "../core/model/types";
import { installDebugApi } from "../harness/debug-api";
import { requireScenario, scenarios } from "../harness/scenario-registry";
import { GameRuntime } from "../runtime/GameRuntime";
import type { PointerMode } from "../presentation/pixi/PixiGameRenderer";
import { SemanticMirror } from "../ui/SemanticMirror";
import { TestbedPanel } from "../ui/TestbedPanel";

const DEFAULT_SCENARIO = "tick-arena";

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
  const [pointerMode, setPointerMode] = useState<PointerMode>("attack");
  const selectedScenario = useMemo(
    () => requireScenario(selectedScenarioId),
    [selectedScenarioId],
  );
  const commandsEnabled = selectedScenario.commandsEnabled !== false;

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const runtime = new GameRuntime();
    runtimeRef.current = runtime;
    let unsubscribe: () => void = () => undefined;
    let uninstallDebug: () => void = () => undefined;
    let cancelled = false;

    void runtime.mount(host).then(() => {
      if (cancelled) return;
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
    if (!runtime) return;
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
      if (!commandsEnabled) return;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      await execute(() => runtime.execute({ type: "move", actorId: "player", direction }));
    },
    [commandsEnabled, execute],
  );

  const attack = useCallback(
    async (direction: Cell) => {
      if (!commandsEnabled) return;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      await execute(() => runtime.execute({ type: "attack", actorId: "player", direction }));
    },
    [commandsEnabled, execute],
  );

  const dash = useCallback(
    async (direction: Cell) => {
      if (!commandsEnabled) return;
      const runtime = runtimeRef.current;
      if (!runtime) return;
      await execute(() => runtime.execute({ type: "dash", actorId: "player", direction }));
    },
    [commandsEnabled, execute],
  );

  const smash = useCallback(async () => {
    if (!commandsEnabled) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const player = runtime.snapshot().entities.find((entity) => entity.id === "player");
    if (!player) return;
    await execute(() =>
      runtime.execute({
        type: "smash",
        actorId: player.id,
        target: { x: player.cell.x + 1, y: player.cell.y },
      }),
    );
  }, [commandsEnabled, execute]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        if (commandsEnabled) {
          event.preventDefault();
          setPointerMode("mobility");
        }
        return;
      }
      if (!commandsEnabled || busy || event.repeat) return;
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
      if (direction && event.shiftKey) {
        event.preventDefault();
        void dash(direction);
        return;
      }
      if (direction) {
        event.preventDefault();
        void move(direction);
        return;
      }
      const attackDirection = attackDirections[key];
      if (attackDirection) {
        event.preventDefault();
        void attack(attackDirection);
      }
      if (event.code === "Space") {
        event.preventDefault();
        void smash();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setPointerMode("attack");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [attack, busy, commandsEnabled, dash, move, smash]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !snapshot) return;
    runtime.renderer.setPointerMode(pointerMode);
    return runtime.renderer.bindPointerInput({
      canInteract: () => commandsEnabled && !busy,
      onPrimaryClick: (mode, direction) => (mode === "attack" ? attack(direction) : dash(direction)),
    });
  }, [attack, busy, commandsEnabled, dash, pointerMode, snapshot]);

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
            {snapshot ? (
              <SemanticMirror
                snapshot={snapshot}
                generation={runtimeRef.current?.generation}
                isIdle={!busy && Boolean(runtimeRef.current?.isIdle)}
              />
            ) : null}
          </div>
          <p className="hint">
            {commandsEnabled ? "WASD / arrows move · IJKL attack · Hold Alt + hover for Mobility · Space Smash" : "Static inspection: gameplay commands disabled"}
          </p>
        </section>

        {snapshot ? (
          <TestbedPanel
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            snapshot={snapshot}
            busy={busy}
            commandsEnabled={commandsEnabled}
            inspection={selectedScenario.inspection}
            onScenarioChange={changeScenario}
            onMove={move}
            onAttack={attack}
            onDash={dash}
            onSmash={smash}
            onReset={reset}
          />
        ) : (
          <aside className="testbed-panel">Initializing renderer…</aside>
        )}
      </div>
    </main>
  );
}
