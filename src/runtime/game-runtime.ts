import { resolveCommand, type ActionResolution } from "@core/actions/action-resolver";
import type { GameCommand } from "@core/actions/commands";
import { resolveRewardSelection, type RewardSelectionResolution } from "@core/actions/wave-phase";
import type { Cell, WorldSnapshot } from "@core/model/types";
import type { World } from "@core/world/world";
import type { TestScenario } from "@harness/types";
import type { ContentInspection } from "@harness/content-inspection";
import { PixiGameRenderer, type ScreenBounds } from "@presentation/pixi/pixi-game-renderer";
import { PresentationDirector } from "@presentation/timelines/presentation-director";

export type RuntimeListener = (snapshot: WorldSnapshot) => void;

export class GameRuntime {
  readonly renderer = new PixiGameRenderer();
  readonly presentation = new PresentationDirector(this.renderer);

  private world: World | undefined;
  private scenario: TestScenario | undefined;
  private readonly listeners = new Set<RuntimeListener>();
  private readonly queuedCommands: QueuedJob[] = [];
  private activeCommand: QueuedJob | undefined;
  private processingCommands = false;
  private currentGeneration = 0;

  get generation(): number {
    return this.currentGeneration;
  }

  get isIdle(): boolean {
    return !this.processingCommands && this.queuedCommands.length === 0 && this.presentation.isIdle;
  }

  async mount(host: HTMLElement): Promise<void> {
    await this.renderer.mount(host);
  }

  destroy(): void {
    this.invalidateWork("Runtime destroyed.");
    this.listeners.clear();
    this.renderer.destroy();
  }

  loadScenario(scenario: TestScenario): void {
    this.invalidateWork("Scenario replaced.");
    this.scenario = scenario;
    this.world = scenario.createWorld(scenario.seed);
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
    const generation = this.currentGeneration;
    return new Promise<ActionResolution>((resolve, reject) => {
      this.queuedCommands.push({ kind: "command", command, generation, resolve, reject });
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
    const generation = this.currentGeneration;
    return new Promise<RewardSelectionResolution>((resolve, reject) => {
      this.queuedCommands.push({ kind: "reward", artifactId, generation, resolve, reject });
      void this.drainCommands();
    });
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
            const resolution = resolveCommand(
              this.requireWorld(),
              job.command,
              this.scenario?.waveContext,
            );

            if (resolution.accepted) {
              this.presentation.reserveMotionOwners(resolution.events, job.generation);
              // The resolver already removed these entities, so capture must precede the
              // projection that would otherwise reconcile their views away.
              this.presentation.captureTerminalViews(resolution.events, job.generation);
            }

            this.emit();

            let presentationDone: Promise<void> | undefined;

            if (resolution.accepted) {
              presentationDone = this.presentation.play(resolution.events, job.generation);
              void presentationDone.then(
                () => this.notifyPresentationSettled(job.generation),
                () => this.notifyPresentationSettled(job.generation),
              );
            }

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Command cancelled by scenario replacement."));
            } else {
              job.resolve(resolution);
            }

            if (presentationDone) {
              await presentationDone;
            }
          } else {
            // Reward selection never touches the enemy phase or the presentation timeline.
            const waveContext = this.scenario?.waveContext;
            const resolution = waveContext
              ? resolveRewardSelection(this.requireWorld(), job.artifactId, waveContext)
              : { accepted: false, reason: "No reward context available.", events: [] };

            this.emit();

            if (job.generation !== this.currentGeneration) {
              job.reject(new Error("Reward selection cancelled by scenario replacement."));
            } else {
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

type QueuedJob = QueuedCommandJob | QueuedRewardJob;
