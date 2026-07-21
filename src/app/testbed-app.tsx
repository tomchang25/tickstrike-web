import { useCallback, useMemo, useState } from "react";
import type { MobilityKind } from "@core/model/types";
import { requireScenario, scenarios } from "@harness/scenario-registry";
import { MilestoneOverlay } from "@ui/milestone-overlay";
import { RewardOverlay } from "@ui/reward-overlay";
import { RunBuildHud } from "@ui/run-build-hud";
import { SemanticMirror } from "@ui/semantic-mirror";
import { TestbedPanel } from "@ui/testbed-panel";
import { useGameSession } from "./use-game-session";

const DEFAULT_SCENARIO = "tick-arena";

function scenarioFromUrl(): string {
  const id = new URLSearchParams(window.location.search).get("scenario");
  return id && scenarios.some((scenario) => scenario.id === id) ? id : DEFAULT_SCENARIO;
}

export function TestbedApp() {
  const initialScenario = useMemo(() => requireScenario(scenarioFromUrl()), []);
  const [debugMode, setDebugMode] = useState(false);
  const session = useGameSession({ initialScenario, debugApi: true, debugMode });
  const { scenario, snapshot, busy, runtimeRef } = session;
  const commandsEnabled = scenario.commandsEnabled !== false;
  const pendingReward = snapshot?.pendingReward;
  const pendingMilestone = snapshot?.pendingMilestone;

  const changeScenario = useCallback(
    (id: string) => {
      session.loadScenario(requireScenario(id));
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", id);
      window.history.replaceState({}, "", url);
    },
    [session.loadScenario],
  );

  const activeMobility: MobilityKind =
    snapshot?.entities.find((entity) => entity.kind === "player")?.mobility?.kind ?? "dash";

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Agent-first vertical slice</p>
          <h1>Tickstrike Testbed</h1>
        </div>
        <p>Pure TypeScript rules · Pixi presentation · React testbed · Playwright hooks</p>
      </header>

      <div className="workspace">
        <section className="game-column" aria-label="Game viewport">
          <div className="canvas-frame" data-testid="game-canvas-host">
            <div ref={session.canvasHostRef} className="canvas-host" />
            {snapshot && snapshot.outcome !== "running" ? (
              <div
                className={`terminal-banner terminal-banner-${snapshot.outcome}`}
                data-testid="encounter-result"
                data-outcome={snapshot.outcome}
                role="status"
                aria-live="polite"
              >
                <strong>{snapshot.outcome === "victory" ? "Victory" : "Defeat"}</strong>
                <span>{snapshot.outcome === "victory" ? "Arena cleared." : "The player fell."}</span>
              </div>
            ) : null}
            {snapshot ? (
              <SemanticMirror
                snapshot={snapshot}
                generation={runtimeRef.current?.generation}
                isIdle={Boolean(runtimeRef.current?.isIdle)}
              />
            ) : null}
            {pendingReward ? <RewardOverlay offer={pendingReward} busy={busy} onSelect={session.selectReward} /> : null}
            {pendingMilestone ? (
              <MilestoneOverlay decision={pendingMilestone} busy={busy} onDecide={session.selectMilestoneDecision} />
            ) : null}
          </div>
          {snapshot ? <RunBuildHud build={snapshot.runBuild} /> : null}
          <p className="hint">
            {commandsEnabled
              ? "WASD / arrows move · IJKL attack · Hold Alt + hover for selected Mobility"
              : "Static inspection: gameplay commands disabled"}
          </p>
        </section>

        {snapshot ? (
          <TestbedPanel
            scenarios={scenarios}
            selectedScenarioId={scenario.id}
            snapshot={snapshot}
            busy={busy}
            commandsEnabled={commandsEnabled}
            selectedMobility={activeMobility}
            debugMode={debugMode}
            outcome={snapshot.outcome}
            inspection={scenario.inspection}
            onScenarioChange={changeScenario}
            onDebugModeChange={setDebugMode}
            onReset={session.reset}
          />
        ) : (
          <aside className="testbed-panel">Initializing renderer…</aside>
        )}
      </div>
    </main>
  );
}
