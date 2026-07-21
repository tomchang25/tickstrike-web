// The home shell imports its scenario module directly instead of the scenario registry:
// the registry's import.meta.glob would pull every harness scenario into the production bundle.
import { scenarios as runScenarios } from "@harness/scenarios/run.scenario";
import { MilestoneOverlay } from "@ui/milestone-overlay";
import { RewardOverlay } from "@ui/reward-overlay";
import { RunBuildHud } from "@ui/run-build-hud";
import { SemanticMirror } from "@ui/semantic-mirror";
import { useGameSession } from "./use-game-session";

function requireHomeScenario() {
  const scenario = runScenarios.find((candidate) => candidate.id === "run");
  if (!scenario) {
    throw new Error("Missing run scenario.");
  }
  return scenario;
}

const HOME_SCENARIO = requireHomeScenario();

export function GameApp() {
  const initialScenario = HOME_SCENARIO;
  const session = useGameSession({ initialScenario, debugApi: true, debugMode: false });
  const { snapshot, busy, runtimeRef } = session;
  const pendingReward = snapshot?.pendingReward;
  const pendingMilestone = snapshot?.pendingMilestone;

  return (
    <main className="game-shell">
      <div className="game-stage">
        <h1 className="game-title">Tickstrike</h1>
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
        {snapshot ? <RunBuildHud build={snapshot.runBuild} /> : null}
        <p className="hint">WASD / arrows move · IJKL attack · Hold Alt + hover for selected Mobility</p>
      </div>
    </main>
  );
}
