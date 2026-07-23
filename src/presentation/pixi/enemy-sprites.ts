import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { Cell, EntityState } from "@core/model/types";
import { enemyPresentationProfiles, type EnemyPresentationProfile } from "@content/enemies/features";
import { ENTITY_FRAME_SIZE, createEntityPresentationRig, type EntityPresentationRig } from "./entity-presentation-rig";
import { resolveEntityPresentationProfile, type EntityPresentationProfile } from "./entity-presentation-profiles";
import { createFramePlaybackTimeline } from "../timelines/frame-playback";

export type EnemySpritePose = "idle" | "move" | "prepareAttack" | "commitCue";
export type EnemySpritePalette = string;
export type EnemySpriteSheetKey = string;

export type { EnemyPresentationProfile } from "@content/enemies/features";

export interface EnemyWaterAnimation {
  readonly sheet: Texture;
  readonly frameDurationsMs: readonly number[];
}

export interface EnemyActionAnimation {
  readonly sheet: Texture;
  readonly frameDurationsMs: readonly number[];
  readonly loop: boolean;
}

export interface EnemyActionAnimations {
  readonly prepare: EnemyActionAnimation;
  readonly execute: EnemyActionAnimation;
}

export interface EnemyBodyAnimationFrame {
  readonly row: number;
  readonly holdSec: number;
}

export interface EnemyPresentation {
  readonly profileId: string;
  readonly palette: EnemySpritePalette;
  readonly root: Container;
  readonly rig: EntityPresentationRig;
  readonly body: Sprite;
  readonly pose: EnemySpritePose;
  readonly facing: Cell;
  readonly waterFrame: number | undefined;
  readonly waterFrameDurationsMs: readonly number[];
  readonly bodyAnimation: "prepare" | "execute" | "preview" | undefined;
  readonly bodyAnimationRow: number | undefined;
  readonly hasPrepareAnimation: boolean;
  readonly hasExecuteAnimation: boolean;
  setFacing(facing: Cell): void;
  setPose(pose: EnemySpritePose): void;
  sync(entity: Pick<EntityState, "activity" | "facing" | "phase">): void;
  playMove(): gsap.core.Timeline;
  playPrepareAttack(): gsap.core.Timeline | undefined;
  playAttackCommit(): gsap.core.Timeline;
  playBodyAnimation(sheet: Texture, frames: readonly EnemyBodyAnimationFrame[], loop: boolean): gsap.core.Timeline;
  playDamage(): gsap.core.Timeline;
  playStaggered(): gsap.core.Timeline | undefined;
  playStaggerEnded(): gsap.core.Timeline | undefined;
  beginEnteredWater(entryDirection: Cell): void;
  setEnteredWaterFrame(frame: number): void;
  /** Starts (or replaces) an independent alpha blink loop, separate from the damage tint channel. */
  playFuseBlink(intervalSeconds: number, minAlpha: number): gsap.core.Timeline;
  stopBlink(): void;
  clearAction(): void;
  reset(): void;
}

const DEFAULT_FACING: Cell = { x: 0, y: 1 };
const BASE_TINT = 0xffffff;
const DAMAGE_TINT = 0xcc3333;
const STAGGER_TINT = 0x4d80ff;
const PREPARE_SCALE = { x: 1.12, y: 0.84 };
const COMMIT_SCALE = { x: 1.2, y: 0.78 };

export function getEnemyPresentationProfile(profileId: string): EnemyPresentationProfile | undefined {
  return enemyPresentationProfiles.get(profileId);
}

const DIRECTION_COLUMNS = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
} as const;

const POSE_ROWS: Record<EnemySpritePose, number> = {
  idle: 0,
  move: 1,
  prepareAttack: 2,
  commitCue: 3,
};

function isCardinal(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y) && Math.abs(cell.x) + Math.abs(cell.y) === 1;
}

