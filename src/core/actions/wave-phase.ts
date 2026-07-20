import type { ArtifactDefinition, ArtifactTrigger } from "../content/artifact-schema";
import type {
  SpawnGroupDefinition,
  WaveDefinition,
  WaveProgressionProfile,
} from "../content/wave-schema";
import type { CombatEvent } from "../events/combat-events";
import { sameCell, type Cell, type EntityId } from "../model/types";
import { classifyArtifactEffect, generateSingleCardOffer } from "../rewards/reward-offers";
import type { WaveWorldView } from "../waves/wave-inputs";
import { planGroupCells } from "../waves/enemy-spawn-planner";
import {
  createInitialSlotStates,
  evaluateSlotEligibility,
  selectAtomicBatch,
  type AdmittedBatch,
  type QueueMember,
  type SlotState,
} from "../waves/wave-scheduler";
import type { SpawnEntityInput, World } from "../world/world";

export interface WaveEnemySpawnRequest {
  readonly id: EntityId;
  readonly enemyId: string;
  readonly level: number;
  readonly waveNumber: number;
  readonly cell: Cell;
  readonly profile: WaveProgressionProfile;
}

/**
 * Authored content and content-backed projection the wave phase needs but must not import
 * directly (`src/core` never imports `src/content` catalog values). A scenario with no wave
 * runtime installed supplies no context and the phase is a no-op; a scenario that installs a
 * wave runtime must supply one.
 */
export interface WavePhaseContext {
  readonly groups: readonly SpawnGroupDefinition[];
  readonly progressionProfile: WaveProgressionProfile;
  /** The wave definition for a 1-based wave number, or undefined when the run is complete. */
  waveFor(waveNumber: number): WaveDefinition | undefined;
  buildEnemySpawnInput(request: WaveEnemySpawnRequest): SpawnEntityInput;
  /** Reward candidates offerable at a cleared wave. Omitted or empty means rewards never pause. */
  readonly offerableArtifacts?: readonly ArtifactDefinition[];
}

export interface WavePhaseResult {
  readonly events: readonly CombatEvent[];
  readonly victoryReady: boolean;
}

export interface RewardSelectionResolution {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly events: readonly CombatEvent[];
}

const WAVE_ENTITY_ID_PATTERN = /^wave-(\d+)-slot-(\d+)-t\d+-\d+$/;

function spawnOwnerId(waveNumber: number, slotIndex: number): string {
  return `spawn:w${waveNumber}:s${slotIndex}`;
}

function parseWaveEntityId(id: string): { waveNumber: number; slotIndex: number } | undefined {
  const match = WAVE_ENTITY_ID_PATTERN.exec(id);
  if (!match) {
    return undefined;
  }
  return { waveNumber: Number(match[1]), slotIndex: Number(match[2]) };
}

/** Refreshes every slot's living-enemy attribution from currently living, id-tagged entities. */
function refreshLivingCounts(
  world: World,
  waveNumber: number,
  slots: readonly SlotState[],
): readonly SlotState[] {
  const counts = new Array<number>(slots.length).fill(0);
  for (const entity of world.listActiveEntities()) {
    if (entity.kind !== "enemy") {
      continue;
    }
    const parsed = parseWaveEntityId(entity.id);
    if (!parsed || parsed.waveNumber !== waveNumber || parsed.slotIndex >= slots.length) {
      continue;
    }
    counts[parsed.slotIndex] = (counts[parsed.slotIndex] ?? 0) + 1;
  }
  return slots.map((slot, index) => ({ ...slot, livingCount: counts[index] ?? 0 }));
}

/** Recomputed fresh at each call site; never cached, so a same-tick spawn is always reflected. */
function hasLivingWaveEnemy(world: World, waveNumber: number): boolean {
  return world.listActiveEntities().some((entity) => {
    if (entity.kind !== "enemy") {
      return false;
    }
    const parsed = parseWaveEntityId(entity.id);
    return parsed !== undefined && parsed.waveNumber === waveNumber;
  });
}

