import { Container, Rectangle, Sprite, Texture } from "pixi.js";
import { gsap } from "gsap";
import type { Cell } from "@core/model/types";
import {
  resolveActionPresentation,
  type ActionDirection,
  type ActionStatePresentation,
} from "@presentation/actions/action-presentation-catalog";
import { ENTITY_FRAME_SIZE, createEntityPresentationRig, type EntityPresentationRig } from "./entity-presentation-rig";
import { resolveEntityPresentationProfile } from "./entity-presentation-profiles";

// `prepare`/`dash`/`dashLand` drive the Ninja Batto presentation authored in the Action Lab
// (`ninja.batto_dash`): `prepare` is the Alt-hold draw stance, `dash` is the draw-cut executed
// during the Dash motion, and `dashLand` is the held finishing pose. The director settles a dash
// motion into `dashLand` (not `idle`); the weapon layer and per-direction offsets are pure
// presentation data, so no character-specific knowledge leaks into the hubs.
export type PlayerSpritePose = "idle" | "move" | "dash" | "dashLand" | "prepare" | "attack";

export interface PlayerSprite {
  readonly profileId: string;
  readonly root: Container;
  readonly rig: EntityPresentationRig;
  readonly body: Sprite;
  readonly facing: Cell;
  readonly pose: PlayerSpritePose;
  /** Dash afterimage cadence in ms from the action catalog; Infinity when afterimage is off. */
  readonly afterimageIntervalMs: number;
  setFacing(facing: Cell): void;
  setPose(pose: PlayerSpritePose): void;
  /**
   * Spawns one fading body+weapon afterimage clone into `layer` at the moving container's current
   * position `at` (the rig root's position in the Lab, the entity view's position in the runtime).
   * The clone reproduces the live body/weapon frame, offsets, scale, and the catalog tint/fade, so
   * both drivers share one afterimage appearance. The caller owns cadence (using `afterimageIntervalMs`).
   */
  spawnAfterimage(layer: Container, at: { readonly x: number; readonly y: number }): void;
}

const NINJA_PROFILE_ID = "character.ninja";
const NINJA_ACTION_ID = "ninja.batto_dash";
const WEAPON_FRAME_SIZE = 64;
const DEFAULT_FACING: Cell = { x: 1, y: 0 };
const BODY_IDLE_ROW = 0;
const BODY_MOVE_ROWS = [1, 2, 3, 2] as const;
const BODY_DASH_ROW = 1;
const BODY_ATTACK_ROW = 5;
const BODY_DIRECTION_COLUMNS = {
  down: 0,
  up: 1,
  left: 2,
  right: 3,
} as const;

/** Batto sheets injected by the renderer; absent in fixtures that only load the body sheet. */
export interface NinjaBattoSheets {
  readonly battoBase?: Texture;
  readonly slashEnd?: Texture;
  readonly katanaSlash?: Texture;
  readonly katanaBattoStart?: Texture;
  readonly katanaBattoEnd?: Texture;
}

let ninjaSpriteSheet: Texture | undefined;
let ninjaBattoSheets: NinjaBattoSheets = {};

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

function actionDirection(direction: Cell): ActionDirection {
  if (direction.y > 0) {
    return "down";
  }
  if (direction.y < 0) {
    return "up";
  }
  if (direction.x < 0) {
    return "left";
  }
  return "right";
}

function frameTexture(sheet: Texture, column: number, row: number, size: number): Texture {
  return new Texture({
    source: sheet.source,
    frame: new Rectangle(column * size, row * size, size, size),
  });
}

/** Resolves an action catalog sheet key to its texture and per-sheet frame size. */
function resolveSheet(sheetKey: string): { texture: Texture; frame: number } | undefined {
  if (sheetKey === "body") {
    return ninjaSpriteSheet ? { texture: ninjaSpriteSheet, frame: ENTITY_FRAME_SIZE } : undefined;
  }
  const bodyKeys: Record<string, Texture | undefined> = {
    battoBase: ninjaBattoSheets.battoBase,
    slashEnd: ninjaBattoSheets.slashEnd,
  };
  if (sheetKey in bodyKeys) {
    const texture = bodyKeys[sheetKey];
    return texture ? { texture, frame: ENTITY_FRAME_SIZE } : undefined;
  }
  const weaponKeys: Record<string, Texture | undefined> = {
    katanaSlash: ninjaBattoSheets.katanaSlash,
    katanaBattoStart: ninjaBattoSheets.katanaBattoStart,
    katanaBattoEnd: ninjaBattoSheets.katanaBattoEnd,
  };
  if (sheetKey in weaponKeys) {
    const texture = weaponKeys[sheetKey];
    return texture ? { texture, frame: WEAPON_FRAME_SIZE } : undefined;
  }
  return undefined;
}

