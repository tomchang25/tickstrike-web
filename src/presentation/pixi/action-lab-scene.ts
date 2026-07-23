import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import battoBaseUrl from "@content/characters/assets/ninja/batto/ninja-batto-base.png";
import slashEndUrl from "@content/characters/assets/ninja/batto/ninja-slash-end.png";
import katanaSlashUrl from "@content/characters/assets/ninja/batto/katana-slash.png";
import katanaBattoStartUrl from "@content/characters/assets/ninja/batto/katana-batto-start.png";
import katanaBattoEndUrl from "@content/characters/assets/ninja/batto/katana-batto-end.png";
import ninjaBodyUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import type {
  ActionDirection,
  ActionPresentation,
  ActionStateKey,
  ActionStatePresentation,
} from "@presentation/actions/action-presentation-catalog";
import { createEntityShadow } from "./entity-shadow";
import { resolveEntityPresentationProfile } from "./entity-presentation-profiles";

// Dev-only Action/Sequence Lab scene (/debug/action). Two modes:
//   - Play: runs the data-described state machine (prepare -> execute -> end) either auto-looping
//     all four facings or aimed with the pointer.
//   - Inspect: freezes one (state, direction) pose static so its body/weapon offset can be
//     calibrated without any tween running.
// The weapon layer follows the reference `TickPlayerVisualPresenter` model: a DIRECTIONAL sprite
// (column = cardinal facing) stacked above the body at body scale, positioned by tunable per-
// direction offset data — never rotated, never placed on the target cell. Asset binding (sheet key
// -> texture + frame size) lives here; every position/timing number comes from the action catalog.

const CELL = 64;
const BOARD_COLS = 5;
const BOARD_ROWS = 5;
const BOARD_SCALE = 2;
const LABEL_BAND = 44;
const PREVIEW_WIDTH = BOARD_COLS * CELL * BOARD_SCALE;
const PREVIEW_HEIGHT = BOARD_ROWS * CELL * BOARD_SCALE + LABEL_BAND;

const DIRECTION_COLUMN: Record<ActionDirection, number> = { down: 0, up: 1, left: 2, right: 3 };
const DIRECTION_VECTOR: Record<ActionDirection, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const AUTO_SEQUENCE: readonly ActionDirection[] = ["right", "down", "left", "up"];

/** Sheet key -> imported texture URL and per-sheet frame size. Extend when adding new actions. */
const SHEET_REGISTRY: Readonly<Record<string, { readonly url: string; readonly frame: number }>> = {
  body: { url: ninjaBodyUrl, frame: 16 },
  battoBase: { url: battoBaseUrl, frame: 16 },
  slashEnd: { url: slashEndUrl, frame: 16 },
  katanaSlash: { url: katanaSlashUrl, frame: 64 },
  katanaBattoStart: { url: katanaBattoStartUrl, frame: 64 },
  katanaBattoEnd: { url: katanaBattoEndUrl, frame: 64 },
};

export interface ActionLabInspect {
  readonly stateKey: ActionStateKey;
  readonly direction: ActionDirection;
}

export interface ActionLabConfig {
  readonly action: ActionPresentation;
  readonly inspect: ActionLabInspect | null;
  readonly autoLoop: boolean;
  readonly altMode: boolean;
  readonly showWeapon: boolean;
}

export interface ActionLabScene {
  update(config: ActionLabConfig): void;
  destroy(): void;
}

interface Cell {
  readonly col: number;
  readonly row: number;
}

function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.col * CELL + CELL / 2, y: cell.row * CELL + CELL / 2 };
}

function cardinalFacing(from: Cell, to: Cell): ActionDirection {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }
  return dy < 0 ? "up" : "down";
}

