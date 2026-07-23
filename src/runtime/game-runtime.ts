import { resolveCommand, type ActionResolution } from "@core/actions/action-resolver";
import type { GameCommand } from "@core/actions/commands";
import { resolveSmashCancel, type SmashCancelResolution } from "@core/actions/player-actions";
import {
  resolveMilestoneDecision,
  resolveRewardSelection,
  type MilestoneDecisionResolution,
  type RewardSelectionResolution,
} from "@core/actions/wave-phase";
import type { Cell, MilestoneChoice, Seed, WorldSnapshot } from "@core/model/types";
import type { World } from "@core/world/world";
import type { TestScenario } from "@harness/types";
import type { ContentInspection } from "@harness/content-inspection";
import { AudioDirector } from "@presentation/audio/audio-director";
import { AudioMixer } from "@presentation/audio/audio-mixer";
import { MusicDirector } from "@presentation/audio/music-director";
import { PixiGameRenderer, type ScreenBounds } from "@presentation/pixi/pixi-game-renderer";
import { PresentationDirector } from "@presentation/timelines/presentation-director";
import { cloneCommandLog, type RunCommandLog, type RunCommandLogEntry } from "./command-log";

export type RuntimeListener = (snapshot: WorldSnapshot) => void;

export class GameRuntime {
  readonly renderer = new PixiGameRenderer();
  readonly presentation = new PresentationDirector(this.renderer);
  readonly audio = new AudioMixer();
  readonly audioDirector = new AudioDirector(this.audio);
  readonly musicDirector = new MusicDirector(this.audio);

  private world: World | undefined;
  private scenario: TestScenario | undefined;
  private readonly listeners = new Set<RuntimeListener>();
  private readonly queuedCommands: QueuedJob[] = [];
  private activeCommand: QueuedJob | undefined;
  private processingCommands = false;
  private currentGeneration = 0;
  private commandLog: MutableRunCommandLog = { scenarioId: "", seed: undefined, entries: [] };

  get generation(): number {
    return this.currentGeneration;
  }

  get isIdle(): boolean {
    return !this.processingCommands && this.queuedCommands.length === 0 && this.presentation.isIdle;
  }

  async mount(host: HTMLElement): Promise<void> {
    await this.renderer.mount(host);
  }

  /**
   * Unlocks the audio context on a user gesture, kicks the one-time cue load so buffers are ready
   * before combat, and starts the looping background track. Coordinates the runtime's audio owners
   * (mixer, cue director, and music director) from one seam.
   */
  unlockAudio(): void {
    this.audio.unlock();
    void this.audioDirector.load();
    void this.musicDirector.start();
  }

  destroy(): void {
    this.invalidateWork("Runtime destroyed.");
    this.listeners.clear();
    this.renderer.destroy();
    this.audio.dispose();
  }

  loadScenario(scenario: TestScenario): void {
    this.invalidateWork("Scenario replaced.");
    this.scenario = scenario;
    this.world = scenario.createWorld(scenario.seed);
    this.commandLog = { scenarioId: scenario.id, seed: scenario.seed, entries: [] };
    this.presentation.setGeneration(this.currentGeneration);
    this.renderer.sync(this.world.snapshot());
    this.emit();
  }

  reset(): void {
    if (!this.scenario) {
      throw new Error("No scenario loaded.");
    }
    this.loadScenario(this.scenario);
  }

  /** Refreshes dev-authored presentation profiles without changing deterministic world state. */
  refreshEntityPresentationProfiles(): boolean {
    if (!this.isIdle) {
      return false;
    }
    this.renderer.refreshEntityPresentationProfiles();
    return true;
  }

  /** Re-applies the dev-authored action presentation (player batto states) without touching world state. */
  refreshPlayerPresentation(): boolean {
    if (!this.isIdle) {
      return false;
    }
    this.renderer.refreshPlayerAnimation();
    return true;
  }

  execute(command: GameCommand): Promise<ActionResolution> {
    if (this.scenario?.commandsEnabled === false) {
      return Promise.resolve({
        accepted: false,
        consumedTime: false,
        reason: "Commands are disabled for this scenario.",
        events: [],
      });
    }

    if (!this.world) {
      return Promise.reject(new Error("No world loaded."));
    }
    return this.submit<ActionResolution>((resolve, reject, generation) => ({
      kind: "command",
      command,
      generation,
      resolve,
      reject,
    }));
  }

  /**
   * The single enqueue seam for every job kind. Pushes the built job, then collapses any in-flight
   * presentation to its settled end state so this input is not serialized behind the previous turn's
   * full VFX duration (see the `await presentationDone` in {@link drainCommands}). Fast-forward is a
   * no-op when the presentation is already idle, so the first input of a quiet turn is unaffected.
   */
  private submit<T>(
    makeJob: (resolve: (value: T) => void, reject: (reason: unknown) => void, generation: number) => QueuedJob,
  ): Promise<T> {
    const generation = this.currentGeneration;
    return new Promise<T>((resolve, reject) => {
      this.queuedCommands.push(makeJob(resolve, reject, generation));
      if (!this.presentation.isIdle) {
        this.presentation.finishActive();
      }
      void this.drainCommands();
    });
  }