function buildWaveWorldView(world: World, playerCell: Cell): WaveWorldView {
  return {
    width: world.arena.width,
    height: world.arena.height,
    playerCell,
    livingEnemyCount: world.listActiveEntities().filter((entity) => entity.kind === "enemy").length,
    isArenaLegal: (cell) => world.isLegalCell(cell),
    isOccupied: (cell) => world.isOccupied(cell),
    isReserved: (cell) => world.isReserved(cell),
  };
}

/** A repair view additionally treats already-claimed replacement cells as occupied. */
function buildRepairView(
  world: World,
  playerCell: Cell,
  extraOccupied: readonly Cell[],
): WaveWorldView {
  const base = buildWaveWorldView(world, playerCell);
  return {
    ...base,
    isOccupied: (cell) =>
      base.isOccupied(cell) || extraOccupied.some((claimed) => sameCell(claimed, cell)),
  };
}

function isSpawnCellStillLegal(
  world: World,
  playerCell: Cell,
  cell: Cell,
  ownerId: string,
): boolean {
  if (!world.isLegalCell(cell) || world.isOccupied(cell) || sameCell(cell, playerCell)) {
    return false;
  }
  const reservation = world.reservationAt(cell);
  return !reservation || reservation.ownerId === ownerId;
}

interface RepairedAssignment {
  readonly member: QueueMember;
  readonly cell: Cell;
}

interface RepairResult {
  readonly assignments: readonly RepairedAssignment[];
  readonly requeued: readonly QueueMember[];
}

/**
 * Revalidates every reserved cell in a batch about to expire. A cell still legal keeps its
 * member; an illegal one asks the planner for one strategy-consistent replacement, excluding
 * cells this pass has already claimed. A member with no replacement requeues rather than
 * dropping, preserving all-or-nothing admission.
 */
function repairBatchCells(
  world: World,
  playerCell: Cell,
  ownerId: string,
  members: readonly QueueMember[],
  cells: readonly Cell[],
  strategy: AdmittedBatch["placementStrategy"],
  random: () => number,
): RepairResult {
  const assignments: RepairedAssignment[] = [];
  const requeued: QueueMember[] = [];
  const claimedReplacements: Cell[] = [];

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!;
    const cell = cells[index]!;
    if (isSpawnCellStillLegal(world, playerCell, cell, ownerId)) {
      assignments.push({ member, cell });
      continue;
    }
    const view = buildRepairView(world, playerCell, claimedReplacements);
    const result = planGroupCells(strategy, 1, view, random);
    if ("failed" in result) {
      requeued.push(member);
      continue;
    }
    const replacement = result.cells[0]!;
    assignments.push({ member, cell: replacement });
    claimedReplacements.push(replacement);
  }

  return { assignments, requeued };
}

interface SpawnCounter {
  value: number;
}

function spawnAssignments(
  world: World,
  context: WavePhaseContext,
  waveNumber: number,
  slotIndex: number,
  tick: number,
  counter: SpawnCounter,
  assignments: readonly RepairedAssignment[],
): readonly { entityId: EntityId; cell: Cell; level: number }[] {
  return assignments.map(({ member, cell }) => {
    const entityId = `wave-${waveNumber}-slot-${slotIndex}-t${tick}-${counter.value++}`;
    const input = context.buildEnemySpawnInput({
      id: entityId,
      enemyId: member.enemyId,
      level: member.level,
      waveNumber,
      cell,
      profile: context.progressionProfile,
    });
    world.spawn(input);
    return { entityId, cell, level: member.level };
  });
}

function withClearedQueue(
  slots: readonly SlotState[],
  slotIndex: number,
  hasEverSpawned: boolean,
): readonly SlotState[] {
  return slots.map((slot, index) =>
    index === slotIndex
      ? { ...slot, remainingQueue: [], hasEverSpawned: slot.hasEverSpawned || hasEverSpawned }
      : slot,
  );
}

