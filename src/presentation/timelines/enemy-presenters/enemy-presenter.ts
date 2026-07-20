import type { Container, Graphics } from "pixi.js";
import type { gsap } from "gsap";
import type { CombatEvent } from "@core/events/combat-events";
import type { Cell, EntityId } from "@core/model/types";
import type { EnemyPresentation } from "../../pixi/enemy-sprites";

/**
 * Per-event presentation surface handed to an enemy presenter. Views and
 * presentations resolve lazily so a presenter sees director-owned terminal
 * ghosts exactly like live views.
 */
export interface EnemyPresenterContext {
  readonly enemyId: EntityId;
  getView(): Container | undefined;
  getPresentation(): EnemyPresentation | undefined;
  createImpact(cell: Cell, color?: number): Graphics;
  releaseTransient(effect: Graphics): void;
  /** Registers a timeline with the director so completion, cancel, and idle tracking work. */
  addTimeline(timeline: gsap.core.Timeline, afterComplete?: () => void): void;
}

/**
 * Enemy-scoped event presentation. The coordinator dispatches every enemy-scoped
 * combat event to the presenter registered for the enemy's presentation profile;
 * board motion, terminal-view lifecycle, and global effects stay central.
 */
export interface EnemyPresenter {
  presentEvent(context: EnemyPresenterContext, event: CombatEvent): void;
}