  /**
   * Serializes a reward-card selection through the same queue as `execute` so it can never race a
   * queued command. Mutates core state and returns its semantic result with no enemy phase or
   * presentation timeline — only `emit()` publishes the updated snapshot.
   */
  selectReward(artifactId: string): Promise<RewardSelectionResolution> {
    if (!this.world) {
      return Promise.reject(new Error("No world loaded."));
    }
    if (!this.scenario?.waveContext) {
      return Promise.resolve({
        accepted: false,
        reason: "No reward context available for this scenario.",
        events: [],
      });
    }
    return this.submit<RewardSelectionResolution>((resolve, reject, generation) => ({
      kind: "reward",
      artifactId,
      generation,
      resolve,
      reject,
    }));
  }

  /**
   * Serializes a milestone End Run / Continue Endless decision through the same queue as `execute`
   * and `selectReward`. Mutates core through `resolveMilestoneDecision` with no enemy phase or
   * presentation timeline; only `emit()` publishes the updated snapshot.
   */
  selectMilestoneDecision(choice: MilestoneChoice): Promise<MilestoneDecisionResolution> {
    if (!this.world) {
      return Promise.reject(new Error("No world loaded."));
    }
    if (!this.scenario?.waveContext) {
      return Promise.resolve({
        accepted: false,
        reason: "No milestone context available for this scenario.",
        events: [],
      });
    }
    return this.submit<MilestoneDecisionResolution>((resolve, reject, generation) => ({
      kind: "milestone",
      choice,
      generation,
      resolve,
      reject,
    }));
  }

  /**
   * Serializes a windup cancel through the same queue as every other input. Clears an armed Smash
   * through `resolveSmashCancel` with no waveContext, enemy phase, or presentation timeline; only
   * `emit()` publishes the updated snapshot. Rejects at the resolver when nothing is armed.
   */
  cancelArmedSmash(): Promise<SmashCancelResolution> {
    if (!this.world) {
      return Promise.reject(new Error("No world loaded."));
    }
    return this.submit<SmashCancelResolution>((resolve, reject, generation) => ({
      kind: "cancel",
      generation,
      resolve,
      reject,
    }));
  }

  /** A mutation-safe copy of the current run's accepted-input log. */
  exportCommandLog(): RunCommandLog {
    return cloneCommandLog(this.commandLog);
  }

  /**
   * Rebuilds the run from `log.seed` and re-drives every recorded entry through the same public
   * entrances that recorded it, reproducing the run's final snapshot. Takes the already-resolved
   * scenario because `src/runtime` may not import the harness scenario registry; the debug API
   * resolves `log.scenarioId`. Throws if a replayed entry is rejected, signaling a stale log.
   */
  async replayCommandLog(scenario: TestScenario, log: RunCommandLog): Promise<WorldSnapshot> {
    this.loadScenario({ ...scenario, seed: log.seed });
    for (const entry of log.entries) {
      const resolution = await this.replayEntry(entry);
      if (!resolution.accepted) {
        throw new Error(`Replay entry (${entry.kind}) was rejected: ${resolution.reason ?? "unknown"}`);
      }
    }
    return this.snapshot();
  }

  private replayEntry(entry: RunCommandLogEntry): Promise<{ readonly accepted: boolean; readonly reason?: string }> {
    switch (entry.kind) {
      case "command":
        return this.execute(entry.command);
      case "reward":
        return this.selectReward(entry.artifactId);
      case "milestone":
        return this.selectMilestoneDecision(entry.choice);
      case "cancel":
        return this.cancelArmedSmash();
    }
  }

