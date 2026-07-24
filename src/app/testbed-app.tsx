import { useCallback, useMemo } from "react";
import type { MobilityKind } from "@core/model/types";
import { requireScenario, scenarios } from "@harness/scenario-registry";
import { GameHud } from "@ui/hud/game-hud";
import { MilestoneOverlay } from "@ui/milestone-overlay";
import { RewardOverlay } from "@ui/reward-overlay";
import { SemanticMirror } from "@ui/semantic-mirror";
import { SettingsPanel } from "@ui/settings/settings-panel";
import { TestbedPanel } from "@ui/testbed-panel";
import { useGameSession } from "./use-game-session";

const DEFAULT_SCENARIO = "tick-arena";

function scenarioFromUrl(): string {
  const id = new URLSearchParams(window.location.search).get("scenario");
  return id && scenarios.some((scenario) => scenario.id === id) ? id : DEFAULT_SCENARIO;
}

export function TestbedApp() {
  const initialScenario = useMemo(() => requireScenario(scenarioFromUrl()), []);
  const session = useGameSession({ initialScenario, debugApi: true });
  const { scenario, snapshot, busy, runtimeRef } = session;
  const debugMode = session.settings.showDebugOverlay;
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
            {snapshot ? (
              <GameHud
                snapshot={snapshot}
                commandsEnabled={commandsEnabled}
                buildOpen={session.buildOpen}
                onBuildOpenChange={session.setBuildOpen}
                turnOrder={session.turnOrder}
                onTurnOrderHoveredEntityChange={session.setTurnOrderHoveredEntity}
              />
            ) : null}
            <SettingsPanel
              open={session.settingsOpen}
              onOpenChange={session.setSettingsOpen}
              showDebugOverlay={session.settings.showDebugOverlay}
              onShowDebugOverlayChange={session.setShowDebugOverlay}
              volume={{
                master: session.settings.masterVolume,
                effect: session.settings.effectVolume,
                music: session.settings.musicVolume,
              }}
              onMasterVolumeChange={session.setMasterVolume}
              onEffectVolumeChange={session.setEffectVolume}
              onMusicVolumeChange={session.setMusicVolume}
              muteAudioInBackground={session.settings.muteAudioInBackground}
              onMuteAudioInBackgroundChange={session.setMuteAudioInBackground}
              turnOrderPacing={session.settings.turnOrderPacing}
              onTurnOrderPacingChange={session.setTurnOrderPacing}
              onRestart={session.reset}
            />
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
          {snapshot && !commandsEnabled ? <p className="hint">Static inspection: gameplay commands disabled</p> : null}
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
            onDebugModeChange={session.setShowDebugOverlay}
            onReset={session.reset}
          />
        ) : (
          <aside className="testbed-panel">Initializing renderer…</aside>
        )}
      </div>
    </main>
  );
}