function directionColumn(direction: Cell): number {
  if (direction.y > 0) {
    return DIRECTION_COLUMNS.down;
  }
  if (direction.y < 0) {
    return DIRECTION_COLUMNS.up;
  }
  if (direction.x < 0) {
    return DIRECTION_COLUMNS.left;
  }
  return DIRECTION_COLUMNS.right;
}

function frameTexture(sheet: Texture, column: number, row: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(column * ENTITY_FRAME_SIZE, row * ENTITY_FRAME_SIZE, ENTITY_FRAME_SIZE, ENTITY_FRAME_SIZE),
  });
}

function forwardFor(facing: Cell): Cell {
  return isCardinal(facing) ? facing : DEFAULT_FACING;
}

function sideRotation(facing: Cell, amount: number): number {
  if (facing.x < 0) {
    return -amount;
  }
  if (facing.x > 0) {
    return amount;
  }
  return 0;
}

class SmallEnemyPresentation implements EnemyPresentation {
  readonly root: Container;
  readonly rig: EntityPresentationRig;
  readonly body: Sprite;
  private currentFacing = { ...DEFAULT_FACING };
  private currentPose: EnemySpritePose = "idle";
  private currentWaterFrame: number | undefined;
  private isStaggered = false;
  private actionTimeline: gsap.core.Timeline | undefined;
  private tintTimeline: gsap.core.Timeline | undefined;
  private blinkTimeline: gsap.core.Timeline | undefined;
  private bodyAnimationFrameAt: ((column: number, row: number) => Texture) | undefined;
  private currentBodyAnimationRow: number | undefined;
  private bodyAnimationKind: "prepare" | "execute" | "preview" | undefined;
  private readonly layoutProfile: EntityPresentationProfile;

  constructor(
    readonly profileId: string,
    readonly palette: EnemySpritePalette,
    sheet: Texture,
    private readonly waterAnimation: EnemyWaterAnimation | undefined,
    private readonly actionAnimations: EnemyActionAnimations | undefined,
    private readonly onChange?: () => void,
  ) {
    sheet.source.scaleMode = "nearest";
    const frameAt = this.createFrameSelector(sheet);
    if (waterAnimation) {
      waterAnimation.sheet.source.scaleMode = "nearest";
      this.waterFrameAt = this.createFrameSelector(waterAnimation.sheet);
    }
    if (actionAnimations) {
      actionAnimations.prepare.sheet.source.scaleMode = "nearest";
      actionAnimations.execute.sheet.source.scaleMode = "nearest";
    }

    this.layoutProfile = resolveEntityPresentationProfile(profileId);
    this.rig = createEntityPresentationRig(this.layoutProfile);
    this.root = this.rig.root;
    this.body = new Sprite(frameAt(directionColumn(DEFAULT_FACING), POSE_ROWS.idle));
    this.body.anchor.set(
      this.layoutProfile.bodyFoot.x / ENTITY_FRAME_SIZE,
      this.layoutProfile.bodyFoot.y / ENTITY_FRAME_SIZE,
    );
    this.body.scale.set(this.layoutProfile.bodyScale);
    this.body.tint = BASE_TINT;
    this.root.label = profileId;
    this.rig.actorRoot.addChild(this.body);

    this.frameAt = frameAt;
  }

  private readonly frameAt: (column: number, row: number) => Texture;
  private readonly waterFrameAt: ((column: number, row: number) => Texture) | undefined;

  get pose(): EnemySpritePose {
    return this.currentPose;
  }

  get facing(): Cell {
    return { ...this.currentFacing };
  }

  get waterFrame(): number | undefined {
    return this.currentWaterFrame;
  }

  get waterFrameDurationsMs(): readonly number[] {
    return this.waterAnimation?.frameDurationsMs ?? [];
  }

  get bodyAnimation(): "prepare" | "execute" | "preview" | undefined {
    return this.bodyAnimationKind;
  }

  get bodyAnimationRow(): number | undefined {
    return this.currentBodyAnimationRow;
  }