  snapshot(): WorldSnapshot {
    return this.requireWorld().snapshot();
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  getEntityBounds(id: string): ScreenBounds | undefined {
    return this.renderer.getEntityBounds(id);
  }

  isWalkable(cell: Cell): boolean {
    return this.requireWorld().isWalkable(cell);
  }

  getContentInspection(): ContentInspection | undefined {
    return this.scenario?.inspection;
  }

  private async drainCommands(): Promise<void> {
    if (this.processingCommands) {
      return;
    }

    this.processingCommands = true;

    try {
      while (this.queuedCommands.length > 0) {
        const job = this.queuedCommands.shift();

        if (!job) {
          continue;
        }

        if (job.generation !== this.currentGeneration) {
          job.reject(new Error("Command cancelled by scenario replacement."));
          continue;
        }

        this.activeCommand = job;

        try {
          if (job.kind === "command") {
            const resolution = resolveCommand(this.requireWorld(), job.command, this.scenario?.waveContext);

            if (resolution.accepted) {
              this.presentation.reserveMotionOwners(resolution.events, job.generation);
              // The resolver already removed these entities, so capture must precede the
              // projection that would otherwise reconcile their views away.
              this.presentation.captureTerminalViews(resolution.events, job.generation);
            }

            this.emit();

            let presentationDone: Promise<void> | undefined;

            if (resolution.accepted) {
              this.audioDirector.play(resolution.events);
              presentationDone = this.presentation.play(resolution.events, job.generation);
              void presentationDone.then(
                () => this.notifyPresentationSettled(job.generation),
                () => this.notifyPresentationSettled(job.generation),
              );
            }

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Command cancelled by scenario replacement."));
            } else {
              if (resolution.accepted) {
                this.commandLog.entries.push({ kind: "command", command: structuredClone(job.command) });
              }
              job.resolve(resolution);
            }

            if (presentationDone) {
              await presentationDone;
            }
          } else if (job.kind === "reward") {
            // Reward selection never touches the enemy phase or the presentation timeline.
            const waveContext = this.scenario?.waveContext;
            const resolution = waveContext
              ? resolveRewardSelection(this.requireWorld(), job.artifactId, waveContext)
              : { accepted: false, reason: "No reward context available.", events: [] };

            this.emit();

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Reward selection cancelled by scenario replacement."));
            } else {
              if (resolution.accepted) {
                this.audioDirector.play(resolution.events);
                this.commandLog.entries.push({ kind: "reward", artifactId: job.artifactId });
              }
              job.resolve(resolution);
            }
          } else if (job.kind === "milestone") {
            // Milestone decision never touches the enemy phase or the presentation timeline.
            const waveContext = this.scenario?.waveContext;
            const resolution = waveContext
              ? resolveMilestoneDecision(this.requireWorld(), job.choice, waveContext)
              : { accepted: false, reason: "No milestone context available.", events: [] };

            this.emit();

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Milestone decision cancelled by scenario replacement."));
            } else {
              if (resolution.accepted) {
                this.commandLog.entries.push({ kind: "milestone", choice: job.choice });
              }
              job.resolve(resolution);
            }
          } else {
            // Windup cancel needs no waveContext and never touches the enemy phase or presentation.
            const resolution = resolveSmashCancel(this.requireWorld());

            this.emit();

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Windup cancel cancelled by scenario replacement."));
            } else {
              if (resolution.accepted) {
                this.commandLog.entries.push({ kind: "cancel" });
              }
              job.resolve(resolution);
            }
          }
        } catch (error) {
          job.reject(error);
        } finally {
          if (this.activeCommand === job) {
            this.activeCommand = undefined;
          }
        }
      }
    } finally {
      this.processingCommands = false;

      if (this.queuedCommands.length > 0) {
        void this.drainCommands();
      }
    }
  }

  private invalidateWork(reason: string): void {
    this.currentGeneration += 1;
    this.presentation.cancel();
    this.audio.stopAll();
    if (this.activeCommand) {
      this.activeCommand.reject(new Error(reason));
      this.activeCommand = undefined;
    }
    for (const job of this.queuedCommands) {
      job.reject(new Error(reason));
    }
    this.queuedCommands.length = 0;
  }

  private requireWorld(): World {
    if (!this.world) {
      throw new Error("No world loaded.");
    }
    return this.world;
  }

  private emit(): void {
    if (!this.world) {
      return;
    }
    const snapshot = this.world.snapshot();
    this.renderer.updateSnapshot(snapshot);
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private notifyPresentationSettled(generation: number): void {
    if (generation !== this.currentGeneration || !this.world) {
      return;
    }
    const snapshot = this.world.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

interface QueuedCommandJob {
  readonly kind: "command";
  readonly command: GameCommand;
  readonly generation: number;
  readonly resolve: (resolution: ActionResolution) => void;
  readonly reject: (reason: unknown) => void;
}

interface QueuedRewardJob {
  readonly kind: "reward";
  readonly artifactId: string;
  readonly generation: number;
  readonly resolve: (resolution: RewardSelectionResolution) => void;
  readonly reject: (reason: unknown) => void;
}

interface QueuedMilestoneJob {
  readonly kind: "milestone";
  readonly choice: MilestoneChoice;
  readonly generation: number;
  readonly resolve: (resolution: MilestoneDecisionResolution) => void;
  readonly reject: (reason: unknown) => void;
}

interface QueuedCancelJob {
  readonly kind: "cancel";
  readonly generation: number;
  readonly resolve: (resolution: SmashCancelResolution) => void;
  readonly reject: (reason: unknown) => void;
}

type QueuedJob = QueuedCommandJob | QueuedRewardJob | QueuedMilestoneJob | QueuedCancelJob;

/** The runtime's mutable working copy of the run log; `RunCommandLog` is the exported readonly view. */
interface MutableRunCommandLog {
  scenarioId: string;
  seed: Seed | undefined;
  entries: RunCommandLogEntry[];
}
