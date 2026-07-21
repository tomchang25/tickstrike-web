import type { Application } from "pixi.js";
import {
  clampSmashTarget,
  previewAttack,
  previewAttackVictimMarkers,
  previewDash,
  previewDashVictimMarkers,
  previewSmash,
  previewSmashVictimMarkers,
  type AttackPreview,
  type DashPreview,
  type PreviewVictimMarker,
  type SmashPreview,
} from "@core/actions/action-preview";
import {
  cardinalDirection,
  sameCell,
  type Cell,
  type MobilityKind,
  type WorldSnapshot,
} from "@core/model/types";
import {
  INITIAL_AIM,
  resolveAimDirection,
  resolveAimDistance,
  screenPointToCell,
} from "./pointer-aim";

export type PointerMode = "attack" | "mobility";
export type PointerCommit =
  | { readonly kind: "attack"; readonly direction: Cell }
  | { readonly kind: "dash"; readonly direction: Cell; readonly distance: number }
  | { readonly kind: "smash"; readonly target: Cell };

export interface PointerInputBinding {
  canInteract(): boolean;
  onPrimaryClick(commit: PointerCommit): void | Promise<void>;
}

export interface InputPresentationHooks {
  applyFacing(direction: Cell): void;
  drawPreview(): void;
  clearPreview(): void;
}

/**
 * Owns gameplay pointer input: mode, hovered cell, dash distance, aim memory,
 * and the player-facing lock, plus the canvas listener lifecycle and
 * click→commit resolution. It computes the action previews (core
 * `action-preview`) that decide what command a click produces; drawing that
 * preview model and applying facing to the player sprite stay with the
 * renderer, reached only through the injected hooks.
 */
export class InputController {
  private mode: PointerMode = "attack";
  private hoverCell: Cell | undefined;
  private lastAim: Cell = INITIAL_AIM;
  private facing: Cell = INITIAL_AIM;
  private facingLocked = false;
  private projectedMotionKey: string | undefined;
  private distance = 3;
  private attack: AttackPreview | undefined;
  private dash: DashPreview | undefined;
  private retainedDash: DashPreview | undefined;
  private smash: SmashPreview | undefined;
  private victims: readonly PreviewVictimMarker[] = [];
  private cleanup: (() => void) | undefined;

  constructor(
    private readonly app: Application,
    private readonly snapshot: () => WorldSnapshot | undefined,
    private readonly hooks: InputPresentationHooks,
  ) {}

  get pointerMode(): PointerMode {
    return this.mode;
  }

  get playerFacing(): Cell {
    return this.facing;
  }

  get attackPreview(): AttackPreview | undefined {
    return this.attack;
  }

  get dashPreview(): DashPreview | undefined {
    return this.dash;
  }

  get retainedDashPreview(): DashPreview | undefined {
    return this.retainedDash;
  }

  get smashPreview(): SmashPreview | undefined {
    return this.smash;
  }

  get victimPreviewMarkers(): readonly PreviewVictimMarker[] {
    return this.victims;
  }

  setPointerMode(mode: PointerMode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.dash = undefined;
    this.retainedDash = undefined;
    this.smash = undefined;
    this.refreshPreview();
  }