  get hasPrepareAnimation(): boolean {
    return Boolean(this.actionAnimations?.prepare);
  }

  get hasExecuteAnimation(): boolean {
    return Boolean(this.actionAnimations?.execute);
  }

  setFacing(facing: Cell): void {
    const direction = isCardinal(facing) ? facing : DEFAULT_FACING;
    this.currentFacing = { x: direction.x, y: direction.y };
    this.applyFrame();
  }

  sync(entity: Pick<EntityState, "activity" | "facing" | "phase">): void {
    const telegraphing = entity.phase === "alive" && entity.activity === "telegraphing";
    const keepPrepareLoop = telegraphing && this.bodyAnimationKind === "prepare";
    if (!keepPrepareLoop) {
      this.actionTimeline?.kill();
      this.actionTimeline = undefined;
      this.bodyAnimationFrameAt = undefined;
      this.currentBodyAnimationRow = undefined;
      this.bodyAnimationKind = undefined;
    }
    this.root.position.set(0, 0);
    this.rig.actorRoot.rotation = 0;
    this.setFacing(entity.facing ?? DEFAULT_FACING);

    if (telegraphing && this.actionAnimations?.prepare) {
      if (!keepPrepareLoop) {
        this.startBodyAnimation("prepare", this.actionAnimations.prepare);
      }
      this.rig.actorRoot.scale.set(1, 1);
    } else if (telegraphing) {
      this.setPose("prepareAttack");
      this.rig.actorRoot.scale.set(PREPARE_SCALE.x, PREPARE_SCALE.y);
    } else {
      this.setPose("idle");
      this.rig.actorRoot.scale.set(1, 1);
    }

    this.isStaggered = entity.phase === "alive" && entity.activity === "staggered";
    if (!this.tintTimeline?.isActive()) {
      this.body.tint = this.isStaggered ? STAGGER_TINT : BASE_TINT;
    }
  }

  playMove(): gsap.core.Timeline {
    const timeline = this.startAction("move");
    const forward = forwardFor(this.currentFacing);
    this.root.position.set(-forward.x * 2, -forward.y * 2);
    this.rig.actorRoot.rotation = sideRotation(this.currentFacing, 0.08);
    this.rig.actorRoot.scale.set(1.05, 0.95);
    timeline.to(
      this.root.position,
      {
        x: forward.x * 7,
        y: forward.y * 7,
        duration: 0.08,
        ease: "power2.out",
      },
      0,
    );
    timeline.to(
      this.rig.actorRoot.scale,
      {
        x: 1,
        y: 1,
        duration: 0.1,
        ease: "power2.out",
      },
      0,
    );
    timeline.to(this.rig.actorRoot, { rotation: 0, duration: 0.1, ease: "power2.out" }, 0);
    timeline.call(() => {
      this.root.position.set(0, 0);
      this.setPose("idle");
      if (this.actionTimeline === timeline) {
        this.actionTimeline = undefined;
      }
    });
    return timeline;
  }

  playPrepareAttack(): gsap.core.Timeline | undefined {
    if (this.actionAnimations?.prepare) {
      return undefined;
    }
    const timeline = this.startAction("prepareAttack");
    timeline.to(this.rig.actorRoot.scale, {
      x: PREPARE_SCALE.x,
      y: PREPARE_SCALE.y,
      duration: 0.12,
      ease: "back.out",
    });
    return timeline;
  }

  playAttackCommit(): gsap.core.Timeline {
    if (this.actionAnimations?.execute) {
      return this.startBodyAnimation("execute", this.actionAnimations.execute);
    }
    const timeline = this.startAction("commitCue");
    this.rig.actorRoot.scale.set(PREPARE_SCALE.x, PREPARE_SCALE.y);
    timeline.to(this.rig.actorRoot.scale, {
      x: COMMIT_SCALE.x,
      y: COMMIT_SCALE.y,
      duration: 0.06,
      ease: "power2.out",
    });
    timeline.to(this.rig.actorRoot.scale, {
      x: 1,
      y: 1,
      duration: 0.09,
      ease: "power2.out",
    });
    timeline.call(() => {
      this.setPose("idle");
      if (this.actionTimeline === timeline) {
        this.actionTimeline = undefined;
      }
    });
    return timeline;
  }

