import type { ArtifactTrigger } from "../content/artifact-schema";
import type { PendingRewardOffer, RunBuildState } from "../model/types";

function cloneRunBuildState(build: RunBuildState): RunBuildState {
  return { stacks: { ...build.stacks }, triggers: [...build.triggers] };
}

function clonePendingRewardOffer(offer: PendingRewardOffer): PendingRewardOffer {
  return { ...offer, cards: offer.cards.map((card) => ({ ...card })) };
}

/**
 * Owns the run's accumulated artifact build — per-artifact stack counts and
 * acquired triggers — plus the single reward offer awaiting selection. Offer
 * generation and stack-cap validation happen upstream; this records outcomes
 * and enforces only that one offer is pending at a time.
 *
 * Named `RunBuild` to avoid colliding with the `RunBuildState` value it holds.
 */
export class RunBuild {
  private build: RunBuildState = { stacks: {}, triggers: [] };
  private pendingOffer: PendingRewardOffer | undefined;

  get state(): RunBuildState {
    return cloneRunBuildState(this.build);
  }

  get pendingRewardOffer(): PendingRewardOffer | undefined {
    return this.pendingOffer ? clonePendingRewardOffer(this.pendingOffer) : undefined;
  }

  /** Installs a reward offer, pausing command acceptance until it is selected. */
  installPendingRewardOffer(offer: PendingRewardOffer): PendingRewardOffer {
    if (this.pendingOffer) {
      throw new Error("A reward offer is already pending.");
    }
    this.pendingOffer = clonePendingRewardOffer(offer);
    return this.pendingRewardOffer!;
  }

  clearPendingRewardOffer(): void {
    this.pendingOffer = undefined;
  }

  /**
   * Records the selected artifact's resulting stack count in the run build and, for a Major
   * trigger artifact, adds its acquired trigger (deduplicated; enforced by the trigger's own
   * one-stack cap upstream, not re-validated here).
   */
  applyRewardSelection(
    artifactId: string,
    resultingStackCount: number,
    trigger?: ArtifactTrigger,
  ): RunBuildState {
    const triggers =
      trigger && !this.build.triggers.includes(trigger)
        ? [...this.build.triggers, trigger]
        : this.build.triggers;
    this.build = {
      stacks: { ...this.build.stacks, [artifactId]: resultingStackCount },
      triggers,
    };
    return this.state;
  }
}
