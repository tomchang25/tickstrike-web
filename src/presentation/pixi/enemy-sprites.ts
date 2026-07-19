import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { Cell, EntityState } from "../../core/model/types";

export type EnemySpritePose = "idle" | "move" | "prepareAttack" | "commitCue";
export type EnemySpritePalette = "green" | "purple" | "eye" | "skull";
export type EnemySpriteSheetKey = "green" | "purple" | "eye" | "skull";

export interface EnemyPresentationProfile {
  readonly id: string;
  readonly sheet: EnemySpriteSheetKey;
  readonly palette: EnemySpritePalette;
  readonly scale: number;
}

export interface EnemyPresentation {
  readonly profileId: string;
  readonly palette: EnemySpritePalette;
  readonly root: Container;
  readonly body: Sprite;
  readonly pose: EnemySpritePose;
  readonly facing: Cell;
  setFacing(facing: Cell): void;
  sync(entity: Pick<EntityState, "activity" | "facing" | "phase">): void;
  playMove(): gsap.core.Timeline;
  playPrepareAttack(): gsap.core.Timeline;
  playAttackCommit(): gsap.core.Timeline;
  playDamage(): gsap.core.Timeline;
  playStaggered(): gsap.core.Timeline | undefined;
  playStaggerEnded(): gsap.core.Timeline | undefined;
  clearAction(): void;
  reset(): void;
}

const FRAME_SIZE = 16;
const SPRITE_SCALE = 3.5;
const DEFAULT_FACING: Cell = { x: 0, y: 1 };
const BASE_TINT = 0xffffff;
const DAMAGE_TINT = 0xcc3333;
const STAGGER_TINT = 0x4d80ff;
const PREPARE_SCALE = { x: 1.12, y: 0.84 };
const COMMIT_SCALE = { x: 1.2, y: 0.78 };

const ENEMY_PRESENTATION_PROFILES: Readonly<Record<string, EnemyPresentationProfile>> = {
  "enemy.thrust": { id: "enemy.thrust", sheet: "green", palette: "green", scale: SPRITE_SCALE },
  "enemy.slash": { id: "enemy.slash", sheet: "purple", palette: "purple", scale: SPRITE_SCALE },
  "enemy.ranged": { id: "enemy.ranged", sheet: "eye", palette: "eye", scale: 5 },
  "enemy.charge": { id: "enemy.charge", sheet: "skull", palette: "skull", scale: SPRITE_SCALE },
};

export function getEnemyPresentationProfile(profileId: string): EnemyPresentationProfile | undefined {
  return ENEMY_PRESENTATION_PROFILES[profileId];
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
  if (direction.y > 0) return DIRECTION_COLUMNS.down;
  if (direction.y < 0) return DIRECTION_COLUMNS.up;
  if (direction.x < 0) return DIRECTION_COLUMNS.left;
  return DIRECTION_COLUMNS.right;
}

function frameTexture(sheet: Texture, column: number, row: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(column * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE),
  });
}

function forwardFor(facing: Cell): Cell {
  return isCardinal(facing) ? facing : DEFAULT_FACING;
}

function sideRotation(facing: Cell, amount: number): number {
  if (facing.x < 0) return -amount;
  if (facing.x > 0) return amount;
  return 0;
}

class SmallEnemyPresentation implements EnemyPresentation {
  readonly root = new Container();
  readonly body: Sprite;
  private currentFacing = { ...DEFAULT_FACING };
  private currentPose: EnemySpritePose = "idle";
  private isStaggered = false;
  private actionTimeline: gsap.core.Timeline | undefined;
  private tintTimeline: gsap.core.Timeline | undefined;

  constructor(
    readonly profileId: string,
    readonly palette: EnemySpritePalette,
    sheet: Texture,
    private readonly onChange?: () => void,
    private readonly spriteScale = SPRITE_SCALE,
  ) {
    sheet.source.scaleMode = "nearest";
    const frames = new Map<string, Texture>();
    const frameAt = (column: number, row: number): Texture => {
      const key = `${column},${row}`;
      const existing = frames.get(key);
      if (existing) return existing;
      const frame = frameTexture(sheet, column, row);
      frames.set(key, frame);
      return frame;
    };

    this.body = new Sprite(frameAt(directionColumn(DEFAULT_FACING), POSE_ROWS.idle));
    this.body.anchor.set(0.5);
    this.body.scale.set(this.spriteScale);
    this.body.tint = BASE_TINT;
    this.root.label = profileId;
    this.root.addChild(this.body);

    this.frameAt = frameAt;
  }

  private readonly frameAt: (column: number, row: number) => Texture;

  get pose(): EnemySpritePose {
    return this.currentPose;
  }

  get facing(): Cell {
    return { ...this.currentFacing };
  }

  setFacing(facing: Cell): void {
    const direction = isCardinal(facing) ? facing : DEFAULT_FACING;
    this.currentFacing = { x: direction.x, y: direction.y };
    this.applyFrame();
  }