  playBodyAnimation(sheet: Texture, frames: readonly EnemyBodyAnimationFrame[], loop: boolean): gsap.core.Timeline {
    if (frames.length === 0) {
      throw new Error(`Body animation for ${this.profileId} must contain at least one frame.`);
    }
    return this.startBodyAnimation("preview", {
      sheet,
      frameDurationsMs: frames.map((frame) => frame.holdSec * 1000),
      loop,
    });
  }

  playDamage(): gsap.core.Timeline {
    this.tintTimeline?.kill();
    const timeline = gsap.timeline();
    this.tintTimeline = timeline;
    timeline.to(this.body, { tint: BASE_TINT, duration: 0.03 });
    timeline.to(this.body, { tint: DAMAGE_TINT, duration: 0.06 });
    timeline.to(this.body, { tint: BASE_TINT, duration: 0.08 });
    timeline.call(() => {
      this.body.tint = this.isStaggered ? STAGGER_TINT : BASE_TINT;
      if (this.tintTimeline === timeline) {
        this.tintTimeline = undefined;
      }
    });
    return timeline;
  }

  playStaggered(): gsap.core.Timeline | undefined {
    this.isStaggered = true;
    this.clearAction();
    if (this.tintTimeline?.isActive()) {
      return undefined;
    }
    this.tintTimeline?.kill();
    const timeline = gsap.timeline();
    this.tintTimeline = timeline;
    timeline.to(this.body, { tint: STAGGER_TINT, duration: 0.2 });
    timeline.call(() => {
      this.body.tint = STAGGER_TINT;
      if (this.tintTimeline === timeline) {
        this.tintTimeline = undefined;
      }
    });
    return timeline;
  }

  playStaggerEnded(): gsap.core.Timeline | undefined {
    this.isStaggered = false;
    if (this.tintTimeline?.isActive()) {
      return undefined;
    }
    this.tintTimeline?.kill();
    const timeline = gsap.timeline();
    this.tintTimeline = timeline;
    timeline.to(this.body, { tint: BASE_TINT, duration: 0.3 });
    timeline.call(() => {
      this.body.tint = BASE_TINT;
      if (this.tintTimeline === timeline) {
        this.tintTimeline = undefined;
      }
    });
    return timeline;
  }

  beginEnteredWater(entryDirection: Cell): void {
    this.clearAction();
    this.currentFacing = forwardFor(entryDirection);
    this.setEnteredWaterFrame(0);
  }

  playFuseBlink(intervalSeconds: number, minAlpha: number): gsap.core.Timeline {
    this.blinkTimeline?.kill();
    const timeline = gsap.timeline({ repeat: -1, yoyo: true });
    this.blinkTimeline = timeline;
    timeline.to(this.body, { alpha: minAlpha, duration: intervalSeconds, ease: "sine.inOut" });
    return timeline;
  }

  stopBlink(): void {
    this.blinkTimeline?.kill();
    this.blinkTimeline = undefined;
    this.body.alpha = 1;
  }

  clearAction(): void {
    this.actionTimeline?.kill();
    this.actionTimeline = undefined;
    this.bodyAnimationFrameAt = undefined;
    this.currentBodyAnimationRow = undefined;
    this.bodyAnimationKind = undefined;
    this.stopBlink();
    this.root.position.set(0, 0);
    this.rig.actorRoot.rotation = 0;
    this.rig.actorRoot.scale.set(1, 1);
    this.setPose("idle");
  }

  reset(): void {
    this.clearAction();
    this.tintTimeline?.kill();
    this.tintTimeline = undefined;
    this.isStaggered = false;
    this.body.tint = BASE_TINT;
    this.currentWaterFrame = undefined;
    this.setFacing(DEFAULT_FACING);
  }

