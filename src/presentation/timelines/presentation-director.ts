import { gsap } from "gsap";
import type { CombatEvent } from "@core/events/combat-events";
import { collectTerminalEntityIds } from "@core/events/terminal-entities";
import type { EntityId } from "@core/model/types";
import { enemyPresentationLabel, type DetachedEntityView, type PixiGameRenderer } from "../pixi/pixi-game-renderer";
import { getEnemyPresenter, type EnemyPresenterContext } from "./enemy-presenters";

const MOVE_DURATION = 0.26;

export interface BoardMotionStep {
  readonly entityId: EntityId;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly duration: number;
  readonly ease: string;
  readonly kind: "move" | "dash" | "knockback" | "water" | "displacement" | "landing";
}

export function normalizeMotionEvents(events: readonly CombatEvent[]): readonly BoardMotionStep[] {
  const steps: BoardMotionStep[] = [];
  for (const event of events) {
    let entityId: EntityId | undefined;
    let from: BoardMotionStep["from"] | undefined;
    let to: BoardMotionStep["to"] | undefined;
    let duration = MOVE_DURATION;
    let ease = "power2.out";
    let kind: BoardMotionStep["kind"] = "move";

    switch (event.type) {
      case "actor_moved":
        entityId = event.entityId;
        from = event.from;
        to = event.to;
        break;
      case "player_dashed":
        entityId = event.actorId;
        from = event.from;
        to = event.to;
        duration = 0.12;
        ease = "power3.out";
        kind = "dash";
        break;
      case "enemy_moved":
        entityId = event.enemyId;
        from = event.from;
        to = event.to;
        break;
      case "enemy_knocked":
        entityId = event.enemyId;
        from = event.from;
        to = event.to;
        duration = 0.2;
        ease = "power3.out";
        kind = "knockback";
        break;
      case "enemy_entered_water":
        entityId = event.enemyId;
        from = event.from;
        to = event.waterCell;
        duration = 0.22;
        ease = "power3.out";
        kind = "water";
        break;
      case "entity_displaced":
        entityId = event.entityId;
        from = event.from;
        to = event.to;
        duration = 0.18;
        kind = "displacement";
        break;
      case "charge_landed":
        entityId = event.enemyId;
        from = event.from;
        to = event.to;
        duration = 0.22;
        ease = "power3.out";
        kind = "landing";
        break;
      default:
        break;
    }

    if (entityId && from && to && (from.x !== to.x || from.y !== to.y)) {
      steps.push({ entityId, from, to, duration, ease, kind });
    }
  }
  return steps;
}

interface ActiveTimeline {
  readonly timeline: gsap.core.Timeline;
  readonly resolve: () => void;
}

export class PresentationDirector {
  private readonly activeTimelines = new Set<ActiveTimeline>();
  private readonly terminalViews = new Map<EntityId, DetachedEntityView>();
  private generation = 0;

  constructor(private readonly renderer: PixiGameRenderer) {}

  get isIdle(): boolean {
    return this.activeTimelines.size === 0 && this.terminalViews.size === 0 && this.renderer.transientCount === 0;
  }

  get terminalViewCount(): number {
    return this.terminalViews.size;
  }

  setGeneration(generation: number): void {
    this.cancel();
    this.generation = generation;
  }

  play(events: readonly CombatEvent[], generation = this.generation): Promise<void> {
    if (generation !== this.generation) {
      return Promise.resolve();
    }
    return this.playNow(events, generation);
  }

  captureTerminalViews(events: readonly CombatEvent[], generation = this.generation): void {
    if (generation !== this.generation) {
      return;
    }
    for (const id of collectTerminalEntityIds(events)) {
      if (this.terminalViews.has(id)) {
        continue;
      }
      const view = this.renderer.detachEntityView(id);
      if (view) {
        this.terminalViews.set(id, view);
      }
    }
    this.refreshTerminalPresentationLabels();
  }

  reserveMotionOwners(events: readonly CombatEvent[], generation = this.generation): void {
    if (generation !== this.generation) {
      return;
    }
    for (const entityId of new Set(normalizeMotionEvents(events).map((step) => step.entityId))) {
      this.renderer.reservePosition(entityId);
    }
  }

