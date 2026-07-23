import { Application, Assets, Container, Graphics, Rectangle, Text, Texture } from "pixi.js";
import { gsap } from "gsap";
import battoBaseUrl from "@content/characters/assets/ninja/batto/ninja-batto-base.png";
import slashEndUrl from "@content/characters/assets/ninja/batto/ninja-slash-end.png";
import katanaSlashUrl from "@content/characters/assets/ninja/batto/katana-slash.png";
import katanaBattoStartUrl from "@content/characters/assets/ninja/batto/katana-batto-start.png";
import katanaBattoEndUrl from "@content/characters/assets/ninja/batto/katana-batto-end.png";
import ninjaBodyUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import ninjaAttackUrl from "@content/characters/assets/ninja/attack-sprite-sheet.png";
import {
  setRuntimeActionPresentationCatalog,
  type ActionDirection,
  type ActionPresentationCatalog,
  type ActionStateKey,
} from "@presentation/actions/action-presentation-catalog";
import { ACTION_LAB_PREVIEW_ACTIONS } from "@presentation/actions/action-lab-preview-actions";
import {
  createPlayerSprite,
  setNinjaBattoSheets,
  setNinjaSpriteSheet,
  type PlayerSprite,
  type PlayerSpritePose,
} from "./character-sprites";
import { createEnemyPresentation, type EnemyPresentation } from "./enemy-sprites";

// Dev-only Action/Sequence Lab scene (/debug/action). Catalog actions mount the real runtime
// `PlayerSprite`; preview-only enemy actions mount the real `EnemyPresentation` rig. The lab owns
// board chrome and sequencing, not a second sprite renderer (see dev/standards/dev_authoring_catalog.md).
//   - Play: runs the state machine (prepare -> execute -> end), auto-looping or aimed with the pointer.
//   - Inspect: freezes one (state, direction) pose so its body/weapon offset can be calibrated.

const CELL = 64;
const BOARD_COLS = 5;
const BOARD_ROWS = 5;
const BOARD_SCALE = 2;
const LABEL_BAND = 44;
const PREVIEW_WIDTH = BOARD_COLS * CELL * BOARD_SCALE;
const PREVIEW_HEIGHT = BOARD_ROWS * CELL * BOARD_SCALE + LABEL_BAND;
const NINJA_ACTION_ID = "ninja.batto_dash";

const DIRECTION_VECTOR: Record<ActionDirection, { x: number; y: number }> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const AUTO_SEQUENCE: readonly ActionDirection[] = ["right", "down", "left", "up"];
const POSE_FOR_STATE: Record<ActionStateKey, PlayerSpritePose> = {
  idle: "idle",
  prepare: "prepare",
  execute: "dash",
  end: "dashLand",
  attack: "attack",
};

export interface ActionLabInspect {
  readonly stateKey: ActionStateKey;
  readonly direction: ActionDirection;
}

export interface ActionLabConfig {
  readonly catalog: ActionPresentationCatalog;
  readonly actionId: string;
  readonly inspect: ActionLabInspect | null;
  readonly autoLoop: boolean;
  readonly altMode: boolean;
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

  // Inject the same sheets the game renderer injects, then build the real PlayerSprite.
  const [body, battoBase, slashEnd, attack, katanaSlash, katanaBattoStart, katanaBattoEnd] = await Promise.all([
    Assets.load<Texture>(ninjaBodyUrl),
    Assets.load<Texture>(battoBaseUrl),
    Assets.load<Texture>(slashEndUrl),
    Assets.load<Texture>(ninjaAttackUrl),
    Assets.load<Texture>(katanaSlashUrl),
    Assets.load<Texture>(katanaBattoStartUrl),
    Assets.load<Texture>(katanaBattoEndUrl),
  ]);
  setNinjaSpriteSheet(body);
  setNinjaBattoSheets({ battoBase, slashEnd, attack, katanaSlash, katanaBattoStart, katanaBattoEnd });
  const loadedPreviewAssets = await Promise.all(
    Object.values(ACTION_LAB_PREVIEW_ACTIONS).map(
      async (preview) =>
        [
          preview.id,
          {
            base: await Assets.load<Texture>(preview.baseSheetUrl),
            animation: await Assets.load<Texture>(preview.animationSheetUrl),
          },
        ] as const,
    ),
  );
  const previewAssets = new Map(loadedPreviewAssets);

  let config = initial;

  // --- Static board -------------------------------------------------------------------------
  const boardLayer = new Container();
  boardLayer.position.set(0, LABEL_BAND);
  boardLayer.scale.set(BOARD_SCALE);
  app.stage.addChild(boardLayer);

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
  boardLayer.addChild(grid);

