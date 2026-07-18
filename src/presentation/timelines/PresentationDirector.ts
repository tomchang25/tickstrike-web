import { gsap } from "gsap";
import type { CombatEvent } from "../../core/events/combat-events";
import type { EntityId } from "../../core/model/types";
import type { PixiGameRenderer } from "../pixi/PixiGameRenderer";

function timelineDone(
  timeline: gsap.core.Timeline,
  afterComplete?: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    timeline.eventCallback("onComplete", () => {
      afterComplete?.();
      resolve();
    });
  });
}

export class PresentationDirector {
  constructor(private readonly renderer: PixiGameRenderer) {}

  async play(events: readonly CombatEvent[]): Promise<void> {
    const terminalIds = new Set<EntityId>();
    const animations: Promise<void>[] = [];

    for (const event of events) {
      switch (event.type) {
        case "actor_moved": {
          const view = this.renderer.getEntityView(event.entityId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.to);
          animations.push(
            timelineDone(
              gsap.timeline().to(view, {
                x: to.x,
                y: to.y,
                duration: 0.12,
                ease: "power2.out",
              }),
            ),
          );
          break;
        }
        case "smash_impact": {
          const effect = this.renderer.createImpact(event.cell);
          animations.push(
            timelineDone(
              gsap
                .timeline()
                .fromTo(effect.scale, { x: 0.4, y: 0.4 }, { x: 2.2, y: 2.2, duration: 0.2 })
                .to(effect, { alpha: 0, duration: 0.12 }, "<0.08"),
              () => effect.destroy(),
            ),
          );
          break;
        }
        case "enemy_crushed": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          animations.push(
            timelineDone(
              gsap
                .timeline()
                .to(view.scale, { x: 1.35, y: 0.18, duration: 0.09, ease: "power3.in" })
                .to(view, { alpha: 0, duration: 0.18, delay: 0.08 }),
            ),
          );
          break;
        }
        case "enemy_knocked": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.to);
          animations.push(
            timelineDone(
              gsap
                .timeline()
                .to(view, { x: to.x, y: to.y, rotation: 0.18, duration: 0.2, ease: "power3.out" })
                .to(view, { rotation: 0, duration: 0.08 }),
            ),
          );
          break;
        }
        case "enemy_entered_water": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.waterCell);
          animations.push(
            timelineDone(
              gsap
                .timeline()
                .to(view, { x: to.x, y: to.y, duration: 0.22, ease: "power3.out" })
                .to(view, { rotation: -0.18, duration: 0.08 })
                .to(view, { rotation: 0.18, duration: 0.08, repeat: 3, yoyo: true })
                .to(view.scale, { x: 0.75, y: 0.3, duration: 0.18 })
                .to(view, { alpha: 0, y: to.y + 18, duration: 0.2 }),
            ),
          );
          break;
        }
      }
    }

    await Promise.all(animations);
    for (const id of terminalIds) {
      this.renderer.removeEntityView(id);
    }
  }

  finishImmediately(): void {
    gsap.globalTimeline.timeScale(1000);
    gsap.globalTimeline.timeScale(1);
  }
}
