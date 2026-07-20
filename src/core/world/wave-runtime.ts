import type { Cell, PendingSpawnBatch, WaveRuntimeState } from "../model/types";
import type { AdmittedBatch, QueueMember, SlotState } from "../waves/wave-scheduler";

function cloneCell(cell: Cell): Cell {
  return { x: cell.x, y: cell.y };
}

function cloneQueueMember(member: QueueMember): QueueMember {
  return { ...member };
}

function cloneSlotState(slot: SlotState): SlotState {
  return { ...slot, remainingQueue: slot.remainingQueue.map(cloneQueueMember) };
}

function clonePendingBatch(batch: PendingSpawnBatch): PendingSpawnBatch {
  return {
    ...batch,
    members: batch.members.map(cloneQueueMember),
    cells: batch.cells.map(cloneCell),
  };
}

function cloneWaveRuntimeState(state: WaveRuntimeState): WaveRuntimeState {
  return {
    ...state,
    slots: state.slots.map(cloneSlotState),
    ...(state.pendingBatch ? { pendingBatch: clonePendingBatch(state.pendingBatch) } : {}),
  };
}

/**
 * Owns the encounter's wave progression: the current wave number, its latched
 * per-slot queues, and the single in-flight spawn batch with its warning
 * countdown. Placement legality for a batch's cells is decided by the caller
 * against the grid before `installPendingSpawnBatch`; this holds no spatial rules.
 */
export class WaveRuntime {
  private current: WaveRuntimeState | undefined;

  get state(): WaveRuntimeState | undefined {
    return this.current ? cloneWaveRuntimeState(this.current) : undefined;
  }

  /** Sets the current wave number and its latched per-slot state, preserving any pending batch. */
  setWave(waveNumber: number, slots: readonly SlotState[]): void {
    this.current = {
      waveNumber,
      slots: slots.map(cloneSlotState),
      ...(this.current?.pendingBatch
        ? { pendingBatch: clonePendingBatch(this.current.pendingBatch) }
        : {}),
    };
  }

  /** Installs an admitted batch's placed target cells with a fresh countdown from its warning ticks. */
  installPendingSpawnBatch(batch: AdmittedBatch, cells: readonly Cell[]): PendingSpawnBatch {
    if (!this.current) {
      throw new Error("Cannot install a pending spawn batch without an active wave.");
    }
    if (this.current.pendingBatch) {
      throw new Error("A pending spawn batch is already installed.");
    }
    const pendingBatch: PendingSpawnBatch = {
      ...batch,
      members: batch.members.map(cloneQueueMember),
      cells: cells.map(cloneCell),
      remainingTicks: batch.warningTicks,
    };
    this.current = { ...this.current, pendingBatch };
    return clonePendingBatch(pendingBatch);
  }

  /** Decrements the pending batch's countdown by one, floored at zero. No-op if none is installed. */
  decrementPendingSpawnBatchWarning(): PendingSpawnBatch | undefined {
    const pendingBatch = this.current?.pendingBatch;
    if (!pendingBatch) {
      return undefined;
    }
    const next: PendingSpawnBatch = {
      ...pendingBatch,
      remainingTicks: Math.max(0, pendingBatch.remainingTicks - 1),
    };
    this.current = { ...this.current!, pendingBatch: next };
    return clonePendingBatch(next);
  }

  /** Clears the pending batch once it has resolved (spawned or requeued). No-op if none is installed. */
  clearPendingSpawnBatch(): void {
    if (!this.current?.pendingBatch) {
      return;
    }
    this.current = { ...this.current, pendingBatch: undefined };
  }
}