export async function mountActionLabScene(host: HTMLElement, initial: ActionLabConfig): Promise<ActionLabScene> {
  const app = new Application();
  await app.init({ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, antialias: false, backgroundAlpha: 0 });
  app.canvas.setAttribute("data-testid", "action-lab-canvas");
  app.canvas.style.width = "100%";
  app.canvas.style.height = "auto";
  app.canvas.style.imageRendering = "pixelated";
  host.appendChild(app.canvas);

  const sheets = new Map<string, { source: Texture; frame: number }>();
  await Promise.all(
    Object.entries(SHEET_REGISTRY).map(async ([key, { url, frame }]) => {
      const texture = await Assets.load<Texture>(url);
      texture.source.scaleMode = "nearest";
      sheets.set(key, { source: texture, frame });
    }),
  );

  const frameTexture = (sheetKey: string, col: number, row: number): Texture => {
    const sheet = sheets.get(sheetKey);
    if (!sheet) {
      throw new Error(`Action Lab has no sheet "${sheetKey}".`);
    }
    return new Texture({
      source: sheet.source.source,
      frame: new Rectangle(col * sheet.frame, row * sheet.frame, sheet.frame, sheet.frame),
    });
  };
  const bodyTexture = (sheetKey: string, dir: ActionDirection, row: number): Texture =>
    frameTexture(sheetKey, DIRECTION_COLUMN[dir], row);
  const weaponTexture = (sheetKey: string, dir: ActionDirection): Texture =>
    frameTexture(sheetKey, DIRECTION_COLUMN[dir], 0);

  let config = initial;
  const profile = resolveEntityPresentationProfile(config.action.profileId);
  const bodyScale = profile.bodyScale;
  const NINJA_FRAME = SHEET_REGISTRY.body?.frame ?? 16;

  // --- Static board -------------------------------------------------------------------------
  const board = new Container();
  board.position.set(0, LABEL_BAND);
  board.scale.set(BOARD_SCALE);
  app.stage.addChild(board);

  const grid = new Graphics();
  for (let col = 0; col < BOARD_COLS; col += 1) {
    for (let row = 0; row < BOARD_ROWS; row += 1) {
      grid.rect(col * CELL, row * CELL, CELL, CELL).fill(0x171b26);
    }
  }
  for (let col = 0; col <= BOARD_COLS; col += 1) {
    grid.moveTo(col * CELL, 0).lineTo(col * CELL, BOARD_ROWS * CELL);
  }
  for (let row = 0; row <= BOARD_ROWS; row += 1) {
    grid.moveTo(0, row * CELL).lineTo(BOARD_COLS * CELL, row * CELL);
  }
  grid.stroke({ color: 0x2b3346, width: 1, alpha: 0.9 });
  board.addChild(grid);

  const cursorHighlight = new Graphics()
    .rect(1, 1, CELL - 2, CELL - 2)
    .stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  board.addChild(cursorHighlight);

  const ghostLayer = new Container();
  board.addChild(ghostLayer);

  // --- Actor rig (shadow + body + directional weapon) ---------------------------------------
  const rig = new Container();
  const shadow = createEntityShadow(profile.shadow);
  const body = new Sprite(bodyTexture(config.action.idle.bodySheet, "right", config.action.idle.bodyRow));
  body.anchor.set(profile.bodyFoot.x / NINJA_FRAME, profile.bodyFoot.y / NINJA_FRAME);
  body.scale.set(bodyScale);
  const weapon = new Sprite();
  weapon.anchor.set(0.5, 0.5);
  weapon.scale.set(bodyScale);
  weapon.visible = false;
  rig.addChild(shadow, body, weapon);
  board.addChild(rig);

  const label = new Text({
    text: "",
    style: { fontFamily: "monospace", fontSize: 18, fill: 0xcfe3ff, fontWeight: "600" },
  });
  label.position.set(12, 12);
  app.stage.addChild(label);

  // --- State --------------------------------------------------------------------------------
  const centerCell: Cell = { col: 2, row: 2 };
  let actorCell: Cell = { ...centerCell };
  let cursorCell: Cell = { col: 3, row: 2 };
  let facing: ActionDirection = "right";
  let phase: ActionStateKey = "idle";
  let breathingTween: gsap.core.Tween | undefined;
  let autoCall: gsap.core.Tween | undefined;
  let ghostTimer = 0;

  const executeDuration = (): number => config.action.execute.motion?.durationSec ?? 0.16;
  const placeRigAtCell = (cell: Cell): void => {
    const { x, y } = cellCenter(cell);
    rig.position.set(x, y + profile.groundY);
  };

  const applyBody = (state: ActionStatePresentation, dir: ActionDirection): void => {
    body.texture = bodyTexture(state.bodySheet, dir, state.bodyRow);
    const offset = state.bodyOffset[dir];
    body.position.set(offset.x, offset.y);
  };

  const applyWeapon = (state: ActionStatePresentation, dir: ActionDirection): void => {
    if (!state.weapon || !config.showWeapon) {
      weapon.visible = false;
      return;
    }
    weapon.texture = weaponTexture(state.weapon.sheet, dir);
    const offset = state.weapon.offset[dir];
    weapon.position.set(offset.x, offset.y);
    weapon.visible = true;
    weapon.alpha = 1;
  };

  const stopBreathing = (): void => {
    breathingTween?.kill();
    breathingTween = undefined;
    body.scale.set(bodyScale);
  };

  const startBreathing = (): void => {
    stopBreathing();
    const breathing = config.action.prepare.breathing;
    body.scale.set(bodyScale);
    if (!breathing) {
      return;
    }
    breathingTween = gsap.to(body.scale, {
      x: bodyScale * (1 + breathing.amplitudeX),
      y: bodyScale * (1 + breathing.amplitudeY),
      duration: Math.max(0.05, breathing.periodSec / 2),
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  };

  const showLabel = (): void => {
    const mode = config.inspect ? "INSPECT" : config.autoLoop ? "AUTO" : config.altMode ? "ALT" : "—";
    label.text = `[${mode}]  ${config.action.label}  ·  state: ${phase.toUpperCase()}  ·  facing: ${facing}`;
  };

  const setCursor = (cell: Cell): void => {
    cursorCell = cell;
    const { x, y } = cellCenter(cell);
    cursorHighlight.position.set(x - CELL / 2, y - CELL / 2);
  };

  const setFacingFromCursor = (): void => {
    if (cursorCell.col === actorCell.col && cursorCell.row === actorCell.row) {
      return;
    }
    facing = cardinalFacing(actorCell, cursorCell);
  };

  const goIdle = (): void => {
    stopBreathing();
    phase = "idle";
    applyBody(config.action.idle, facing);
    weapon.visible = false;
    showLabel();
  };

  const goPrepare = (): void => {
    phase = "prepare";
    applyBody(config.action.prepare, facing);
    applyWeapon(config.action.prepare, facing);
    startBreathing();
    showLabel();
  };

  const goEnd = (): void => {
    phase = "end";
    applyBody(config.action.end, facing);
    applyWeapon(config.action.end, facing);
    showLabel();
  };

  const spawnGhost = (): void => {
    const afterimage = config.action.execute.afterimage;
    if (!afterimage?.enabled) {
      return;
    }
    const bodyGhost = new Sprite(body.texture);
    bodyGhost.anchor.set(body.anchor.x, body.anchor.y);
    bodyGhost.scale.set(bodyScale);
    bodyGhost.position.set(rig.position.x + body.position.x, rig.position.y + body.position.y);
    bodyGhost.tint = afterimage.tint;
    bodyGhost.alpha = 0.5;
    ghostLayer.addChild(bodyGhost);
    const fade = [bodyGhost];
    if (weapon.visible) {
      const weaponGhost = new Sprite(weapon.texture);
      weaponGhost.anchor.set(0.5, 0.5);
      weaponGhost.scale.set(bodyScale);
      weaponGhost.position.set(rig.position.x + weapon.position.x, rig.position.y + weapon.position.y);
      weaponGhost.tint = afterimage.tint;
      weaponGhost.alpha = 0.55;
      ghostLayer.addChild(weaponGhost);
      fade.push(weaponGhost);
    }
    for (const ghost of fade) {
      gsap.to(ghost, { alpha: 0, duration: afterimage.fadeSec, ease: "power1.out", onComplete: () => ghost.destroy() });
    }
  };

  const triggerExecute = (target: Cell): void => {
    if (phase === "execute") {
      return;
    }
    if (target.col === actorCell.col && target.row === actorCell.row) {
      return;
    }
    stopBreathing();
    facing = cardinalFacing(actorCell, target);
    phase = "execute";
    const state = config.action.execute;
    applyBody(state, facing);
    body.scale.set(bodyScale);
    applyWeapon(state, facing);
    showLabel();

    const destination = cellCenter(target);
    const afterimage = state.afterimage;
    ghostTimer = 0;
    gsap.to(rig.position, {
      x: destination.x,
      y: destination.y + profile.groundY,
      duration: executeDuration(),
      ease: state.motion?.ease ?? "power2.in",
      onUpdate: () => {
        if (!afterimage?.enabled) {
          return;
        }
        ghostTimer += app.ticker.deltaMS;
        if (ghostTimer >= afterimage.intervalMs) {
          ghostTimer = 0;
          spawnGhost();
        }
      },
      onComplete: () => {
        actorCell = { ...target };
        goEnd();
      },
    });
  };

  // --- Auto loop ----------------------------------------------------------------------------
  let autoStep = 0;
  const runAuto = (): void => {
    if (!config.autoLoop) {
      return;
    }
    const direction = AUTO_SEQUENCE[autoStep % AUTO_SEQUENCE.length] ?? "right";
    autoStep += 1;
    actorCell = { ...centerCell };
    placeRigAtCell(actorCell);
    const vector = DIRECTION_VECTOR[direction];
    const target: Cell = { col: centerCell.col + vector.x * 2, row: centerCell.row + vector.y * 2 };
    facing = direction;
    setCursor(target);
    goPrepare();
    autoCall = gsap.delayedCall(1.15, () => {
      if (!config.autoLoop) {
        return;
      }
      triggerExecute(target);
      autoCall = gsap.delayedCall(executeDuration() + 1.35, runAuto);
    });
  };

  const stopAuto = (): void => {
    autoCall?.kill();
    autoCall = undefined;
  };

  // --- Inspect (freeze one state + direction static) ----------------------------------------
  const renderInspect = (inspect: ActionLabInspect): void => {
    stopAuto();
    stopBreathing();
    gsap.killTweensOf(rig.position);
    cursorHighlight.visible = false;
    actorCell = { ...centerCell };
    placeRigAtCell(actorCell);
    facing = inspect.direction;
    phase = inspect.stateKey;
    const state = config.action[inspect.stateKey];
    body.scale.set(bodyScale);
    applyBody(state, inspect.direction);
    applyWeapon(state, inspect.direction);
    showLabel();
  };

  // --- Pointer interaction (play mode only) -------------------------------------------------
  board.eventMode = "static";
  board.hitArea = new Rectangle(0, 0, BOARD_COLS * CELL, BOARD_ROWS * CELL);
  const cellFromEvent = (globalX: number, globalY: number): Cell | undefined => {
    const local = board.toLocal({ x: globalX, y: globalY });
    const col = Math.floor(local.x / CELL);
    const row = Math.floor(local.y / CELL);
    if (col < 0 || row < 0 || col >= BOARD_COLS || row >= BOARD_ROWS) {
      return undefined;
    }
    return { col, row };
  };
  board.on("pointermove", (event) => {
    if (config.inspect || config.autoLoop) {
      return;
    }
    const cell = cellFromEvent(event.global.x, event.global.y);
    if (!cell) {
      return;
    }
    const changed = cell.col !== cursorCell.col || cell.row !== cursorCell.row;
    setCursor(cell);
    setFacingFromCursor();
    if (phase === "end" && changed) {
      goIdle();
      if (config.altMode) {
        goPrepare();
      }
    } else if (phase === "prepare") {
      goPrepare();
    } else if (phase === "idle") {
      applyBody(config.action.idle, facing);
    }
    showLabel();
  });
  board.on("pointertap", (event) => {
    if (config.inspect || config.autoLoop) {
      return;
    }
    const cell = cellFromEvent(event.global.x, event.global.y);
    if (!cell) {
      return;
    }
    setCursor(cell);
    if (config.altMode) {
      triggerExecute(cell);
    } else {
      setFacingFromCursor();
      goIdle();
    }
  });

  // --- Config-driven updates (live tuning) --------------------------------------------------
  const update = (next: ActionLabConfig): void => {
    const prev = config;
    config = next;

    if (next.inspect) {
      renderInspect(next.inspect);
      return;
    }

    cursorHighlight.visible = true;

    if (next.autoLoop) {
      if (!prev.autoLoop || prev.inspect) {
        stopAuto();
        autoStep = 0;
        runAuto();
      } else if (phase === "prepare") {
        goPrepare();
      } else if (phase === "end") {
        goEnd();
      }
      showLabel();
      return;
    }

    // Manual (auto off, not inspecting).
    if (prev.autoLoop || prev.inspect) {
      stopAuto();
      actorCell = { ...centerCell };
      placeRigAtCell(actorCell);
      goIdle();
    }
    if (next.altMode && phase === "idle") {
      goPrepare();
    } else if (!next.altMode && phase === "prepare") {
      goIdle();
    } else if (phase === "prepare") {
      goPrepare();
    } else if (phase === "end") {
      goEnd();
    } else {
      goIdle();
    }
    showLabel();
  };

  placeRigAtCell(actorCell);
  setCursor(cursorCell);
  if (config.inspect) {
    renderInspect(config.inspect);
  } else if (config.autoLoop) {
    runAuto();
    showLabel();
  } else {
    goIdle();
  }

  return {
    update,
    destroy() {
      stopAuto();
      stopBreathing();
      gsap.killTweensOf(rig.position);
      app.destroy(true, { children: true });
    },
  };
}
