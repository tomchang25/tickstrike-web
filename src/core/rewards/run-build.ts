import type { MobilityKind } from "../content/actor-schema";
import type { ArtifactDefinition, ArtifactTrigger } from "../content/artifact-schema";
import type { PendingRewardOffer, RewardOfferCard, RunBuildState } from "../model/types";

export function createEmptyRunBuild(): RunBuildState {
  return { stacks: {}, triggers: [] };
}

export function getArtifactStackCount(build: RunBuildState, artifactId: string): number {
  return build.stacks[artifactId] ?? 0;
}

export function withArtifactStackCount(
  build: RunBuildState,
  artifactId: string,
  count: number,
): RunBuildState {
  return { ...build, stacks: { ...build.stacks, [artifactId]: count } };
}

export function hasAcquiredTrigger(build: RunBuildState, trigger: ArtifactTrigger): boolean {
  return build.triggers.includes(trigger);
}

export function withAcquiredTrigger(build: RunBuildState, trigger: ArtifactTrigger): RunBuildState {
  return hasAcquiredTrigger(build, trigger)
    ? build
    : { ...build, triggers: [...build.triggers, trigger] };
}

/** The two Dash triggers this child supports; Chain Dash awaits its replacement route design. */
const SUPPORTED_TRIGGERS: readonly ArtifactTrigger[] = ["guard-shredder", "execution"];

export type ClassifiedArtifactEffect =
  | { readonly kind: "normal-attack-damage"; readonly amount: number }
  | { readonly kind: "mobility-attack-damage"; readonly amount: number }
  | { readonly kind: "mobility-cooldown"; readonly amount: number }
  | { readonly kind: "mobility-range"; readonly amount: number }
  | { readonly kind: "max-health"; readonly amount: number }
  | { readonly kind: "trigger"; readonly trigger: ArtifactTrigger }
  | { readonly kind: "unsupported" };

/**
 * Maps an artifact's single authored effect onto the channel or trigger this build path
 * supports. `speed_up`'s `"speed"` channel and Chain Dash classify as unsupported until their
 * dependent systems land — callers must never offer or apply an unsupported classification.
 */
export function classifyArtifactEffect(artifact: ArtifactDefinition): ClassifiedArtifactEffect {
  const effect = artifact.effects[0];
  if (!effect) {
    return { kind: "unsupported" };
  }
  if (effect.kind === "trigger") {
    return SUPPORTED_TRIGGERS.includes(effect.trigger)
      ? { kind: "trigger", trigger: effect.trigger }
      : { kind: "unsupported" };
  }
  switch (effect.channel) {
    case "normal-attack-damage":
    case "mobility-attack-damage":
    case "mobility-cooldown":
    case "mobility-range":
    case "max-health":
      return { kind: effect.channel, amount: effect.amount };
    default:
      return { kind: "unsupported" };
  }
}

export function isArtifactSupported(artifact: ArtifactDefinition): boolean {
  return classifyArtifactEffect(artifact).kind !== "unsupported";
}

export function isArtifactMobilityCompatible(
  artifact: ArtifactDefinition,
  playerMobilityKind: MobilityKind | null,
): boolean {
  return artifact.requiredMobility === null || artifact.requiredMobility === playerMobilityKind;
}

export function isArtifactEligible(
  artifact: ArtifactDefinition,
  currentStacks: number,
  waveNumber: number,
  playerMobilityKind: MobilityKind | null,
): boolean {
  return (
    isArtifactMobilityCompatible(artifact, playerMobilityKind) &&
    waveNumber >= artifact.minWave &&
    currentStacks < artifact.maxStacks
  );
}

export interface GenerateSingleCardOfferInput {
  /** Content-backed candidates eligible for this offer, e.g. just `attack_up` in the first slice. */
  readonly artifacts: readonly ArtifactDefinition[];
  readonly build: RunBuildState;
  readonly waveNumber: number;
  /** The active character's Mobility kind, or `null` when the player has none. */
  readonly playerMobilityKind: MobilityKind | null;
  /** A draw from the caller's `"rewards"` random stream, never `"waves"`. */
  readonly draw: () => number;
}

/**
 * Filters to supported, Mobility-compatible candidates eligible by minimum wave and stack cap,
 * then draws one. Returns `undefined` when nothing is eligible so the caller can advance the next
 * wave directly instead of installing an inert offer.
 */
export function generateSingleCardOffer(
  input: GenerateSingleCardOfferInput,
): PendingRewardOffer | undefined {
  const eligible = input.artifacts.filter(
    (artifact) =>
      isArtifactSupported(artifact) &&
      isArtifactEligible(
        artifact,
        getArtifactStackCount(input.build, artifact.id),
        input.waveNumber,
        input.playerMobilityKind,
      ),
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
