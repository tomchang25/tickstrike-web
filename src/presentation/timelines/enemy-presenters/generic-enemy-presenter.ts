import { gsap } from "gsap";
import type { CombatEvent } from "@core/events/combat-events";
import type { EnemyPresenter, EnemyPresenterContext } from "./enemy-presenter";

const FUSE_BLINK_INTERVAL = 0.22;
const FUSE_BLINK_FAST_INTERVAL = 0.09;
const FUSE_BLINK_MIN_ALPHA = 0.35;
const EXPLOSION_SCALE = 9;

type EventOf<T extends CombatEvent["type"]> = Extract<CombatEvent, { type: T }>;

/**
 * Default visuals for every enemy-scoped combat event. Each named method is an
 * override seam for a specialized presenter; anything not overridden keeps the
 * shared reaction. Blink and self-destruct visuals stay metadata/event-driven
 * here so a profile without a dedicated presenter presents identically.
 */
export class GenericEnemyPresenter implements EnemyPresenter {
  presentEvent(context: EnemyPresenterContext, event: CombatEvent): void {
    switch (event.type) {
      case "enemy_attack_committed":
        this.attackCommitted(context, event);
        break;
      case "enemy_attack_detonated":
        this.attackDetonated(context, event);
        break;
      case "enemy_damaged":
        this.damaged(context, event);
        break;
      case "enemy_guard_damaged":
        this.guardDamaged(context, event);
        break;
      case "enemy_guard_broken":
        this.guardBroken(context, event);
        break;
      case "enemy_staggered":
        this.staggered(context, event);
        break;
      case "enemy_stagger_ended":
        this.staggerEnded(context, event);
        break;
      case "enemy_protection_started":
        this.protectionStarted(context, event);
        break;
      case "enemy_self_destructed":
        this.selfDestructed(context, event);
        break;
      case "enemy_died":
        this.died(context, event);
        break;
      case "enemy_crushed":
        this.crushed(context, event);
        break;
      case "charge_impact":
        this.chargeImpact(context, event);
        break;
      case "enemy_attack_interrupted":
        this.attackInterrupted(context, event);
        break;
      default:
        break;
    }
  }

