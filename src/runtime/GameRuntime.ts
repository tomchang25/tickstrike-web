import { resolveCommand, type ActionResolution } from "../core/actions/action-resolver";
import type { GameCommand } from "../core/actions/commands";
import type { WorldSnapshot } from "../core/model/types";
import type { World } from "../core/world/world";
import type { TestScenario } from "../harness/types";
import { PixiGameRenderer, type ScreenBounds } from "../presentation/pixi/PixiGameRenderer";
import { PresentationDirector } from "../presentation/timelines/PresentationDirector";

export type RuntimeListener = (snapshot: WorldSnapshot) => void;

export class GameRuntime {
  readonly renderer = new PixiGameRenderer();
  readonly presentation = new PresentationDirector(this.renderer);

  private world: World | undefined;
  private scenario: TestScenario | undefined;
  private readonly listeners = new Set<RuntimeListener>();
  private actionQueue: Promise<void> = Promise.resolve();

  async mount(host: HTMLElement): Promise<void> {
    await this.renderer.mount(host);
  }

  destroy(): void {
    this.listeners.clear();
    this.renderer.destroy();
  }

  loadScenario(scenario: TestScenario): void {
    this.scenario = scenario;
    this.world = scenario.createWorld();
    this.renderer.sync(this.world.snapshot());
    this.emit();
  }

  reset(): void {
    if (!this.scenario) throw new Error("No scenario loaded.");
    this.loadScenario(this.scenario);
  }

  execute(command: GameCommand): Promise<ActionResolution> {
    let resolution: ActionResolution = { accepted: false, reason: "Not executed.", events: [] };

    this.actionQueue = this.actionQueue.then(async () => {
      const world = this.requireWorld();
      resolution = resolveCommand(world, command);
      this.emit();

      if (resolution.accepted) {
        await this.presentation.play(resolution.events, world);
        this.renderer.sync(world.snapshot());
        this.emit();
      }
    });

    return this.actionQueue.then(() => resolution);
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

  private requireWorld(): World {
    if (!this.world) throw new Error("No world loaded.");
    return this.world;
  }

  private emit(): void {
    if (!this.world) return;
    const snapshot = this.world.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