function createNinjaSprite(sheet: Texture): PlayerSprite {
  const profile = resolveEntityPresentationProfile(NINJA_PROFILE_ID);
  // Resolve the action fresh on every render so a live catalog refresh (dev Action Lab Apply)
  // takes effect without recreating the sprite.
  const currentAction = () => resolveActionPresentation(NINJA_ACTION_ID);
  const rig = createEntityPresentationRig(profile);
  const root = rig.root;
  root.label = NINJA_PROFILE_ID;
  let currentFacing = { ...DEFAULT_FACING };
  let currentPose: PlayerSpritePose = "idle";
  let moveFrameIndex = 0;
  let currentMoveRow: number = BODY_MOVE_ROWS[0] ?? BODY_IDLE_ROW;
  let breathingTween: gsap.core.Tween | undefined;
  const frames = new Map<string, Texture>();
  sheet.source.scaleMode = "nearest";

  const bodyFrameFromSheet = (column: number, row: number): Texture => {
    const key = `body:${column},${row}`;
    const existing = frames.get(key);
    if (existing) {
      return existing;
    }
    const frame = frameTexture(sheet, column, row, ENTITY_FRAME_SIZE);
    frames.set(key, frame);
    return frame;
  };

  const sheetFrame = (sheetKey: string, column: number, row: number): Texture | undefined => {
    const resolved = resolveSheet(sheetKey);
    if (!resolved) {
      return undefined;
    }
    resolved.texture.source.scaleMode = "nearest";
    const key = `${sheetKey}:${column},${row}`;
    const existing = frames.get(key);
    if (existing) {
      return existing;
    }
    const frame = frameTexture(resolved.texture, column, row, resolved.frame);
    frames.set(key, frame);
    return frame;
  };

  const body = new Sprite(bodyFrameFromSheet(directionColumn(DEFAULT_FACING), BODY_IDLE_ROW));
  body.anchor.set(profile.bodyFoot.x / ENTITY_FRAME_SIZE, profile.bodyFoot.y / ENTITY_FRAME_SIZE);
  body.scale.set(profile.bodyScale);

  const weapon = new Sprite();
  weapon.anchor.set(0.5, 0.5);
  weapon.scale.set(profile.bodyScale);
  weapon.visible = false;

  rig.actorRoot.addChild(body, weapon);

  const stopBreathing = (): void => {
    breathingTween?.kill();
    breathingTween = undefined;
    body.scale.set(profile.bodyScale);
  };

  const startBreathing = (): void => {
    stopBreathing();
    const breathing = currentAction().prepare.breathing;
    if (!breathing) {
      return;
    }
    breathingTween = gsap.to(body.scale, {
      x: profile.bodyScale * (1 + breathing.amplitudeX),
      y: profile.bodyScale * (1 + breathing.amplitudeY),
      duration: Math.max(0.05, breathing.periodSec / 2),
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  };

  // Renders one authored batto state for the given facing. Returns false when the required batto
  // sheet is not injected so callers can fall back to the plain body-sheet pose.
  const applyBattoState = (state: ActionStatePresentation, direction: Cell): boolean => {
    const dir = actionDirection(direction);
    const column = BODY_DIRECTION_COLUMNS[dir];
    const bodyTexture = sheetFrame(state.bodySheet, column, state.bodyRow);
    if (!bodyTexture) {
      return false;
    }
    body.texture = bodyTexture;
    const bodyOffset = state.bodyOffset[dir];
    body.position.set(bodyOffset.x, bodyOffset.y);
    if (state.weapon) {
      const weaponTexture = sheetFrame(state.weapon.sheet, column, 0);
      if (weaponTexture) {
        weapon.texture = weaponTexture;
        const offset = state.weapon.offset[dir];
        weapon.position.set(offset.x, offset.y);
        weapon.visible = true;
        weapon.alpha = 1;
      } else {
        weapon.visible = false;
      }
    } else {
      weapon.visible = false;
    }
    return true;
  };

  const renderPose = (pose: PlayerSpritePose, direction: Cell): void => {
    const column = directionColumn(direction);
    if (pose !== "prepare") {
      stopBreathing();
    }
    const action = currentAction();
    switch (pose) {
      case "prepare":
        if (applyBattoState(action.prepare, direction)) {
          startBreathing();
          return;
        }
        break;
      case "dash":
        if (applyBattoState(action.execute, direction)) {
          return;
        }
        // Fallback: legacy body-sheet dash frame with no weapon.
        body.position.set(0, 0);
        weapon.visible = false;
        body.texture = bodyFrameFromSheet(column, BODY_DASH_ROW);
        return;
      case "dashLand":
        if (applyBattoState(action.end, direction)) {
          return;
        }
        break;
      case "move":
        body.position.set(0, 0);
        weapon.visible = false;
        body.texture = bodyFrameFromSheet(column, currentMoveRow);
        return;
      case "attack":
        // Normal-attack body pose; the batto weapon layer is dash-only, so no weapon here.
        body.position.set(0, 0);
        weapon.visible = false;
        body.texture = bodyFrameFromSheet(column, BODY_ATTACK_ROW);
        return;
      default:
        break;
    }
    // idle, or any batto pose whose sheet is unavailable.
    body.position.set(0, 0);
    weapon.visible = false;
    body.texture = bodyFrameFromSheet(column, BODY_IDLE_ROW);
  };

  const setFacing = (facing: Cell): void => {
    const direction = isCardinal(facing) ? facing : DEFAULT_FACING;
    currentFacing = { x: direction.x, y: direction.y };
    renderPose(currentPose, currentFacing);
  };

  const setPose = (pose: PlayerSpritePose): void => {
    if (pose === "move") {
      currentMoveRow = BODY_MOVE_ROWS[moveFrameIndex++ % BODY_MOVE_ROWS.length] ?? BODY_IDLE_ROW;
    }
    currentPose = pose;
    renderPose(pose, currentFacing);
  };

  // Clones the live body (and visible weapon) into `layer` at the moving container position `at`,
  // adding the rig's ground offset and each layer's authored offset so the trail matches on-screen.
  const spawnAfterimage = (layer: Container, at: { readonly x: number; readonly y: number }): void => {
    const afterimage = currentAction().execute.afterimage;
    if (!afterimage?.enabled) {
      return;
    }
    const groundY = profile.groundY;
    const ghosts: Sprite[] = [];
    const bodyGhost = new Sprite(body.texture);
    bodyGhost.anchor.set(body.anchor.x, body.anchor.y);
    bodyGhost.scale.set(body.scale.x, body.scale.y);
    bodyGhost.position.set(at.x + body.position.x, at.y + groundY + body.position.y);
    bodyGhost.tint = afterimage.tint;
    bodyGhost.alpha = 0.5;
    layer.addChild(bodyGhost);
    ghosts.push(bodyGhost);
    if (weapon.visible) {
      const weaponGhost = new Sprite(weapon.texture);
      weaponGhost.anchor.set(0.5, 0.5);
      weaponGhost.scale.set(weapon.scale.x, weapon.scale.y);
      weaponGhost.position.set(at.x + weapon.position.x, at.y + groundY + weapon.position.y);
      weaponGhost.tint = afterimage.tint;
      weaponGhost.alpha = 0.55;
      layer.addChild(weaponGhost);
      ghosts.push(weaponGhost);
    }
    for (const ghost of ghosts) {
      gsap.to(ghost, {
        alpha: 0,
        duration: afterimage.fadeSec,
        ease: "power1.out",
        onComplete: () => {
          if (!ghost.destroyed) {
            ghost.destroy();
          }
        },
      });
    }
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
    get afterimageIntervalMs() {
      return currentAction().execute.afterimage?.intervalMs ?? Number.POSITIVE_INFINITY;
    },
    setFacing,
    setPose,
    spawnAfterimage,
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

export function setNinjaBattoSheets(sheets: NinjaBattoSheets): void {
  ninjaBattoSheets = sheets;
}