  protected attackCommitted(context: EnemyPresenterContext, event: EventOf<"enemy_attack_committed">): void {
    const presentation = context.getPresentation();
    if (presentation) {
      const timeline = presentation.playPrepareAttack();
      if (timeline) {
        context.addTimeline(timeline);
      }
      if (event.attack.metadata?.selfDestruct && !presentation.hasPrepareAnimation) {
        presentation.playFuseBlink(FUSE_BLINK_INTERVAL, FUSE_BLINK_MIN_ALPHA);
      }
      return;
    }
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view.scale, { x: 1.1, y: 1.1, duration: 0.09, ease: "power2.out" })
        .to(view.scale, { x: 1, y: 1, duration: 0.13, ease: "power2.in" }),
    );
  }

  protected attackDetonated(context: EnemyPresenterContext, event: EventOf<"enemy_attack_detonated">): void {
    const presentation = context.getPresentation();
    if (presentation) {
      context.addTimeline(presentation.playAttackCommit());
      if (event.attack.metadata?.selfDestruct && !presentation.hasExecuteAnimation) {
        presentation.playFuseBlink(FUSE_BLINK_FAST_INTERVAL, FUSE_BLINK_MIN_ALPHA);
      }
    }
    if (!event.hit) {
      return;
    }
    const effect = context.createImpact(event.target);
    context.addTimeline(
      gsap
        .timeline()
        .fromTo(effect.scale, { x: 0.25, y: 0.25 }, { x: 2, y: 2, duration: 0.16, ease: "power2.out" })
        .to(effect, { alpha: 0, duration: 0.12 }, "<0.06"),
      () => context.releaseTransient(effect),
    );
  }

  protected damaged(context: EnemyPresenterContext, event: EventOf<"enemy_damaged">): void {
    if (event.hit.killed) {
      return;
    }
    const presentation = context.getPresentation();
    if (presentation) {
      context.addTimeline(presentation.playDamage());
      return;
    }
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view.scale, { x: 1.2, y: 1.2, duration: 0.06, ease: "power2.out" })
        .to(view.scale, { x: 1, y: 1, duration: 0.1, ease: "power2.in" }),
    );
  }

  protected guardDamaged(context: EnemyPresenterContext, _event: EventOf<"enemy_guard_damaged">): void {
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view, { rotation: 0.06, duration: 0.04, ease: "power1.out" })
        .to(view, { rotation: -0.12, duration: 0.05, ease: "power1.inOut" })
        .to(view, { rotation: 0, duration: 0.04, ease: "power1.in" }),
    );
  }

  protected guardBroken(context: EnemyPresenterContext, _event: EventOf<"enemy_guard_broken">): void {
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view.scale, { x: 1.22, y: 1.22, duration: 0.08, ease: "power3.out" })
        .to(view, { rotation: 0.14, duration: 0.06 })
        .to(view, { rotation: -0.14, duration: 0.06, repeat: 2, yoyo: true })
        .to(view.scale, { x: 1, y: 1, duration: 0.1, ease: "power3.in" })
        .to(view, { rotation: 0, duration: 0.05 }),
    );
  }

  protected staggered(context: EnemyPresenterContext, _event: EventOf<"enemy_staggered">): void {
    const presentation = context.getPresentation();
    if (presentation) {
      const timeline = presentation.playStaggered();
      if (timeline) {
        context.addTimeline(timeline);
      }
      return;
    }
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view, { alpha: 0.55, duration: 0.06 })
        .to(view, { alpha: 1, duration: 0.08, repeat: 2, yoyo: true }),
    );
  }

  protected staggerEnded(context: EnemyPresenterContext, _event: EventOf<"enemy_stagger_ended">): void {
    const presentation = context.getPresentation();
    if (!presentation) {
      return;
    }
    const timeline = presentation.playStaggerEnded();
    if (timeline) {
      context.addTimeline(timeline);
    }
  }

  protected protectionStarted(context: EnemyPresenterContext, _event: EventOf<"enemy_protection_started">): void {
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap.timeline().to(view, { alpha: 0.7, duration: 0.08 }).to(view, { alpha: 1, duration: 0.12 }),
    );
  }

  protected selfDestructed(context: EnemyPresenterContext, event: EventOf<"enemy_self_destructed">): void {
    context.getPresentation()?.stopBlink();
    const effect = context.createImpact(event.cell, 0xff5a33);
    context.addTimeline(
      gsap
        .timeline()
        .fromTo(
          effect.scale,
          { x: 0.3, y: 0.3 },
          { x: EXPLOSION_SCALE, y: EXPLOSION_SCALE, duration: 0.22, ease: "power2.out" },
        )
        .to(effect, { alpha: 0, duration: 0.16 }, "<0.1"),
      () => context.releaseTransient(effect),
    );
  }

  protected died(context: EnemyPresenterContext, _event: EventOf<"enemy_died">): void {
    const view = context.getView();
    context.getPresentation()?.stopBlink();
    if (!view) {
      return;
    }
    if (context.getPresentation()) {
      context.addTimeline(
        gsap
          .timeline()
          .to(view.scale, { x: 0, y: 0, duration: 0.5, ease: "power2.in" })
          .to(view, { rotation: `+=${Math.PI * 2}`, alpha: 0, duration: 0.5 }, "<"),
      );
    } else {
      context.addTimeline(
        gsap
          .timeline()
          .to(view.scale, { x: 1.3, y: 0.25, duration: 0.09, ease: "power3.in" })
          .to(view, { alpha: 0, duration: 0.16, delay: 0.06 }),
      );
    }
  }

  protected crushed(context: EnemyPresenterContext, _event: EventOf<"enemy_crushed">): void {
    const view = context.getView();
    if (!view) {
      return;
    }
    context.addTimeline(
      gsap
        .timeline()
        .to(view.scale, { x: 1.35, y: 0.18, duration: 0.09, ease: "power3.in" })
        .to(view, { alpha: 0, duration: 0.18, delay: 0.08 }),
    );
  }

  protected chargeImpact(context: EnemyPresenterContext, event: EventOf<"charge_impact">): void {
    const isBlocked = event.outcome === "blocked";
    if (event.outcome === "empty") {
      return;
    }
    const effect = context.createImpact(event.cell, isBlocked ? 0xff4444 : 0xffffff);
    context.addTimeline(
      gsap
        .timeline()
        .fromTo(
          effect.scale,
          { x: 0.3, y: 0.3 },
          {
            x: isBlocked ? 2.4 : 2,
            y: isBlocked ? 2.4 : 2,
            duration: isBlocked ? 0.2 : 0.16,
            ease: "power2.out",
          },
        )
        .to(effect, { alpha: 0, duration: 0.12 }, "<0.06"),
      () => context.releaseTransient(effect),
    );
  }

  protected attackInterrupted(context: EnemyPresenterContext, _event: EventOf<"enemy_attack_interrupted">): void {
    context.getPresentation()?.clearAction();
  }
}

export const genericEnemyPresenter = new GenericEnemyPresenter();