  sync(entity: Pick<EntityState, "activity" | "facing" | "phase">): void {
    this.actionTimeline?.kill();
    this.actionTimeline = undefined;
    this.root.position.set(0, 0);
    this.root.rotation = 0;
    this.setFacing(entity.facing ?? DEFAULT_FACING);

    if (entity.phase === "alive" && entity.activity === "telegraphing") {
      this.setPose("prepareAttack");
      this.root.scale.set(PREPARE_SCALE.x, PREPARE_SCALE.y);
    } else {
      this.setPose("idle");
      this.root.scale.set(1, 1);
    }

    this.isStaggered = entity.phase === "alive" && entity.activity === "staggered";
    if (!this.tintTimeline?.isActive()) this.body.tint = this.isStaggered ? STAGGER_TINT : BASE_TINT;
  }

  playMove(): gsap.core.Timeline {
    const timeline = this.startAction("move");
    const forward = forwardFor(this.currentFacing);
    this.root.position.set(-forward.x * 2, -forward.y * 2);
    this.root.rotation = sideRotation(this.currentFacing, 0.08);
    this.root.scale.set(1.05, 0.95);
    timeline.to(this.root.position, {
      x: forward.x * 7,
      y: forward.y * 7,
      duration: 0.08,
      ease: "power2.out",
    }, 0);
    timeline.to(this.root.scale, {
      x: 1,
      y: 1,
      duration: 0.1,
      ease: "power2.out",
    }, 0);
    timeline.to(this.root, { rotation: 0, duration: 0.1, ease: "power2.out" }, 0);
    timeline.call(() => {
      this.root.position.set(0, 0);
      this.setPose("idle");
      if (this.actionTimeline === timeline) this.actionTimeline = undefined;
    });
    return timeline;
  }

  playPrepareAttack(): gsap.core.Timeline {
    const timeline = this.startAction("prepareAttack");
    timeline.to(this.root.scale, {
      x: PREPARE_SCALE.x,
      y: PREPARE_SCALE.y,
      duration: 0.12,
      ease: "back.out",
    });
    return timeline;
  }

  playAttackCommit(): gsap.core.Timeline {
    const timeline = this.startAction("commitCue");
    this.root.scale.set(PREPARE_SCALE.x, PREPARE_SCALE.y);
    timeline.to(this.root.scale, {
      x: COMMIT_SCALE.x,
      y: COMMIT_SCALE.y,
      duration: 0.06,
      ease: "power2.out",
    });
    timeline.to(this.root.scale, {
      x: 1,
      y: 1,
      duration: 0.09,
      ease: "power2.out",
    });
    timeline.call(() => {
      this.setPose("idle");
      if (this.actionTimeline === timeline) this.actionTimeline = undefined;
    });
    return timeline;
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
      if (this.tintTimeline === timeline) this.tintTimeline = undefined;
    });
    return timeline;
  }

  playStaggered(): gsap.core.Timeline | undefined {
    this.isStaggered = true;
    this.clearAction();
    if (this.tintTimeline?.isActive()) return undefined;
    this.tintTimeline?.kill();
    const timeline = gsap.timeline();
    this.tintTimeline = timeline;
    timeline.to(this.body, { tint: STAGGER_TINT, duration: 0.2 });
    timeline.call(() => {
      this.body.tint = STAGGER_TINT;
      if (this.tintTimeline === timeline) this.tintTimeline = undefined;
    });
    return timeline;
  }

  playStaggerEnded(): gsap.core.Timeline | undefined {
    this.isStaggered = false;
    if (this.tintTimeline?.isActive()) return undefined;
    this.tintTimeline?.kill();
    const timeline = gsap.timeline();
    this.tintTimeline = timeline;
    timeline.to(this.body, { tint: BASE_TINT, duration: 0.3 });
    timeline.call(() => {
      this.body.tint = BASE_TINT;
      if (this.tintTimeline === timeline) this.tintTimeline = undefined;
    });
    return timeline;
  }

  clearAction(): void {
    this.actionTimeline?.kill();
    this.actionTimeline = undefined;
    this.root.position.set(0, 0);
    this.root.rotation = 0;
    this.root.scale.set(1, 1);
    this.setPose("idle");
  }

  reset(): void {
    this.clearAction();
    this.tintTimeline?.kill();
    this.tintTimeline = undefined;
    this.isStaggered = false;
    this.body.tint = BASE_TINT;
    this.setFacing(DEFAULT_FACING);
  }

  private startAction(pose: EnemySpritePose): gsap.core.Timeline {
    this.clearAction();
    this.setPose(pose);
    const timeline = gsap.timeline();
    this.actionTimeline = timeline;
    return timeline;
  }

  private setPose(pose: EnemySpritePose): void {
    this.currentPose = pose;
    this.applyFrame();
    this.onChange?.();
  }

  private applyFrame(): void {
    this.body.texture = this.frameAt(directionColumn(this.currentFacing), POSE_ROWS[this.currentPose]);
  }
}

export function createEnemyPresentation(
  profileId: string,
  sheet: Texture,
  onChange?: () => void,
): EnemyPresentation | undefined {
  const profile = getEnemyPresentationProfile(profileId);
  return profile
    ? new SmallEnemyPresentation(profile.id, profile.palette, sheet, onChange, profile.scale)
    : undefined;
}
