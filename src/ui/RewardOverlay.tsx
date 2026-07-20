import type { PendingRewardOffer } from "../core/model/types";
import { artifactCatalog } from "../content/artifact-catalog";

export interface RewardOverlayProps {
  readonly offer: PendingRewardOffer;
  readonly busy: boolean;
  onSelect(artifactId: string): void;
}

function describeCard(artifactId: string): { readonly name: string; readonly description: string } {
  const artifact = artifactCatalog.artifacts.find((candidate) => candidate.id === artifactId);
  if (!artifact) {
    return { name: artifactId, description: "" };
  }
  return {
    name: artifact.name,
    description: artifact.descriptionTemplate.replace("%d", String(artifact.magnitude)),
  };
}

/**
 * A snapshot-owned pause between waves. It reads the offer and dispatches the selected artifact
 * ID; it never computes eligibility, randomness, damage, or wave advancement itself.
 */
export function RewardOverlay({ offer, busy, onSelect }: RewardOverlayProps) {
  return (
    <div className="reward-overlay" data-testid="reward-overlay">
      <div
        className="reward-overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-overlay-title"
      >
        <h2 id="reward-overlay-title">Choose a reward</h2>
        <div className="reward-card-list">
          {offer.cards.map((card) => {
            const { name, description } = describeCard(card.artifactId);
            return (
              <button
                key={card.artifactId}
                type="button"
                className="reward-card"
                data-testid={`reward-card-${card.artifactId}`}
                disabled={busy}
                onClick={() => onSelect(card.artifactId)}
              >
                <strong>{name}</strong>
                <span>{description}</span>
                <small>Stack {card.resultingStackCount}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