  private async playNow(events: readonly CombatEvent[], generation: number): Promise<void> {
    const terminalIds = collectTerminalEntityIds(events);
    const animations: Promise<void>[] = [];
    const stepsByEntity = new Map<EntityId, BoardMotionStep[]>();
    for (const step of normalizeMotionEvents(events)) {
      const steps = stepsByEntity.get(step.entityId) ?? [];
      steps.push(step);
      stepsByEntity.set(step.entityId, steps);
    }

    for (const event of events) {
      if (generation !== this.generation) {
        return;
      }
      switch (event.type) {
        case "player_attacked": {
          this.renderer.setPlayerFacing(event.direction, true);
          // The attack body animation plays to completion and settles to idle on its own (renderer
          // timed); the impact VFX below must not cut it short by forcing idle on its completion.
          this.renderer.setPlayerAnimation("attack");
          const effect = this.renderer.createImpact(event.target);
          animations.push(
            this.timelineDone(
              gsap
                .timeline()
                .fromTo(effect.scale, { x: 0.35, y: 0.35 }, { x: 1.8, y: 1.8, duration: 0.14 })
                .to(effect, { alpha: 0, duration: 0.1 }, "<0.06"),
              () => this.renderer.releaseTransient(effect),
            ),
          );
          break;
        }
        case "player_damaged": {
          const view = this.getEntityView(event.playerId);
          if (!view) {
            break;
          }
          animations.push(
            this.timelineDone(
              gsap
                .timeline()
                .to(view, { alpha: 0.45, duration: 0.06 })
                .to(view, { alpha: 1, duration: 0.12, repeat: 2, yoyo: true }),
            ),
          );
          break;
        }
        case "player_died": {
          const view = this.getEntityView(event.playerId);
          if (!view) {
            break;
          }
          animations.push(
            this.timelineDone(
              gsap
                .timeline()
                .to(view.scale, { x: 1.3, y: 0.25, duration: 0.09, ease: "power3.in" })
                .to(view, { alpha: 0, duration: 0.16, delay: 0.06 }),
            ),
          );
          break;
        }
        case "smash_armed": {
          const view = this.getEntityView(event.actorId);
          if (!view) {
            break;
          }
          animations.push(
            this.timelineDone(
              gsap
                .timeline()
                .to(view.scale, { x: 1.12, y: 1.12, duration: 0.1, ease: "power2.out" })
                .to(view.scale, { x: 1, y: 1, duration: 0.12, ease: "power2.in" }),
            ),
          );
          break;
        }
        case "smash_impact": {
          const effect = this.renderer.createImpact(event.cell);
          animations.push(
            this.timelineDone(
              gsap
                .timeline()
                .fromTo(effect.scale, { x: 0.4, y: 0.4 }, { x: 2.2, y: 2.2, duration: 0.2 })
                .to(effect, { alpha: 0, duration: 0.12 }, "<0.08"),
              () => this.renderer.releaseTransient(effect),
            ),
          );
          break;
        }
        default: {
          // Every enemy-scoped event routes to the presenter registered for the
          // enemy's presentation profile; the coordinator holds no per-role cases.
          if ("enemyId" in event) {
            const presenter = getEnemyPresenter(this.getEnemyPresentation(event.enemyId)?.profileId);
            presenter.presentEvent(this.presenterContext(event.enemyId, animations), event);
          }
          break;
        }
      }
    }

    for (const [entityId, steps] of stepsByEntity) {
      if (generation !== this.generation) {
        return;
      }
      const track = this.createMotionTrack(entityId, steps);
      if (track) {
        animations.push(this.timelineDone(track, () => this.renderer.releasePosition(entityId)));
      } else {
        this.renderer.releasePosition(entityId);
      }
    }

    await Promise.all(animations);
    if (generation !== this.generation) {
      return;
    }
    for (const id of terminalIds) {
      this.releaseTerminalView(id);
    }
  }

  private getEntityView(id: EntityId) {
    return this.terminalViews.get(id)?.root ?? this.renderer.getEntityView(id);
  }

  private presenterContext(enemyId: EntityId, animations: Promise<void>[]): EnemyPresenterContext {
    return {
      enemyId,
      getView: () => this.getEntityView(enemyId),
      getPresentation: () => this.getEnemyPresentation(enemyId),
      createImpact: (cell, color) => this.renderer.createImpact(cell, color),
      releaseTransient: (effect) => this.renderer.releaseTransient(effect),
      addTimeline: (timeline, afterComplete) => {
        animations.push(this.timelineDone(timeline, afterComplete));
      },
    };
  }

  private getEnemyPresentation(id: EntityId) {
    return this.terminalViews.get(id)?.enemyPresentation ?? this.renderer.getEnemyPresentation(id);
  }

  private releaseTerminalView(id: EntityId): void {
    this.renderer.releasePosition(id);
    const view = this.terminalViews.get(id);
    if (!view) {
      return;
    }
    this.terminalViews.delete(id);
    if (!view.root.destroyed) {
      view.root.destroy({ children: true });
    }
    this.refreshTerminalPresentationLabels();
  }

  private releaseTerminalViews(): void {
    for (const id of [...this.terminalViews.keys()]) {
      this.releaseTerminalView(id);
    }
    this.refreshTerminalPresentationLabels();
  }

  private refreshTerminalPresentationLabels(): void {
    this.renderer.setTerminalPresentationLabels(
      [...this.terminalViews.entries()]
        .map(([id, view]) => (view.enemyPresentation ? enemyPresentationLabel(id, view.enemyPresentation) : undefined))
        .filter((label): label is string => label !== undefined)
        .join("|"),
    );
  }

