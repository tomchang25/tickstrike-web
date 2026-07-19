import { gsap } from "gsap";
import type { CombatEvent } from "../../core/events/combat-events";
import type { EntityId } from "../../core/model/types";
import type { PixiGameRenderer } from "../pixi/PixiGameRenderer";

const MOVE_DURATION = 0.26;

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

  play(events: readonly CombatEvent[], generation = this.generation): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    return this.playNow(events, generation);
  }

  private async playNow(events: readonly CombatEvent[], generation: number): Promise<void> {
    const terminalIds = new Set<EntityId>();
    const animations: Promise<void>[] = [];

    for (const event of events) {
      if (generation !== this.generation) return;
      switch (event.type) {
        case "actor_moved": {
          const view = this.renderer.getEntityView(event.entityId);
          if (!view) break;
          const to = this.renderer.cellToPixels(event.to);
          if (event.entityId === "player") this.renderer.setPlayerAnimation("move");
          animations.push(this.timelineDone(
            gsap.timeline().fromTo(
              view,
              { x: this.renderer.cellToPixels(event.from).x, y: this.renderer.cellToPixels(event.from).y },
              { x: to.x, y: to.y, duration: MOVE_DURATION, ease: "power2.out" },
            ),
            event.entityId === "player" ? () => this.renderer.setPlayerAnimation("idle") : undefined,
          ));
          break;
        }
        case "enemy_moved": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          const from = this.renderer.cellToPixels(event.from);
          const to = this.renderer.cellToPixels(event.to);
          animations.push(this.timelineDone(
            gsap.timeline().fromTo(
              view,
              { x: from.x, y: from.y },
              { x: to.x, y: to.y, duration: MOVE_DURATION, ease: "power2.out" },
            ),
          ));
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (presentation) animations.push(this.timelineDone(presentation.playMove()));
          break;
        }
        case "player_attacked": {
          this.renderer.setPlayerFacing(event.direction, true);
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
        case "enemy_attack_committed": {
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (presentation) {
            animations.push(this.timelineDone(presentation.playPrepareAttack()));
            break;
          }
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.1, y: 1.1, duration: 0.09, ease: "power2.out" })
              .to(view.scale, { x: 1, y: 1, duration: 0.13, ease: "power2.in" }),
          ));
          break;
        }
        case "enemy_attack_detonated": {
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (presentation) animations.push(this.timelineDone(presentation.playAttackCommit()));
          if (!event.hit) break;
          const effect = this.renderer.createImpact(event.target);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .fromTo(effect.scale, { x: 0.25, y: 0.25 }, { x: 2, y: 2, duration: 0.16, ease: "power2.out" })
              .to(effect, { alpha: 0, duration: 0.12 }, "<0.06"),
            () => this.renderer.releaseTransient(effect),
          ));
          break;
        }
        case "enemy_damaged": {
          if (event.hit.killed) break;
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (presentation) {
            animations.push(this.timelineDone(presentation.playDamage()));
            break;
          }
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.2, y: 1.2, duration: 0.06, ease: "power2.out" })
              .to(view.scale, { x: 1, y: 1, duration: 0.1, ease: "power2.in" }),
          ));
          break;
        }
        case "enemy_guard_damaged": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view, { x: "+=4", duration: 0.04, ease: "power1.out" })
              .to(view, { x: "-=8", duration: 0.05, ease: "power1.inOut" })
              .to(view, { x: "+=4", duration: 0.04, ease: "power1.in" }),
          ));
          break;
        }
        case "enemy_guard_broken": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view.scale, { x: 1.22, y: 1.22, duration: 0.08, ease: "power3.out" })
              .to(view, { rotation: 0.14, duration: 0.06 })
              .to(view, { rotation: -0.14, duration: 0.06, repeat: 2, yoyo: true })
              .to(view.scale, { x: 1, y: 1, duration: 0.1, ease: "power3.in" })
              .to(view, { rotation: 0, duration: 0.05 }),
          ));
          break;
        }
        case "enemy_staggered": {
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (presentation) {
            const timeline = presentation.playStaggered();
            if (timeline) animations.push(this.timelineDone(timeline));
            break;
          }
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view, { alpha: 0.55, duration: 0.06 })
              .to(view, { alpha: 1, duration: 0.08, repeat: 2, yoyo: true }),
          ));
          break;
        }
        case "enemy_protection_started": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view, { alpha: 0.7, duration: 0.08 })
              .to(view, { alpha: 1, duration: 0.12 }),
          ));
          break;
        }
        case "player_damaged": {
          const view = this.renderer.getEntityView(event.playerId);
          if (!view) break;
          animations.push(this.timelineDone(
            gsap.timeline()
              .to(view, { alpha: 0.45, duration: 0.06 })
              .to(view, { alpha: 1, duration: 0.12, repeat: 2, yoyo: true }),
          ));
          break;
        }
        case "enemy_died": {
          const view = this.renderer.getEntityView(event.enemyId);
          terminalIds.add(event.enemyId);
          if (!view) break;
          if (this.renderer.getEnemyPresentation?.(event.enemyId)) {
            animations.push(this.timelineDone(
              gsap.timeline()
                .to(view.scale, { x: 0, y: 0, duration: 0.5, ease: "power2.in" })
                .to(view, { rotation: `+=${Math.PI * 2}`, alpha: 0, duration: 0.5 }, "<"),
            ));
          } else {
            animations.push(this.timelineDone(
              gsap.timeline()
                .to(view.scale, { x: 1.3, y: 0.25, duration: 0.09, ease: "power3.in" })
                .to(view, { alpha: 0, duration: 0.16, delay: 0.06 }),
            ));
          }
          break;
        }
        case "player_died": {
          const view = this.renderer.getEntityView(event.playerId);
          terminalIds.add(event.playerId);
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
          this.renderer.setPlayerAnimation("dash");
          animations.push(this.timelineDone(
            gsap.timeline().to(view, { x: to.x, y: to.y, duration: 0.12, ease: "power3.out" }),
            () => this.renderer.setPlayerAnimation("idle"),
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
        case "entity_displaced": {
          const view = this.renderer.getEntityView(event.entityId);
          if (!view) break;
          const from = this.renderer.cellToPixels(event.from);
          const to = this.renderer.cellToPixels(event.to);
          animations.push(this.timelineDone(
            gsap.timeline().fromTo(
              view,
              { x: from.x, y: from.y },
              { x: to.x, y: to.y, duration: 0.18, ease: "power2.out" },
            ),
          ));
          break;
        }
        case "charge_impact": {
          const isBlocked = event.outcome === "blocked";
          if (event.outcome === "empty") break;
          const effect = this.renderer.createImpact(event.cell, isBlocked ? 0xff4444 : 0xffffff);
          animations.push(this.timelineDone(
            gsap
              .timeline()
              .fromTo(effect.scale, { x: 0.3, y: 0.3 }, {
                x: isBlocked ? 2.4 : 2,
                y: isBlocked ? 2.4 : 2,
                duration: isBlocked ? 0.2 : 0.16,
                ease: "power2.out",
              })
              .to(effect, { alpha: 0, duration: 0.12 }, "<0.06"),
            () => this.renderer.releaseTransient(effect),
          ));
          break;
        }
        case "charge_landed": {
          const view = this.renderer.getEntityView(event.enemyId);
          if (!view) break;
          const from = this.renderer.cellToPixels(event.from);
          const to = this.renderer.cellToPixels(event.to);
          animations.push(this.timelineDone(
            gsap.timeline().fromTo(
              view,
              { x: from.x, y: from.y },
              { x: to.x, y: to.y, duration: 0.22, ease: "power3.out" },
            ),
          ));
          break;
        }
        case "enemy_attack_interrupted": {
          this.renderer.getEnemyPresentation?.(event.enemyId)?.clearAction();
          break;
        }
        case "enemy_stagger_ended": {
          const presentation = this.renderer.getEnemyPresentation?.(event.enemyId);
          if (!presentation) break;
          const timeline = presentation.playStaggerEnded();
          if (timeline) animations.push(this.timelineDone(timeline));
          break;
        }
        case "command_resolved":
        case "world_advanced":
        case "directional_hit":
        case "enemy_protection_ended":
        case "enemy_recovering":
        case "enemy_recovered":
        case "encounter_ended":
        case "enemy_waited":
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
    this.renderer.resetEnemyPresentations?.();
    this.renderer.setPlayerAnimation("idle");
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
