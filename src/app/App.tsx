import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell, WorldSnapshot } from "../core/model/types";
import { installDebugApi } from "../harness/debug-api";
import { requireScenario, scenarios } from "../harness/scenario-registry";
import { GameRuntime } from "../runtime/GameRuntime";
import { SemanticMirror } from "../ui/SemanticMirror";
import { TestbedPanel } from "../ui/TestbedPanel";

const DEFAULT_SCENARIO = "smash-water";

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
  const selectedScenario = useMemo(
    () => requireScenario(selectedScenarioId),
    [selectedScenarioId],
  );

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
    setSelectedScenarioId(id);
    runtime.loadScenario(scenario);
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", id);
    window.history.replaceState({}, "", url);
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
      const runtime = runtimeRef.current;
      if (!runtime) return;
      await execute(() => runtime.execute({ type: "move", actorId: "player", direction }));
    },
    [execute],
  );

  const smash = useCallback(async () => {
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
  }, [execute]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (busy || event.repeat) return;
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
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        void move(direction);
      }
      if (event.code === "Space") {
        event.preventDefault();
        void smash();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, move, smash]);

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
            {snapshot ? <SemanticMirror snapshot={snapshot} /> : null}
          </div>
          <p className="hint">WASD / arrows to move · Space to Smash</p>
        </section>

        {snapshot ? (
          <TestbedPanel
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            snapshot={snapshot}
            busy={busy}
            onScenarioChange={changeScenario}
            onMove={move}
            onSmash={smash}
            onReset={() => runtimeRef.current?.reset()}
          />
        ) : (
          <aside className="testbed-panel">Initializing renderer…</aside>
        )}
      </div>
    </main>
  );
}