  private createMotionTrack(entityId: EntityId, steps: readonly BoardMotionStep[]): gsap.core.Timeline | undefined {
    const view = this.getEntityView(entityId);
    if (!view) {
      return undefined;
    }

    const track = gsap.timeline();
    const playerStep = entityId === "player" ? steps[0] : undefined;
    if (playerStep) {
      // Force the player to face the motion direction so a move/dash cleanly turns out of any held
      // pose (e.g. the dashLand finishing pose) instead of animating in the previous facing.
      const direction = {
        x: Math.sign(playerStep.to.x - playerStep.from.x),
        y: Math.sign(playerStep.to.y - playerStep.from.y),
      };
      this.renderer.setPlayerFacing(direction, true);
      this.renderer.setPlayerAnimation(playerStep.kind === "dash" ? "dash" : "move");
    }

    let cursor = 0;
    for (const step of steps) {
      const from = this.renderer.cellToPixels(step.from);
      const to = this.renderer.cellToPixels(step.to);
      track.fromTo(
        view,
        { x: from.x, y: from.y },
        { x: to.x, y: to.y, duration: step.duration, ease: step.ease },
        cursor,
      );

      if (step.kind === "knockback") {
        track.to(view, { rotation: 0.18, duration: 0.06 }, cursor);
        track.to(view, { rotation: 0, duration: 0.08 }, cursor + step.duration - 0.08);
      } else if (step.kind === "water") {
        const presentation = this.getEnemyPresentation(entityId);
        if (presentation) {
          const direction = {
            x: Math.sign(step.to.x - step.from.x),
            y: Math.sign(step.to.y - step.from.y),
          };
          const waterClock = { progress: 0 };
          let waterCursor = cursor + step.duration;
          track.call(
            () => {
              presentation.beginEnteredWater(direction);
              this.refreshTerminalPresentationLabels();
            },
            [],
            waterCursor,
          );
          for (let frame = 1; frame < presentation.waterFrameDurationsMs.length; frame += 1) {
            track.to(
              waterClock,
              {
                progress: frame,
                duration: (presentation.waterFrameDurationsMs[frame - 1] ?? 0) / 1000,
                ease: "none",
              },
              waterCursor,
            );
            waterCursor += (presentation.waterFrameDurationsMs[frame - 1] ?? 0) / 1000;
            track.call(
              () => {
                presentation.setEnteredWaterFrame(frame);
                this.refreshTerminalPresentationLabels();
              },
              [],
              waterCursor,
            );
          }
          track.to(
            waterClock,
            {
              progress: presentation.waterFrameDurationsMs.length,
              duration: (presentation.waterFrameDurationsMs[presentation.waterFrameDurationsMs.length - 1] ?? 0) / 1000,
              ease: "none",
            },
            waterCursor,
          );
        } else {
          track.to(view, { rotation: -0.18, duration: 0.08 }, cursor + step.duration);
          track.to(view, { rotation: 0.18, duration: 0.08, repeat: 3, yoyo: true }, cursor + step.duration + 0.08);
          track.to(view.scale, { x: 0.75, y: 0.3, duration: 0.18 }, cursor + step.duration + 0.4);
          track.to(view, { alpha: 0, duration: 0.2 }, cursor + step.duration + 0.58);
        }
      }

      if (step.kind === "move" && entityId !== "player") {
        const presentation = this.getEnemyPresentation(entityId);
        if (presentation) {
          track.add(presentation.playMove(), cursor);
        }
      }
      if (playerStep && step.kind === "dash") {
        track.call(() => this.renderer.setPlayerAnimation("dash"), [], cursor);
      }
      cursor += step.duration;
    }

    if (playerStep) {
      // A dash settles into its held finishing pose; every other player motion returns to idle.
      const settled = playerStep.kind === "dash" ? "dashLand" : "idle";
      track.call(() => this.renderer.setPlayerAnimation(settled), [], cursor);
    }
    return track;
  }

  cancel(): void {
    for (const active of [...this.activeTimelines]) {
      active.timeline.kill();
      active.resolve();
    }
    this.activeTimelines.clear();
    this.releaseTerminalViews();
    this.renderer.clearTransient();
    this.renderer.clearPositionReservations();
    this.renderer.resetEnemyPresentations?.();
    this.renderer.setPlayerAnimation("idle");
  }

  /**
   * Drives every in-flight timeline straight to its end state. Unlike {@link cancel}, this
   * completes rather than kills: `totalProgress(1)` fires each timeline's remaining ordered
   * callbacks, triggers its `onComplete`, and runs the same release path as natural completion
   * (transients, motion reservations, tracked-promise resolution, terminal-view destruction).
   * The runtime calls this when a new input is enqueued so pending VFX collapse to their
   * settled frame instead of blocking the next command behind their full duration. A copy of
   * the active set is iterated because completing a timeline deletes it from `activeTimelines`.
   */
  finishActive(): void {
    for (const active of [...this.activeTimelines]) {
      active.timeline.totalProgress(1);
    }
  }

  private timelineDone(timeline: gsap.core.Timeline, afterComplete?: () => void): Promise<void> {
    return new Promise((resolve) => {
      const active: ActiveTimeline = { timeline, resolve };
      const finish = () => {
        if (!this.activeTimelines.delete(active)) {
          return;
        }
        afterComplete?.();
        resolve();
      };
      timeline.eventCallback("onComplete", finish);
      timeline.eventCallback("onInterrupt", finish);
      this.activeTimelines.add(active);
    });
  }
}
