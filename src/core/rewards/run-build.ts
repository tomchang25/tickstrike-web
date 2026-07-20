import type { ArtifactDefinition } from "../content/artifact-schema";
import type { PendingRewardOffer, RewardOfferCard, RunBuildState } from "../model/types";

export function createEmptyRunBuild(): RunBuildState {
  return { stacks: {} };
}

export function getArtifactStackCount(build: RunBuildState, artifactId: string): number {
  return build.stacks[artifactId] ?? 0;
}

export function withArtifactStackCount(
  build: RunBuildState,
  artifactId: string,
  count: number,
): RunBuildState {
  return { stacks: { ...build.stacks, [artifactId]: count } };
}

export function isArtifactEligible(
  artifact: ArtifactDefinition,
  currentStacks: number,
  waveNumber: number,
): boolean {
  return waveNumber >= artifact.minWave && currentStacks < artifact.maxStacks;
}

/** The single shipped channel effect's amount, or undefined when the artifact targets another channel. */
export function channelEffectAmount(
  artifact: ArtifactDefinition,
  channel: string,
): number | undefined {
  const effect = artifact.effects[0];
  return effect && effect.kind === "channel" && effect.channel === channel
    ? effect.amount
    : undefined;
}

export interface GenerateSingleCardOfferInput {
  /** Content-backed candidates eligible for this offer, e.g. just `attack_up` in the first slice. */
  readonly artifacts: readonly ArtifactDefinition[];
  readonly build: RunBuildState;
  readonly waveNumber: number;
  /** A draw from the caller's `"rewards"` random stream, never `"waves"`. */
  readonly draw: () => number;
}

/**
 * Filters to eligible candidates by minimum wave and stack cap, then draws one. Returns
 * `undefined` when nothing is eligible so the caller can advance the next wave directly instead
 * of installing an inert offer.
 */
export function generateSingleCardOffer(
  input: GenerateSingleCardOfferInput,
): PendingRewardOffer | undefined {
  const eligible = input.artifacts.filter((artifact) =>
    isArtifactEligible(artifact, getArtifactStackCount(input.build, artifact.id), input.waveNumber),
  );
  if (eligible.length === 0) {
    return undefined;
  }
  const index = Math.min(eligible.length - 1, Math.floor(input.draw() * eligible.length));
  const artifact = eligible[index]!;
  const currentStacks = getArtifactStackCount(input.build, artifact.id);
  const card: RewardOfferCard = { artifactId: artifact.id, resultingStackCount: currentStacks + 1 };
  return { waveNumber: input.waveNumber, cards: [card] };
}