function withRequeuedMembers(
  slots: readonly SlotState[],
  slotIndex: number,
  requeued: readonly QueueMember[],
  hasEverSpawned: boolean,
): readonly SlotState[] {
  return slots.map((slot, index) =>
    index === slotIndex
      ? {
          ...slot,
          remainingQueue: [...requeued, ...slot.remainingQueue],
          hasEverSpawned: slot.hasEverSpawned || hasEverSpawned,
        }
      : slot,
  );
}

/** Resolves an expired pending batch: repair, release, spawn survivors, requeue the rest. */
function resolveExpiredBatch(
  world: World,
  context: WavePhaseContext,
  playerCell: Cell,
  waveNumber: number,
  batch: AdmittedBatch & { readonly cells: readonly Cell[] },
  tick: number,
  random: () => number,
  counter: SpawnCounter,
  events: CombatEvent[],
): void {
  const ownerId = spawnOwnerId(waveNumber, batch.slotIndex);
  const { assignments, requeued } = repairBatchCells(
    world,
    playerCell,
    ownerId,
    batch.members,
    batch.cells,
    batch.placementStrategy,
    random,
  );

  world.releaseReservation(ownerId);
  world.clearTelegraph(ownerId);

  const spawns = spawnAssignments(
    world,
    context,
    waveNumber,
    batch.slotIndex,
    tick,
    counter,
    assignments,
  );
  world.clearPendingSpawnBatch();

  const runtime = world.waveRuntime!;
  const slots =
    requeued.length > 0
      ? withRequeuedMembers(runtime.slots, batch.slotIndex, requeued, spawns.length > 0)
      : withClearedQueue(runtime.slots, batch.slotIndex, spawns.length > 0);
  world.setWave(waveNumber, slots);

  if (spawns.length > 0) {
    events.push({ type: "wave_group_spawned", waveNumber, slotIndex: batch.slotIndex, spawns });
  }
  if (requeued.length > 0) {
    events.push({
      type: "wave_group_requeued",
      waveNumber,
      slotIndex: batch.slotIndex,
      memberCount: requeued.length,
    });
  }
}

/**
 * Runs the wave phase once per accepted player action, after the enemy phase. A no-op when no
 * wave runtime is installed. Throws if a wave runtime is installed with no context — a silently
 * frozen schedule is worse than a loud construction error.
 */
