import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { Cell } from "@core/model/types";
import { ENTITY_FRAME_SIZE, createEntityPresentationRig, type EntityPresentationRig } from "./entity-presentation-rig";
import { resolveEntityPresentationProfile } from "./entity-presentation-profiles";

export type PlayerSpritePose = "idle" | "move" | "dash";

export interface PlayerSprite {
  readonly profileId: string;
  readonly root: Container;
  readonly rig: EntityPresentationRig;
  readonly body: Sprite;
  readonly facing: Cell;
  readonly pose: PlayerSpritePose;
  setFacing(facing: Cell): void;
  setPose(pose: PlayerSpritePose): void;
}

const NINJA_PROFILE_ID = "character.ninja";
const DEFAULT_FACING: Cell = { x: 1, y: 0 };
const BODY_IDLE_ROW = 0;
const BODY_MOVE_ROWS = [1, 2, 3, 2] as const;
const BODY_DASH_ROW = 1;
const BODY_DIRECTION_COLUMNS = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
} as const;

let ninjaSpriteSheet: Texture | undefined;

function isCardinal(cell: Cell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y) && Math.abs(cell.x) + Math.abs(cell.y) === 1;
}

function directionColumn(direction: Cell): number {
  if (direction.y > 0) {
    return BODY_DIRECTION_COLUMNS.down;
  }
  if (direction.y < 0) {
    return BODY_DIRECTION_COLUMNS.up;
  }
  if (direction.x < 0) {
    return BODY_DIRECTION_COLUMNS.left;
  }
  return BODY_DIRECTION_COLUMNS.right;
}

function frameTexture(sheet: Texture, column: number, row: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(column * ENTITY_FRAME_SIZE, row * ENTITY_FRAME_SIZE, ENTITY_FRAME_SIZE, ENTITY_FRAME_SIZE),
  });
}

function createNinjaSprite(sheet: Texture): PlayerSprite {
  const profile = resolveEntityPresentationProfile(NINJA_PROFILE_ID);
  const rig = createEntityPresentationRig(profile);
  const root = rig.root;
  root.label = NINJA_PROFILE_ID;
  let currentFacing = { ...DEFAULT_FACING };
  let currentPose: PlayerSpritePose = "idle";
  let moveFrameIndex = 0;
  let currentMoveRow: number = BODY_MOVE_ROWS[0] ?? BODY_IDLE_ROW;
  const frames = new Map<string, Texture>();
  sheet.source.scaleMode = "nearest";
  const frameAt = (column: number, row: number): Texture => {
    const key = `${column},${row}`;
    const existing = frames.get(key);
    if (existing) {
      return existing;
    }
    const frame = frameTexture(sheet, column, row);
    frames.set(key, frame);
    return frame;
  };

  const body = new Sprite(frameAt(directionColumn(DEFAULT_FACING), BODY_IDLE_ROW));
  body.anchor.set(profile.bodyFoot.x / ENTITY_FRAME_SIZE, profile.bodyFoot.y / ENTITY_FRAME_SIZE);
  body.scale.set(profile.bodyScale);

  rig.actorRoot.addChild(body);

  const setFacing = (facing: Cell): void => {
    const direction = isCardinal(facing) ? facing : DEFAULT_FACING;
    currentFacing = { x: direction.x, y: direction.y };
    const row = currentPose === "dash" ? BODY_DASH_ROW : currentPose === "move" ? currentMoveRow : BODY_IDLE_ROW;
    body.texture = frameAt(directionColumn(direction), row);
  };

  const setPose = (pose: PlayerSpritePose): void => {
    currentPose = pose;
    if (pose === "move") {
      currentMoveRow = BODY_MOVE_ROWS[moveFrameIndex++ % BODY_MOVE_ROWS.length] ?? BODY_IDLE_ROW;
    }
    const row = pose === "dash" ? BODY_DASH_ROW : pose === "move" ? currentMoveRow : BODY_IDLE_ROW;
    body.texture = frameAt(directionColumn(currentFacing), row);
  };

  setFacing(DEFAULT_FACING);
  setPose("idle");

  return {
    profileId: NINJA_PROFILE_ID,
    root,
    rig,
    body,
    get facing() {
      return { ...currentFacing };
    },
    get pose() {
      return currentPose;
    },
    setFacing,
    setPose,
  };
}

export function createPlayerSprite(
  profileId: string,
  sheet: Texture | undefined = ninjaSpriteSheet,
): PlayerSprite | undefined {
  if (profileId === NINJA_PROFILE_ID && sheet) {
    return createNinjaSprite(sheet);
  }
  return undefined;
}

export function setNinjaSpriteSheet(texture: Texture | undefined): void {
  ninjaSpriteSheet = texture;
}
