import type { MilestoneChoice, PendingMilestoneDecision } from "@core/model/types";

export interface MilestoneOverlayProps {
  readonly decision: PendingMilestoneDecision;
  readonly busy: boolean;
  onDecide(choice: MilestoneChoice): void;
}

/**
 * A snapshot-owned pause when the final authored wave clears. It renders the End Run / Continue
 * Endless choice and dispatches it; it never decides the outcome, generates a reward, or advances
 * the run itself — the runtime's milestone decision is the only exit.
 */
export function MilestoneOverlay({ decision, busy, onDecide }: MilestoneOverlayProps) {
  return (
    <div className="reward-overlay" data-testid="milestone-overlay">
      <div className="reward-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="milestone-overlay-title">
        <h2 id="milestone-overlay-title">Wave {decision.waveNumber} cleared</h2>
        <p className="milestone-prompt">The authored run is complete. End the run, or continue into endless waves?</p>
        <div className="milestone-actions">
          <button
            type="button"
            className="primary-command"
            data-testid="milestone-continue-endless"
            disabled={busy}
            onClick={() => onDecide("continue-endless")}
          >
            Continue Endless
          </button>
          <button type="button" data-testid="milestone-end-run" disabled={busy} onClick={() => onDecide("end-run")}>
            End Run
          </button>
        </div>
      </div>
    </div>
  );
}
