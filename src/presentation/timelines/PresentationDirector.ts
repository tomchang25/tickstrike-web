import { gsap } from "gsap";
import type { CombatEvent } from "../../core/events/combat-events";
import type { EntityId } from "../../core/model/types";
import type { PixiGameRenderer } from "../pixi/PixiGameRenderer";

interface ActiveTimeline {
  readonly timeline: gsap.core.Timeline;
  readonly resolve: () => void;
}

export class PresentationDirector {
  private readonly activeTimelines = new Set<ActiveTimeline>();
  private generation = 0;

  constructor(private readonly renderer: PixiGameRenderer) {}

  get isIdle(): boolean {
    return this.activeTimelines.size === 0 && this.renderer.transientCount === 0;
  }

  setGeneration(generation: number): void {
    this.cancel();
    this.generation = generation;
  }

  async play(events: readonly CombatEvent[], generation = this.generation): Promise<void> {
    const terminalIds = new Set<EntityId>();
    const animations: Promise<void>[] = [];

    for (const event of events) {
      switch (event.type) {
        case "actor_moved": {
          const view = this.renderer.getEntityView(event.entityId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.to);
          animations.push(this.timelineDone(
            gsap.timeline().to(view, { x: to.x, y: to.y, duration: 0.12, ease: "power2.out" }),
          ));
          break;
        }
        case "player_attacked": {
          const effect = this.renderer.createImpact(event.target);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .fromTo(effect.scale, { x: 0.35, y: 0.35 }, { x: 1.8, y: 1.8, duration: 0.14 })
              .to(effect, { alpha: 0, duration: 0.1 }, "<0.06"),
            () => this.renderer.releaseTransient(effect),
          ));
          break;
        }
        case "enemy_damaged": {
          if (event.hit.killed) break;
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.2, y: 1.2, duration: 0.06, ease: "power2.out" })
              .to(view.scale, { x: 1, y: 1, duration: 0.1, ease: "power2.in" }),
          ));
          break;
        }
        case "enemy_died": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.3, y: 0.25, duration: 0.09, ease: "power3.in" })
              .to(view, { alpha: 0, duration: 0.16, delay: 0.06 }),
          ));
          break;
        }
        case "player_dashed": {
          const view = this.renderer.getEntityView(event.actorId);
          if (!view) break;
          const from = this.renderer.cellToPixels(event.from);
          const to = this.renderer.cellToPixels(event.to);
          view.position.set(from.x, from.y);
          animations.push(this.timelineDone(
            gsap.timeline().to(view, { x: to.x, y: to.y, duration: 0.12, ease: "power3.out" }),
          ));
          break;
        }
        case "smash_armed": {
          const view = this.renderer.getEntityView(event.actorId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.12, y: 1.12, duration: 0.1, ease: "power2.out" })
              .to(view.scale, { x: 1, y: 1, duration: 0.12, ease: "power2.in" }),
          ));
          break;
        }
        case "smash_impact": {
          const effect = this.renderer.createImpact(event.cell);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .fromTo(effect.scale, { x: 0.4, y: 0.4 }, { x: 2.2, y: 2.2, duration: 0.2 })
              .to(effect, { alpha: 0, duration: 0.12 }, "<0.08"),
            () => this.renderer.releaseTransient(effect),
          ));
          break;
        }
        case "enemy_crushed": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .to(view.scale, { x: 1.35, y: 0.18, duration: 0.09, ease: "power3.in" })
              .to(view, { alpha: 0, duration: 0.18, delay: 0.08 }),
          ));
          break;
        }
        case "enemy_knocked": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.to);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .to(view, { x: to.x, y: to.y, rotation: 0.18, duration: 0.2, ease: "power3.out" })
              .to(view, { rotation: 0, duration: 0.08 }),
          ));
          break;
        }
        case "enemy_entered_water": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.waterCell);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .to(view, { x: to.x, y: to.y, duration: 0.22, ease: "power3.out" })
              .to(view, { rotation: -0.18, duration: 0.08 })
              .to(view, { rotation: 0.18, duration: 0.08, repeat: 3, yoyo: true })
              .to(view.scale, { x: 0.75, y: 0.3, duration: 0.18 })
              .to(view, { alpha: 0, y: to.y + 18, duration: 0.2 }),
          ));
          break;
        }
        case "command_resolved":
        case "world_advanced":
        case "reservation_changed":
        case "telegraph_changed":
          break;
      }
    }

    await Promise.all(animations);
    if (generation !== this.generation) return;
    for (const id of terminalIds) this.renderer.removeEntityView(id);
  }

  cancel(): void {
    for (const active of [...this.activeTimelines]) {
      active.timeline.kill();
      active.resolve();
    }
    this.activeTimelines.clear();
    this.renderer.clearTransient();
  }

  finishImmediately(): void {
    gsap.globalTimeline.timeScale(1000);
    gsap.globalTimeline.timeScale(1);
  }

  private timelineDone(timeline: gsap.core.Timeline, afterComplete?: () => void): Promise<void> {
    return new Promise((resolve) => {
      const active: ActiveTimeline = { timeline, resolve };
      const finish = () => {
        if (!this.activeTimelines.delete(active)) return;
        afterComplete?.();
        resolve();
      };
      timeline.eventCallback("onComplete", finish);
      timeline.eventCallback("onInterrupt", finish);
      this.activeTimelines.add(active);
    });
  }
}