export function resolveWavePhase(world: World, context?: WavePhaseContext): WavePhaseResult {
  const runtime = world.waveRuntime;
  if (!runtime) {
    return { events: [], victoryReady: false };
  }
  if (!context) {
    throw new Error("Wave runtime installed but no WavePhaseContext supplied.");
  }

  const player = world.listEntities().find((entity) => entity.kind === "player");
  if (!player || player.phase !== "alive") {
    return { events: [], victoryReady: false };
  }
  const playerCell = world.playerCell!;

  const wave = context.waveFor(runtime.waveNumber);
  if (!wave) {
    return { events: [], victoryReady: true };
  }

  const events: CombatEvent[] = [];
  const tick = world.tick;
  const random = () => world.random.get("waves").nextUnit();
  const counter: SpawnCounter = { value: 0 };

  // Step 1: refresh living-enemy attribution before any eligibility check reads it.
  world.setWave(runtime.waveNumber, refreshLivingCounts(world, runtime.waveNumber, runtime.slots));

  // Step 2: resolve the pending warning, if any.
  const pendingBatch = world.waveRuntime!.pendingBatch;
  if (pendingBatch) {
    const decremented = world.decrementPendingSpawnBatchWarning()!;
    if (decremented.remainingTicks > 0) {
      world.setTelegraph({
        sourceId: spawnOwnerId(runtime.waveNumber, decremented.slotIndex),
        phase: "spawning",
        cells: decremented.cells,
        remainingTicks: decremented.remainingTicks,
      });
      return { events, victoryReady: false };
    }
    resolveExpiredBatch(
      world,
      context,
      playerCell,
      runtime.waveNumber,
      decremented,
      tick,
      random,
      counter,
      events,
    );
  }

  // Step 3: admit the next atomic batch, if headroom and placement allow it.
  let admittedSomething = false;
  const afterExpiry = world.waveRuntime!;
  const eligibleSlots = evaluateSlotEligibility(wave, afterExpiry.slots);
  world.setWave(runtime.waveNumber, eligibleSlots);
  const livingEnemyCount = world
    .listActiveEntities()
    .filter((entity) => entity.kind === "enemy").length;
  const admittedBatch = selectAtomicBatch(wave, context.groups, eligibleSlots, livingEnemyCount);

  if (admittedBatch) {
    const view = buildWaveWorldView(world, playerCell);
    const placement = planGroupCells(
      admittedBatch.placementStrategy,
      admittedBatch.members.length,
      view,
      random,
    );
    if ("failed" in placement) {
      events.push({
        type: "wave_group_deferred",
        waveNumber: runtime.waveNumber,
        slotIndex: admittedBatch.slotIndex,
        reason: "placement-failed",
      });
    } else {
      admittedSomething = true;
      if (admittedBatch.warningTicks <= 0) {
        const assignments = admittedBatch.members.map((member, index) => ({
          member,
          cell: placement.cells[index]!,
        }));
        const spawns = spawnAssignments(
          world,
          context,
          runtime.waveNumber,
          admittedBatch.slotIndex,
          tick,
          counter,
          assignments,
        );
        world.setWave(
          runtime.waveNumber,
          withClearedQueue(eligibleSlots, admittedBatch.slotIndex, spawns.length > 0),
        );
        if (spawns.length > 0) {
          events.push({
            type: "wave_group_spawned",
            waveNumber: runtime.waveNumber,
            slotIndex: admittedBatch.slotIndex,
            spawns,
          });
        }
      } else {
        const ownerId = spawnOwnerId(runtime.waveNumber, admittedBatch.slotIndex);
        const decision = world.requestReservation({
          ownerId,
          purpose: "spawn",
          cells: placement.cells,
        });
        if (!decision.granted || decision.lostOwners.length > 0) {
          throw new Error(
            `Spawn reservation for ${ownerId} must be granted with no arbitration losses.`,
          );
        }
        world.setTelegraph({
          sourceId: ownerId,
          phase: "spawning",
          cells: placement.cells,
          remainingTicks: admittedBatch.warningTicks,
        });
        world.installPendingSpawnBatch(admittedBatch, placement.cells);
        world.setWave(
          runtime.waveNumber,
          withClearedQueue(eligibleSlots, admittedBatch.slotIndex, false),
        );
        events.push({
          type: "wave_group_warned",
          waveNumber: runtime.waveNumber,
          slotIndex: admittedBatch.slotIndex,
          sourceId: ownerId,
          cells: placement.cells,
          warningTicks: admittedBatch.warningTicks,
        });
      }
    }
  } else {
    const eligibleIndex = eligibleSlots.findIndex(
      (slot) => slot.eligible && slot.remainingQueue.length > 0,
    );
    if (eligibleIndex !== -1) {
      events.push({
        type: "wave_group_deferred",
        waveNumber: runtime.waveNumber,
        slotIndex: eligibleIndex,
        reason: "population-headroom",
      });
    }
  }

  // Step 4: advance the wave once every queue is drained, nothing is pending, and no living
  // enemy of this wave remains. Recomputed live, never from the (possibly stale) refreshed slots.
  if (!admittedSomething) {
    const current = world.waveRuntime!;
    const noQueues = current.slots.every((slot) => slot.remainingQueue.length === 0);
    const noPending = !current.pendingBatch;
    if (noQueues && noPending && !hasLivingWaveEnemy(world, runtime.waveNumber)) {
      events.push({ type: "wave_cleared", waveNumber: runtime.waveNumber });
      const nextWaveNumber = runtime.waveNumber + 1;
      const nextWave = context.waveFor(nextWaveNumber);
      if (!nextWave) {
        return { events, victoryReady: true };
      }

      const offer = generateSingleCardOffer({
        artifacts: context.offerableArtifacts ?? [],
        build: world.runBuild,
        waveNumber: runtime.waveNumber,
        playerMobilityKind: player.mobility?.kind ?? null,
        draw: () => world.random.get("rewards").nextUnit(),
      });
      if (offer) {
        world.installPendingRewardOffer(offer);
        events.push({ type: "reward_offered", waveNumber: offer.waveNumber, cards: offer.cards });
        return { events, victoryReady: false };
      }

      const nextSlots = createInitialSlotStates(nextWave, context.groups, nextWaveNumber, random);
      world.setWave(nextWaveNumber, nextSlots);
      events.push({ type: "wave_started", waveNumber: nextWaveNumber });
    }
  }

  return { events, victoryReady: false };
}