  const cursorHighlight = new Graphics()
    .rect(1, 1, CELL - 2, CELL - 2)
    .stroke({ color: 0xffd166, width: 2, alpha: 0.9 });
  boardLayer.addChild(cursorHighlight);

  // Static layer (does not move with the sprite) that holds the dash afterimage trail behind it.
  const ghostLayer = new Container();
  boardLayer.addChild(ghostLayer);

  const player: PlayerSprite | undefined = createPlayerSprite("character.ninja");
  if (!player) {
    throw new Error("Action Lab could not create the Ninja player sprite.");
  }
  boardLayer.addChild(player.root);
  let enemyPresentation: EnemyPresentation | undefined;
  let enemyHost: Container | undefined;
  let enemyActionId: string | undefined;

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
  let autoCall: gsap.core.Tween | undefined;
  let inspectLoop: gsap.core.Tween | undefined;

  // The dash play/auto sequence always previews the batto action. Preview-only enemy actions use
  // their selected action directly and never enter the player dash sequence.
  const battoDash = () => config.catalog.actions[NINJA_ACTION_ID];
  const selectedPreview = () => ACTION_LAB_PREVIEW_ACTIONS[config.actionId];
  const selectedAction = () => selectedPreview()?.action ?? config.catalog.actions[config.actionId];
  const executeDuration = (): number => battoDash()?.execute?.motion?.durationSec ?? 0.16;

  const ensureActor = (): void => {
    const preview = selectedPreview();
    if (!preview) {
      enemyPresentation?.clearAction();
      enemyHost?.destroy({ children: true });
      enemyPresentation = undefined;
      enemyHost = undefined;
      enemyActionId = undefined;
      player.root.visible = true;
      return;
    }
    if (enemyPresentation && enemyActionId === preview.id) {
      return;
    }

    enemyPresentation?.clearAction();
    enemyHost?.destroy({ children: true });
    const assets = previewAssets.get(preview.id);
    const enemy = assets ? createEnemyPresentation(preview.action.profileId, assets.base, undefined) : undefined;
    if (!enemy) {
      throw new Error(`Action Lab could not create enemy presentation ${preview.action.profileId}.`);
    }
    player.root.visible = false;
    const host = new Container();
    host.label = `${preview.id}.host`;
    host.addChild(enemy.root);
    enemyPresentation = enemy;
    enemyHost = host;
    enemyActionId = preview.id;
    boardLayer.addChild(host);
  };

  const actorRoot = (): Container => enemyHost ?? player.root;

  const placeRigAtCell = (cell: Cell): void => {
    const { x, y } = cellCenter(cell);
    actorRoot().position.set(x, y);
    app.canvas.dataset.actionActorPosition = `${x},${y}`;
  };

  // The single rendering path: push the whole draft catalog into the runtime catalog the sprite
  // reads (so both the batto and normal-attack actions resolve), then drive the real sprite.
  const applyState = (stateKey: ActionStateKey, direction: ActionDirection): void => {
    phase = stateKey;
    const preview = selectedPreview();
    if (preview && enemyPresentation) {
      const assets = previewAssets.get(preview.id);
      const frames = preview.action.attack?.bodyFrames;
      enemyPresentation.setFacing(DIRECTION_VECTOR[direction]);
      if (stateKey === "attack" && assets && frames) {
        enemyPresentation.playBodyAnimation(assets.animation, frames, preview.loop);
      } else {
        enemyPresentation.clearAction();
      }
    } else {
      setRuntimeActionPresentationCatalog(config.catalog);
      player.setFacing(DIRECTION_VECTOR[direction]);
      player.setPose(POSE_FOR_STATE[stateKey]);
    }
    app.canvas.dataset.actionId = config.actionId;
    app.canvas.dataset.actionProfile = selectedAction()?.profileId ?? "";
    app.canvas.dataset.actionPreviewOnly = String(Boolean(preview));
    app.canvas.dataset.actionLoop = String(preview?.loop ?? false);
    showLabel();
  };