  private startAction(pose: EnemySpritePose): gsap.core.Timeline {
    this.clearAction();
    this.setPose(pose);
    const timeline = gsap.timeline();
    this.actionTimeline = timeline;
    return timeline;
  }

  private startBodyAnimation(
    kind: "prepare" | "execute" | "preview",
    animation: EnemyActionAnimation,
  ): gsap.core.Timeline {
    this.clearAction();
    this.bodyAnimationKind = kind;
    this.bodyAnimationFrameAt = this.createFrameSelector(animation.sheet);
    const frames = animation.frameDurationsMs.map((durationMs, row) => ({ row, holdSec: durationMs / 1000 }));
    const timeline = createFramePlaybackTimeline(
      frames,
      ({ row }) => {
        this.currentBodyAnimationRow = row;
        this.applyFrame();
        this.onChange?.();
      },
      animation.loop,
    );
    this.actionTimeline = timeline;
    if (!animation.loop) {
      timeline.call(() => {
        if (this.actionTimeline === timeline) {
          this.actionTimeline = undefined;
          this.bodyAnimationFrameAt = undefined;
          this.currentBodyAnimationRow = undefined;
          this.bodyAnimationKind = undefined;
          this.setPose("idle");
        }
      });
    }
    return timeline;
  }

  setPose(pose: EnemySpritePose): void {
    this.currentPose = pose;
    this.applyFrame();
    this.onChange?.();
  }

  private applyFrame(): void {
    const column = directionColumn(this.currentFacing);
    const inWater = this.currentWaterFrame !== undefined && this.waterFrameAt !== undefined;
    const inBodyAnimation = this.currentBodyAnimationRow !== undefined && this.bodyAnimationFrameAt !== undefined;
    this.rig.shadow.visible = !inWater;
    // Land frames are feet-anchored in the lower quarter; authored water frames
    // return to cell-centred alignment so the splash art stays on the waterline.
    this.body.anchor.set(
      this.layoutProfile.bodyFoot.x / ENTITY_FRAME_SIZE,
      inWater ? 0.5 : this.layoutProfile.bodyFoot.y / ENTITY_FRAME_SIZE,
    );
    this.rig.actorRoot.position.y = inWater ? -this.layoutProfile.groundY : 0;
    this.body.texture = inWater
      ? this.waterFrameAt!(column, this.currentWaterFrame!)
      : inBodyAnimation
        ? this.bodyAnimationFrameAt!(column, this.currentBodyAnimationRow!)
        : this.frameAt(column, POSE_ROWS[this.currentPose]);
  }

  setEnteredWaterFrame(frame: number): void {
    if (!this.waterAnimation) {
      throw new Error(`No water animation authored for profile ${this.profileId}.`);
    }
    if (frame < 0 || frame >= this.waterAnimation.frameDurationsMs.length) {
      throw new Error(`Water animation frame ${frame} is outside the authored sheet.`);
    }
    this.currentWaterFrame = frame;
    this.applyFrame();
    this.onChange?.();
  }

  private createFrameSelector(sheet: Texture): (column: number, row: number) => Texture {
    const frames = new Map<string, Texture>();
    return (column: number, row: number): Texture => {
      const key = `${column},${row}`;
      const existing = frames.get(key);
      if (existing) {
        return existing;
      }
      const frame = frameTexture(sheet, column, row);
      frames.set(key, frame);
      return frame;
    };
  }
}

export function createEnemyPresentation(
  profileId: string,
  sheet: Texture,
  waterAnimation: EnemyWaterAnimation | undefined,
  actionAnimations?: EnemyActionAnimations,
  onChange?: () => void,
): EnemyPresentation | undefined {
  const profile = getEnemyPresentationProfile(profileId);
  return profile
    ? new SmallEnemyPresentation(profile.id, profile.palette, sheet, waterAnimation, actionAnimations, onChange)
    : undefined;
}