/**
 * Resolves a pending reward offer as its own serialized boundary: it mutates the run build and
 * the player's normal-attack damage, then initializes the next wave's slot state without spawning
 * or warning anything — that happens through the normal wave phase on a later accepted command.
 * Never runs the accepted-player-action path, the enemy phase, or presentation.
 */
export function resolveRewardSelection(
  world: World,
  artifactId: string,
  context: WavePhaseContext,
): RewardSelectionResolution {
  const offer = world.pendingRewardOffer;
  if (!offer) {
    return { accepted: false, reason: "No reward selection is pending.", events: [] };
  }
  const card = offer.cards.find((candidate) => candidate.artifactId === artifactId);
  const artifact = (context.offerableArtifacts ?? []).find(
    (candidate) => candidate.id === artifactId,
  );
  if (!card || !artifact) {
    return { accepted: false, reason: "Unknown or stale reward selection.", events: [] };
  }
  const classified = classifyArtifactEffect(artifact);
  if (classified.kind === "unsupported") {
    // Defends the same guarantee as generateSingleCardOffer's filter: an unsupported effect
    // (deferred Speed, Chain Dash) is never granted, even if it were somehow offered.
    return { accepted: false, reason: "Unsupported artifact effect.", events: [] };
  }

  world.clearPendingRewardOffer();

  const player = world.listEntities().find((entity) => entity.kind === "player");
  let trigger: ArtifactTrigger | undefined;
  if (player) {
    switch (classified.kind) {
      case "normal-attack-damage":
        world.setNormalAttackDamage(
          player.id,
          (player.normalAttackDamage ?? 0) + classified.amount,
        );
        break;
      case "mobility-attack-damage":
        if (player.mobility) {
          world.setMobilityDamage(player.id, player.mobility.damage + classified.amount);
        }
        break;
      case "mobility-cooldown":
        if (player.mobility) {
          world.setMobilityCooldownConfig(
            player.id,
            Math.max(0, player.mobility.cooldown - classified.amount),
          );
        }
        break;
      case "mobility-range":
        if (player.mobility) {
          world.setMobilityRange(player.id, player.mobility.range + classified.amount);
        }
        break;
      case "max-health":
        world.raiseMaxHealth(player.id, classified.amount);
        break;
      case "trigger":
        trigger = classified.trigger;
        break;
    }
  }

  // Apply the selected card's authored effect exactly once: the card already carries its
  // resulting stack count, so this records that stack plus any acquired trigger in one write.
  world.applyRewardSelection(artifactId, card.resultingStackCount, trigger);

  const events: CombatEvent[] = [
    { type: "reward_selected", artifactId, stackCount: card.resultingStackCount },
  ];

  const nextWaveNumber = offer.waveNumber + 1;
  const nextWave = context.waveFor(nextWaveNumber);
  if (nextWave) {
    const random = () => world.random.get("waves").nextUnit();
    const nextSlots = createInitialSlotStates(nextWave, context.groups, nextWaveNumber, random);
    world.setWave(nextWaveNumber, nextSlots);
    events.push({ type: "wave_started", waveNumber: nextWaveNumber });
  }

  world.recordEvents(events);
  return { accepted: true, events };
}