  bind(binding: PointerInputBinding): () => void {
    this.cleanup?.();

    const canvas = this.app.canvas;
    const onPointerMove = (event: PointerEvent) => {
      const nextPointerCell = this.pointerToCell(event);
      if (nextPointerCell && this.hoverCell && sameCell(nextPointerCell, this.hoverCell)) {
        return;
      }
      this.hoverCell = nextPointerCell;
      this.refreshPreview(true);
    };
    const onPointerLeave = () => {
      this.hoverCell = undefined;
      this.attack = undefined;
      this.dash = undefined;
      this.retainedDash = undefined;
      this.smash = undefined;
      this.victims = [];
      if (this.snapshot()?.armedSmashTarget) {
        this.refreshPreview();
      } else {
        this.hooks.clearPreview();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !binding.canInteract()) {
        return;
      }
      this.refreshPreview();
      if (this.snapshot()?.armedSmashTarget) {
        if (!this.smash?.accepted) {
          return;
        }
        event.preventDefault();
        void binding.onPrimaryClick({ kind: "smash", target: this.smash.target });
        return;
      }
      if (this.mode === "attack") {
        if (!this.attack?.accepted) {
          return;
        }
        event.preventDefault();
        this.lastAim = this.attack.direction;
        void binding.onPrimaryClick({ kind: "attack", direction: this.attack.direction });
        return;
      }
      if (this.activeMobility() === "dash") {
        if (!this.dash?.accepted) {
          return;
        }
        event.preventDefault();
        this.lastAim = this.dash.direction;
        void binding.onPrimaryClick({
          kind: "dash",
          direction: this.dash.direction,
          distance: this.distance,
        });
        return;
      }
      if (!this.smash?.accepted) {
        return;
      }
      event.preventDefault();
      void binding.onPrimaryClick({ kind: "smash", target: this.smash.target });
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    let active = true;
    const cleanup = () => {
      if (!active) {
        return;
      }
      active = false;
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      if (this.cleanup === cleanup) {
        this.cleanup = undefined;
      }
    };
    this.cleanup = cleanup;
    return cleanup;
  }

  unbind(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }

  resetForNewRun(): void {
    this.lastAim = INITIAL_AIM;
    this.facing = INITIAL_AIM;
    this.facingLocked = false;
    this.projectedMotionKey = undefined;
    this.dash = undefined;
    this.retainedDash = undefined;
    this.smash = undefined;
    this.victims = [];
  }

  setPlayerFacing(facing: Cell, force = false): void {
    const direction = cardinalDirection(facing);
    if (!direction) {
      return;
    }
    if (this.facingLocked && !force) {
      return;
    }
    if (sameCell(this.facing, direction)) {
      return;
    }
    this.facing = direction;
    this.hooks.applyFacing(direction);
  }

  setFacingLocked(locked: boolean): void {
    this.facingLocked = locked;
  }

  noteSnapshotMotion(snapshot: WorldSnapshot): void {
    let motionKey: string | undefined;
    let motionFrom: Cell | undefined;
    let motionTo: Cell | undefined;
    for (const event of snapshot.lastEvents) {
      if (event.type === "actor_moved" && event.entityId === "player") {
        motionKey = `move:${event.from.x},${event.from.y}:${event.to.x},${event.to.y}`;
        motionFrom = event.from;
        motionTo = event.to;
      } else if (event.type === "player_dashed" && event.actorId === "player") {
        motionKey = `dash:${event.from.x},${event.from.y}:${event.to.x},${event.to.y}`;
        motionFrom = event.from;
        motionTo = event.to;
      }
    }
    if (!motionKey || motionKey === this.projectedMotionKey || !motionFrom || !motionTo) {
      return;
    }
    this.projectedMotionKey = motionKey;
    this.facingLocked = true;
    const direction = {
      x: Math.sign(motionTo.x - motionFrom.x),
      y: Math.sign(motionTo.y - motionFrom.y),
    };
    if (Math.abs(direction.x) + Math.abs(direction.y) === 1) {
      this.facing = direction;
    }
  }

  activeMobility(): MobilityKind {
    return (
      this.snapshot()?.entities.find((entity) => entity.kind === "player")?.mobility?.kind ?? "dash"
    );
  }

  refreshPreview(allowFacingUpdate = false): void {
    const snapshot = this.snapshot();
    if (!snapshot) {
      this.attack = undefined;
      this.dash = undefined;
      this.retainedDash = undefined;
      this.smash = undefined;
      this.victims = [];
      this.hooks.clearPreview();
      return;
    }

    const player = snapshot.entities.find(
      (entity) => entity.id === "player" && entity.phase === "alive",
    );
    if (!player) {
      this.attack = undefined;
      this.dash = undefined;
      this.smash = undefined;
      this.victims = [];
      this.hooks.clearPreview();
      return;
    }

    this.attack = undefined;
    this.dash = undefined;
    this.smash = undefined;
    this.victims = [];

    if (snapshot.armedSmashTarget) {
      if (allowFacingUpdate) {
        this.setPlayerFacing(
          resolveAimDirection(snapshot.armedSmashTarget, player.cell, this.lastAim),
        );
      }
      this.smash = previewSmash(snapshot, player.id, snapshot.armedSmashTarget);
      this.victims = previewSmashVictimMarkers(this.smash);
      this.hooks.drawPreview();
      return;
    }

    if (!this.hoverCell) {
      this.hooks.clearPreview();
      return;
    }

    const direction = resolveAimDirection(this.hoverCell, player.cell, this.lastAim);
    if (allowFacingUpdate) {
      this.setPlayerFacing(direction);
    }

    if (this.mode === "attack" && !snapshot.armedSmashTarget) {
      this.attack = previewAttack(snapshot, player.id, direction);
      this.victims = previewAttackVictimMarkers(this.attack);
      this.hooks.drawPreview();
      return;
    }

    const mobility = this.activeMobility();
    const range = player.mobility?.range ?? 3;
    if (mobility === "dash") {
      this.distance = resolveAimDistance(this.hoverCell, player.cell, range);
      this.dash = previewDash(snapshot, player.id, direction, this.distance);
      this.victims = previewDashVictimMarkers(this.dash);
      if (this.dash.accepted) {
        this.retainedDash = this.dash;
      }
    } else {
      this.smash = previewSmash(
        snapshot,
        player.id,
        clampSmashTarget(this.hoverCell, player.cell, range),
      );
      this.victims = previewSmashVictimMarkers(this.smash);
    }
    this.hooks.drawPreview();
  }

  private pointerToCell(event: PointerEvent): Cell | undefined {
    const rect = this.app.canvas.getBoundingClientRect();
    return screenPointToCell(
      { x: event.clientX, y: event.clientY },
      rect,
      this.app.screen.width,
      this.app.screen.height,
    );
  }
}
