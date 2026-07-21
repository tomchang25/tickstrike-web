import type { MobilityKind } from "../content/actor-schema";
import type { ArtifactDefinition, ArtifactTrigger } from "../content/artifact-schema";
import type { PendingRewardOffer, RewardOfferCard, RunBuildState } from "../model/types";

/**
 * Pure reward-offer policy: artifact effect classification, eligibility, and the
 * seeded draw that produces an offer. The run's mutable build state lives in
 * `core/world/run-build.ts`; nothing here mutates.
 */

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

export interface GenerateRewardOfferInput {
  /** Content-backed candidates the offer draws from; the generator applies its own eligibility. */
  readonly artifacts: readonly ArtifactDefinition[];
  readonly build: RunBuildState;
  /** The completed wave number. Multiples of three open the Major milestone offer. */
  readonly waveNumber: number;
  /** The active character's Mobility kind, or `null` when the player has none. */
  readonly playerMobilityKind: MobilityKind | null;
  /** A draw from the caller's `"rewards"` random stream, never `"waves"`. */
  readonly draw: () => number;
}

const MILESTONE_INTERVAL = 3;
const ORDINARY_CARD_COUNT = 3;
const MILESTONE_MAJOR_LIMIT = 2;
const MILESTONE_MINOR_STACK_GAIN = 2;

/** Milestones are every third completed wave; majors are offered only here. */
export function isMilestoneWave(waveNumber: number): boolean {
  return waveNumber > 0 && waveNumber % MILESTONE_INTERVAL === 0;
}

/** Non-empty exclusivity groups already represented by an acquired artifact in the build. */
function acquiredExclusivityGroups(
  artifacts: readonly ArtifactDefinition[],
  build: RunBuildState,
): ReadonlySet<string> {
  const groups = new Set<string>();
  for (const artifact of artifacts) {
    if (artifact.exclusivityGroup !== "" && getArtifactStackCount(build, artifact.id) > 0) {
      groups.add(artifact.exclusivityGroup);
    }
  }
  return groups;
}

/**
 * Eligible candidates of a category whose current stacks admit a full `stackGain` grant (a
 * one-from-cap artifact is excluded from a two-stack offer so no card partially grants), that are
 * supported, Mobility-compatible, past their minimum wave, and not blocked by an acquired
 * exclusive sibling.
 */
function eligibleCandidates(
  input: GenerateRewardOfferInput,
  category: ArtifactDefinition["category"],
  stackGain: number,
  acquiredGroups: ReadonlySet<string>,
): readonly ArtifactDefinition[] {
  return input.artifacts.filter((artifact) => {
    if (artifact.category !== category || !isArtifactSupported(artifact)) {
      return false;
    }
    if (!isArtifactMobilityCompatible(artifact, input.playerMobilityKind)) {
      return false;
    }
    if (input.waveNumber < artifact.minWave) {
      return false;
    }
    const currentStacks = getArtifactStackCount(input.build, artifact.id);
    if (currentStacks + stackGain > artifact.maxStacks) {
      return false;
    }
    return !(
      artifact.exclusivityGroup !== "" &&
      currentStacks === 0 &&
      acquiredGroups.has(artifact.exclusivityGroup)
    );
  });
}

/**
 * Selects up to `count` distinct artifacts without replacement, one draw per pick, never taking two
 * that share a non-empty exclusivity group. Deterministic in the caller's `draw` sequence.
 */
function drawDistinct(
  pool: readonly ArtifactDefinition[],
  count: number,
  draw: () => number,
): ArtifactDefinition[] {
  const remaining = [...pool];
  const chosen: ArtifactDefinition[] = [];
  while (chosen.length < count && remaining.length > 0) {
    const index = Math.min(remaining.length - 1, Math.floor(draw() * remaining.length));
    const pick = remaining[index]!;
    chosen.push(pick);
    const group = pick.exclusivityGroup;
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (i === index || (group !== "" && remaining[i]!.exclusivityGroup === group)) {
        remaining.splice(i, 1);
      }
    }
  }
  return chosen;
}

function toCard(
  build: RunBuildState,
  artifact: ArtifactDefinition,
  stackGain: number,
): RewardOfferCard {
  return {
    artifactId: artifact.id,
    resultingStackCount: getArtifactStackCount(build, artifact.id) + stackGain,
  };
}

/**
 * Builds a completed wave's reward offer. Ordinary waves draw up to three distinct eligible Minor
 * cards at one stack. Milestone waves (every third) fill slot one with a Minor at two stacks and
 * slots two and three with eligible Majors at one stack, falling back per slot to another Minor at
 * two stacks — majors are offered only here. Returns `undefined` when nothing is eligible so the
 * caller advances the next wave instead of installing an inert offer. No phantom or disabled cards
 * are produced; a smaller eligible pool yields fewer cards.
 */
export function generateRewardOffer(
  input: GenerateRewardOfferInput,
): PendingRewardOffer | undefined {
  const acquiredGroups = acquiredExclusivityGroups(input.artifacts, input.build);
  let cards: RewardOfferCard[];

  if (isMilestoneWave(input.waveNumber)) {
    const majors = drawDistinct(
      eligibleCandidates(input, "major", 1, acquiredGroups),
      MILESTONE_MAJOR_LIMIT,
      input.draw,
    );
    const majorGroups = new Set(
      majors.map((major) => major.exclusivityGroup).filter((group) => group !== ""),
    );
    const minorPool = eligibleCandidates(
      input,
      "minor",
      MILESTONE_MINOR_STACK_GAIN,
      acquiredGroups,
    ).filter((minor) => minor.exclusivityGroup === "" || !majorGroups.has(minor.exclusivityGroup));
    const minors = drawDistinct(minorPool, ORDINARY_CARD_COUNT - majors.length, input.draw);

    const majorCards = majors.map((artifact) => toCard(input.build, artifact, 1));
    const minorCards = minors.map((artifact) =>
      toCard(input.build, artifact, MILESTONE_MINOR_STACK_GAIN),
    );
    cards = [];
    let nextMinor = 0;
    if (minorCards[nextMinor]) {
      cards.push(minorCards[nextMinor++]!);
    }
    for (let slot = 0; slot < ORDINARY_CARD_COUNT - 1; slot += 1) {
      if (slot < majorCards.length) {
        cards.push(majorCards[slot]!);
      } else if (minorCards[nextMinor]) {
        cards.push(minorCards[nextMinor++]!);
      }
    }
  } else {
    const minors = drawDistinct(
      eligibleCandidates(input, "minor", 1, acquiredGroups),
      ORDINARY_CARD_COUNT,
      input.draw,
    );
    cards = minors.map((artifact) => toCard(input.build, artifact, 1));
  }

  return cards.length === 0 ? undefined : { waveNumber: input.waveNumber, cards };
}