  const showLabel = (): void => {
    const mode = config.inspect ? "INSPECT" : config.autoLoop ? "AUTO" : config.altMode ? "ALT" : "—";
    const actionLabel = selectedAction()?.label ?? config.actionId;
    label.text = `[${mode}]  ${actionLabel}  ·  state: ${phase.toUpperCase()}  ·  facing: ${facing}`;
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

  const triggerExecute = (target: Cell): void => {
    if (selectedPreview()) {
      return;
    }
    if (phase === "execute") {
      return;
    }
    if (target.col === actorCell.col && target.row === actorCell.row) {
      return;
    }
    facing = cardinalFacing(actorCell, target);
    applyState("execute", facing);

    const destination = cellCenter(target);
    let ghostAccum = 0;
    gsap.to(player.root.position, {
      x: destination.x,
      y: destination.y,
      duration: executeDuration(),
      ease: battoDash()?.execute?.motion?.ease ?? "power2.in",
      onUpdate: () => {
        ghostAccum += app.ticker.deltaMS;
        if (ghostAccum >= player.afterimageIntervalMs) {
          ghostAccum = 0;
          player.spawnAfterimage(ghostLayer, player.root.position);
        }
      },
      onComplete: () => {
        actorCell = { ...target };
        applyState("end", facing);
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
    applyState("prepare", facing);
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
    inspectLoop?.kill();
    inspectLoop = undefined;
    gsap.killTweensOf(player.root.position);
  };

  // --- Inspect (freeze one state + direction) -----------------------------------------------
  const renderInspect = (inspect: ActionLabInspect): void => {
    stopAuto();
    cursorHighlight.visible = false;
    actorCell = { ...centerCell };
    placeRigAtCell(actorCell);
    facing = inspect.direction;
    applyState(inspect.stateKey, inspect.direction);
    // The attack is a one-shot animation; replay it on a loop so it can be previewed while frozen.
    if (inspect.stateKey === "attack" && !selectedPreview()?.loop) {
      const total = (selectedAction()?.attack?.bodyFrames ?? []).reduce((sum, frame) => sum + frame.holdSec, 0);
      const replay = (): void => {
        applyState("attack", inspect.direction);
        inspectLoop = gsap.delayedCall(total + 0.6, replay);
      };
      inspectLoop = gsap.delayedCall(total + 0.6, replay);
    }
  };

  // --- Pointer interaction (play mode only) -------------------------------------------------
  boardLayer.eventMode = "static";
  boardLayer.hitArea = new Rectangle(0, 0, BOARD_COLS * CELL, BOARD_ROWS * CELL);
  const cellFromEvent = (globalX: number, globalY: number): Cell | undefined => {
    const local = boardLayer.toLocal({ x: globalX, y: globalY });
    const col = Math.floor(local.x / CELL);
    const row = Math.floor(local.y / CELL);
    if (col < 0 || row < 0 || col >= BOARD_COLS || row >= BOARD_ROWS) {
      return undefined;
    }
    return { col, row };
  };
  boardLayer.on("pointermove", (event) => {
    if (config.inspect || config.autoLoop) {
      return;
    }
    const cell = cellFromEvent(event.global.x, event.global.y);
    if (!cell) {
      return;
    }
    setCursor(cell);
    // Only idle and the prepare aim stance follow the cursor; the held finishing pose stays put,
    // mirroring the runtime — it is left only by a click (execute/idle).
    if (phase === "idle" || phase === "prepare") {
      setFacingFromCursor();
      applyState(phase, facing);
    }
  });
  boardLayer.on("pointertap", (event) => {
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
      applyState("idle", facing);
    }
  });

  // --- Config-driven updates (live tuning) --------------------------------------------------
  const update = (next: ActionLabConfig): void => {
    const prev = config;
    config = next;
    const actorChanged = prev.actionId !== next.actionId;
    ensureActor();

    if (actorChanged) {
      stopAuto();
      actorCell = { ...centerCell };
      placeRigAtCell(actorCell);
    }

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
      } else if (phase === "prepare" || phase === "end") {
        applyState(phase, facing);
      }
      showLabel();
      return;
    }

    // Manual (auto off, not inspecting).
    if (prev.autoLoop || prev.inspect) {
      stopAuto();
      actorCell = { ...centerCell };
      placeRigAtCell(actorCell);
      applyState("idle", facing);
    }
    if (next.altMode && phase === "idle") {
      applyState("prepare", facing);
    } else if (!next.altMode && phase === "prepare") {
      applyState("idle", facing);
    } else {
      // Re-render the current state so slider edits show live.
      applyState(phase, facing);
    }
  };

  ensureActor();
  placeRigAtCell(actorCell);
  setCursor(cursorCell);
  if (config.inspect) {
    renderInspect(config.inspect);
  } else if (config.autoLoop) {
    runAuto();
    showLabel();
  } else {
    applyState("idle", facing);
  }

  return {
    update,
    destroy() {
      stopAuto();
      enemyPresentation?.clearAction();
      app.destroy(true, { children: true });
    },
  };
}
