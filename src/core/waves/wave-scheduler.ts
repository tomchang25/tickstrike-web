import type {
  PlacementStrategy,
  SpawnGroupDefinition,
  WaveDefinition,
  WaveGroupSlot,
  WaveStartCondition,
} from "../content/wave-schema";
import type { RandomUnitSource } from "./wave-inputs";

export interface QueueMember {
  readonly enemyId: string;
  readonly level: number;
}

/** Latched per-slot runtime state. Once `eligible` is true it must never be reset to false. */
export interface SlotState {
  readonly remainingQueue: readonly QueueMember[];
  readonly eligible: boolean;
  readonly hasEverSpawned: boolean;
  readonly livingCount: number;
}

export interface AdmittedBatch {
  readonly slotIndex: number;
  readonly members: readonly QueueMember[];
  readonly warningTicks: number;
  readonly placementStrategy: PlacementStrategy;
}

function findGroup(groups: readonly SpawnGroupDefinition[], groupId: string): SpawnGroupDefinition {
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Unknown spawn group id: ${groupId}`);
  }
  return group;
}

function pickWeightedEnemyId(
  group: Extract<SpawnGroupDefinition, { compositionMode: "weighted" }>,
  random: RandomUnitSource,
): string {
  const totalWeight = group.entries.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = random() * totalWeight;
  let running = 0;
  for (const entry of group.entries) {
    running += entry.weight;
    if (roll <= running) {
      return entry.enemyId;
    }
  }
  return group.entries[group.entries.length - 1]!.enemyId;
}

/**
 * Expands one slot's referenced group composition into queue members. Fixed groups expand
 * literally by each entry's count and never touch `random`; weighted groups draw
 * `weightedTotalCount` members by weight, consuming one draw per member so the same source
 * sequence always reproduces the same composition.
 */
export function expandSlotQueue(
  group: SpawnGroupDefinition,
  slot: WaveGroupSlot,
  waveNumber: number,
  random: RandomUnitSource,
): readonly QueueMember[] {
  const level = waveNumber + slot.levelOffset;
  if (group.compositionMode === "fixed") {
    const members: QueueMember[] = [];
    for (const entry of group.entries) {
      for (let index = 0; index < entry.count; index += 1) {
        members.push({ enemyId: entry.enemyId, level });
      }
    }
    return members;
  }
  const members: QueueMember[] = [];
  for (let index = 0; index < group.weightedTotalCount; index += 1) {
    members.push({ enemyId: pickWeightedEnemyId(group, random), level });
  }
  return members;
}

/** Builds the active wave's initial per-slot state: expanded queues, all latches unset. */
export function createInitialSlotStates(
  wave: WaveDefinition,
  groups: readonly SpawnGroupDefinition[],
  waveNumber: number,
  random: RandomUnitSource,
): readonly SlotState[] {
  return wave.slots.map((slot) => ({
    remainingQueue: expandSlotQueue(findGroup(groups, slot.spawnGroupId), slot, waveNumber, random),
    eligible: false,
    hasEverSpawned: false,
    livingCount: 0,
  }));
}

/**
 * A predecessor's living count of zero only means "cleared" once it has actually spawned at
 * least one member; otherwise `previous-group-cleared`/`previous-group-survivors-at-most` would
 * trivially pass on a predecessor that simply hasn't had its turn at population headroom yet.
 */
function conditionMet(
  startCondition: WaveStartCondition,
  survivorThreshold: number,
  predecessor: SlotState,
): boolean {
  switch (startCondition) {
    case "previous-group-cleared":
      return predecessor.hasEverSpawned && predecessor.livingCount <= 0;
    case "previous-group-survivors-at-most":
      return predecessor.hasEverSpawned && predecessor.livingCount <= survivorThreshold;
    case "immediate-overlap":
      return true;
  }
}

/**
 * Latches eligibility in authored slot order: the first slot is always eligible; a later slot can
 * only become eligible once its immediate predecessor already is. Once true, a slot's eligibility
 * is never revoked. Processes slots in order in a single pass, so a predecessor that becomes
 * eligible earlier in this same call can immediately unlock its successor.
 */
export function evaluateSlotEligibility(
  wave: WaveDefinition,
  slotStates: readonly SlotState[],
): readonly SlotState[] {
  const next = [...slotStates];
  for (let index = 0; index < wave.slots.length; index += 1) {
    if (next[index]!.eligible) {
      continue;
    }
    if (index === 0) {
      next[index] = { ...next[index]!, eligible: true };
      continue;
    }
    if (!next[index - 1]!.eligible) {
      continue;
    }
    const slot = wave.slots[index]!;
    const eligible = conditionMet(slot.startCondition, slot.survivorThreshold, next[index - 1]!);
    next[index] = { ...next[index]!, eligible };
  }
  return next;
}

/**
 * Admits the earliest eligible slot's entire remaining queue as one atomic batch. Returns
 * `undefined` (spawning nothing) when no slot is schedulable, or when the earliest schedulable
 * slot's remaining queue exceeds current population headroom — a later slot never bypasses a
 * blocked earlier one.
 */
export function selectAtomicBatch(
  wave: WaveDefinition,
  groups: readonly SpawnGroupDefinition[],
  slotStates: readonly SlotState[],
  livingEnemyCount: number,
): AdmittedBatch | undefined {
  const slotIndex = slotStates.findIndex(
    (state) => state.eligible && state.remainingQueue.length > 0,
  );
  if (slotIndex === -1) {
    return undefined;
  }
  const remaining = slotStates[slotIndex]!.remainingQueue;
  const headroom = wave.populationCap - livingEnemyCount;
  if (remaining.length > headroom) {
    return undefined;
  }
  const slot = wave.slots[slotIndex]!;
  const group = findGroup(groups, slot.spawnGroupId);
  return {
    slotIndex,
    members: remaining,
    warningTicks: slot.warningTicks,
    placementStrategy: group.placementStrategy,
  };
}
