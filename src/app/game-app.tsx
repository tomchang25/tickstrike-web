// The home shell imports its scenario module directly instead of the scenario registry:
// the registry's import.meta.glob would pull every harness scenario into the production bundle.
import { useEffect } from "react";
import { scenarios as runScenarios } from "@harness/scenarios/run.scenario";
import { GameHud } from "@ui/hud/game-hud";
import { MilestoneOverlay } from "@ui/milestone-overlay";
import { RewardOverlay } from "@ui/reward-overlay";
import { SemanticMirror } from "@ui/semantic-mirror";
import { SettingsPanel } from "@ui/settings/settings-panel";
import { useGameSession } from "./use-game-session";

function requireHomeScenario() {
  const scenario = runScenarios.find((candidate) => candidate.id === "run");
  if (!scenario) {
    throw new Error("Missing run scenario.");
  }
  return scenario;
}

const HOME_SCENARIO = requireHomeScenario();

/** Board internal width (18 cells × 64px); matches the renderer canvas and the .game-hud design size. */
const BOARD_PX = 1152;

export function GameApp() {
  const initialScenario = HOME_SCENARIO;
  const session = useGameSession({ initialScenario, debugApi: true });
  const { snapshot, busy, runtimeRef } = session;
  const pendingReward = snapshot?.pendingReward;
  const pendingMilestone = snapshot?.pendingMilestone;

  // Scale the HUD in lockstep with the displayed board: --hud-scale = displayed board width / 1152.
  // The frame's content width is the displayed board width (the canvas fills it), CSS-driven and
  // available immediately, so it needs no canvas-mount timing and updates on every viewport resize.
  useEffect(() => {
    const frame = session.canvasHostRef.current?.parentElement;
    if (!frame) {
      return;
    }
    const apply = () => {
      if (frame.clientWidth > 0) {
        frame.style.setProperty("--hud-scale", String(frame.clientWidth / BOARD_PX));
      }
    };
    const observer = new ResizeObserver(apply);
    observer.observe(frame);
    apply();
    return () => observer.disconnect();
  }, [session.canvasHostRef]);

  return (
    <main className="game-shell">
      <div className="game-stage">
        <h1 className="game-title">Tickstrike</h1>
        <div className="canvas-frame" data-testid="game-canvas-host">
          <div ref={session.canvasHostRef} className="canvas-host" />
          {snapshot ? (
            <GameHud snapshot={snapshot} buildOpen={session.buildOpen} onBuildOpenChange={session.setBuildOpen} />
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
              <button type="button" className="primary-command" onClick={session.reset}>
                Play again
              </button>
            </div>
          ) : null}
          {import.meta.env.DEV && snapshot ? (
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
      </div>
    </main>
  );
}
