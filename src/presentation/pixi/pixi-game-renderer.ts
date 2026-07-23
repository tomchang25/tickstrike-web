import { Application, Assets, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from "pixi.js";
import { gsap } from "gsap";
import { sameCell, type Cell, type EntityId, type EntityState, type WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";
import { BoardPainter } from "./board-painter";
import { InputController, type PointerInputBinding, type PointerMode } from "./input-controller";
import { PreviewPainter } from "./preview-painter";
import {
  createPlayerSprite,
  setNinjaBattoSheets,
  setNinjaSpriteSheet,
  type PlayerSprite,
  type PlayerSpritePose,
} from "./character-sprites";
import {
  createEnemyPresentation,
  getEnemyPresentationProfile,
  type EnemyActionAnimations,
  type EnemyWaterAnimation,
  type EnemyPresentation,
} from "./enemy-sprites";
import { enemyWaterAnimationAssets } from "@content/enemies/enemy-water-animation-assets";
import { enemyActionAnimationAssets } from "@content/enemies/enemy-action-animation-assets";
import ninjaSpriteSheetUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import ninjaAttackSheetUrl from "@content/characters/assets/ninja/attack-sprite-sheet.png";
import ninjaBattoBaseUrl from "@content/characters/assets/ninja/batto/ninja-batto-base.png";
import ninjaSlashEndUrl from "@content/characters/assets/ninja/batto/ninja-slash-end.png";
import ninjaKatanaSlashUrl from "@content/characters/assets/ninja/batto/katana-slash.png";
import ninjaKatanaBattoStartUrl from "@content/characters/assets/ninja/batto/katana-batto-start.png";
import ninjaKatanaBattoEndUrl from "@content/characters/assets/ninja/batto/katana-batto-end.png";
import { enemySpriteSheetUrls } from "@content/enemies/features";
import { TerrainPainter, type TerrainConfig } from "./terrain-painter";
import wallTerrainUrl from "./assets/terrain/wall-terrain.png";
import waterTileUrl from "./assets/terrain/water.png";
import wallTerrainManifest from "./assets/terrain/wall-terrain.json";
import { BOARD_ORIGIN, COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from "./arena-layout";
import { loadArenaDecorations } from "./arena-decoration";

export type { PointerCommit, PointerInputBinding, PointerMode } from "./input-controller";

interface EntityView {
  readonly root: Container;
  readonly body: Graphics | Sprite;
  readonly sprite?: PlayerSprite;
  readonly enemyPresentation?: EnemyPresentation;
  readonly presentationId: string | undefined;
  readonly label: Text;
  readonly facingMarker: Text;
  readonly debugLabel: Text;
  readonly statusLabel: Text;
  readonly hpBar: Graphics;
  readonly guardBar: Graphics;
}

export interface DetachedEntityView {
  readonly root: Container;
  readonly enemyPresentation?: EnemyPresentation;
}

export interface ScreenBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The logical centre used by entity roots, effects, and cell annotations. */
function cellToPixels(cell: Cell): { x: number; y: number } {
  return {
    x: cell.x * CELL_SIZE + CELL_SIZE / 2,
    y: cell.y * CELL_SIZE + CELL_SIZE / 2,
  };
}

// Actor feet sit 16px below the root, inset 2 art px and seated 2 screen px.
// A 16px frame at 3.5x scale therefore spans -31..+25 around the root and its
// geometric centre sits 3px above it; satellite UI hangs from that centre.
const BODY_CENTER_Y = -3;

/** Maps the bake manifest onto the painter's config. */
function buildTerrainConfig(): TerrainConfig {
  return {
    exteriorOrigin: wallTerrainManifest.exterior_origin,
    interiorOrigin: wallTerrainManifest.interior_origin,
    grassVariants: wallTerrainManifest.grass_variants,
    flowerVariants: wallTerrainManifest.flower_variants,
  };
}

function entityColor(entity: EntityState): number {
  if (entity.kind === "player") {
    return 0x6ed0ff;
  }
  if (entity.phase === "drowning") {
    return 0xf2d06b;
  }
  if (entity.phase === "dead") {
    return 0xff6b6b;
  }
  if (entity.activity === "staggered") {
    return 0xc79cff;
  }
  if (entity.activity === "telegraphing") {
    return 0xffb86b;
  }
  if (entity.activity === "recovering") {
    return 0xb5bfce;
  }
  return 0xe8eef7;
}

function facingGlyph(facing: Cell | undefined): string {
  if (!facing) {
    return "";
  }
  if (facing.x > 0) {
    return "→";
  }
  if (facing.x < 0) {
    return "←";
  }
  if (facing.y > 0) {
    return "↓";
  }
  return "↑";
}

function debugStateLabel(entity: EntityState): string {
  if (entity.phase !== "alive") {
    return entity.phase;
  }
  if (entity.activity && entity.activity !== "ready") {
    return entity.activity;
  }
  return entity.lastDecision ?? "idle";
}

function combatStatusLabel(entity: EntityState): string {
  if (entity.phase !== "alive") {
    return entity.phase.toUpperCase();
  }
  if (entity.staggerTicks !== undefined) {
    return `STAGGER ${entity.staggerTicks}`;
  }
  if (entity.protectionTicks !== undefined) {
    return `PROTECT ${entity.protectionTicks}`;
  }
  if (entity.activity === "telegraphing") {
    return `TELEGRAPH ${entity.committedAttack?.warningTicks ?? 0}`;
  }
  if (entity.activity === "recovering") {
    return `RECOVER ${entity.recoveryTicks ?? 0}`;
  }
  if (entity.activity === "resting") {
    return `REST ${entity.restTicks ?? 0}`;
  }
  return "";
}

function drawStatusBar(bar: Graphics, current: number, maximum: number, color: number, y: number): void {
  const width = 52;
  const height = 4;
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  bar
    .clear()
    .roundRect(-width / 2, y, width, height, 2)
    .fill({ color: 0x080a0f, alpha: 0.92 })
    .roundRect(-width / 2 + 1, y + 1, (width - 2) * ratio, height - 2, 1)
    .fill(color);
}

export class PixiGameRenderer {
  readonly app = new Application();
  readonly backgroundLayer = new Container();
  readonly worldLayer = new Container();
  readonly terrainLayer = new Container();
  readonly terrainOverlayLayer = new Container();
  readonly waterReflectionLayer = new Container();
  readonly gridLayer = new Container();
  readonly arenaDepthLayer = new Container();
  readonly waterPropLayer = new Container();
  readonly frameLayer = new Container();
  readonly telegraphLayer = new Container();
  readonly pointerGroundLayer = new Container();
  readonly pointerPreviewLayer = new Container();
  readonly reservationLayer = new Container();
  readonly actorLayer = new Container();
  readonly telegraphLabelLayer = new Container();
  readonly effectsLayer = new Container();

  private readonly board = new BoardPainter(
    this.app,
    this.gridLayer,
    this.reservationLayer,
    this.telegraphLayer,
    this.telegraphLabelLayer,
    () => this.host,
  );

  private readonly terrain = new TerrainPainter(this.terrainLayer, this.terrainOverlayLayer);

  private readonly preview = new PreviewPainter(
    this.app,
    this.pointerGroundLayer,
    this.pointerPreviewLayer,
    () => this.host,
    (cell) => cellToPixels(cell),
  );

  private readonly input = new InputController(this.app, () => this.snapshot, {
    applyFacing: (direction) => this.applyPlayerFacing(direction),
    drawPreview: (model) => this.preview.draw(model),
    clearPreview: () => this.preview.clear(),
  });

  private readonly entityViews = new Map<EntityId, EntityView>();
  private readonly transientEffects = new Set<Graphics>();
  private readonly positionOwners = new Set<EntityId>();
  private host: HTMLElement | undefined;
  private snapshot: WorldSnapshot | undefined;
  private playerPose: PlayerSpritePose = "idle";
  private pointerMode: PointerMode = "attack";
  private afterimageTick: (() => void) | undefined;
  private afterimageAccum = 0;
  private attackReset: gsap.core.Tween | undefined;
  private debugMode = false;
  private enemySpriteSheets: Readonly<Record<string, Texture>> = {};
  private enemyWaterAnimations: Readonly<Record<string, EnemyWaterAnimation>> = {};
  private enemyActionAnimations: Readonly<Record<string, EnemyActionAnimations>> = {};

  get transientCount(): number {
    return this.transientEffects.size;
  }

  get positionOwnerCount(): number {
    return this.positionOwners.size;
  }

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      width: COMPOSITION_WIDTH,
      height: COMPOSITION_HEIGHT,
      antialias: true,
      background: 0x11131a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    setNinjaSpriteSheet(await Assets.load<Texture>(ninjaSpriteSheetUrl));
    const [battoBase, slashEnd, attack, katanaSlash, katanaBattoStart, katanaBattoEnd] = await Promise.all([
      Assets.load<Texture>(ninjaBattoBaseUrl),
      Assets.load<Texture>(ninjaSlashEndUrl),
      Assets.load<Texture>(ninjaAttackSheetUrl),
      Assets.load<Texture>(ninjaKatanaSlashUrl),
      Assets.load<Texture>(ninjaKatanaBattoStartUrl),
      Assets.load<Texture>(ninjaKatanaBattoEndUrl),
    ]);
    setNinjaBattoSheets({ battoBase, slashEnd, attack, katanaSlash, katanaBattoStart, katanaBattoEnd });
    const loadedEnemySpriteSheets = await Promise.all(
      Object.entries(enemySpriteSheetUrls).map(async ([sheetKey, url]) => [sheetKey, await Assets.load<Texture>(url)]),
    );
    this.enemySpriteSheets = Object.fromEntries(loadedEnemySpriteSheets);
    const loadedWaterAnimations = await Promise.all(
      Object.entries(enemyWaterAnimationAssets).map(async ([profileId, asset]) => [
        profileId,
        {
          sheet: await Assets.load<Texture>(asset.sheetUrl),
          frameDurationsMs: asset.frameDurationsMs,
        },
      ]),
    );
    this.enemyWaterAnimations = Object.fromEntries(loadedWaterAnimations);
    const loadedActionAnimations = await Promise.all(
      Object.entries(enemyActionAnimationAssets).map(async ([profileId, assets]) => [
        profileId,
        {
          prepare: {
            sheet: await Assets.load<Texture>(assets.prepare.sheetUrl),
            frameDurationsMs: assets.prepare.frameDurationsMs,
            loop: assets.prepare.loop,
          },
          execute: {
            sheet: await Assets.load<Texture>(assets.execute.sheetUrl),
            frameDurationsMs: assets.execute.frameDurationsMs,
            loop: assets.execute.loop,
          },
        },
      ]),
    );
    this.enemyActionAnimations = Object.fromEntries(loadedActionAnimations);

    const [wallTerrain, waterTile] = await Promise.all([
      Assets.load<Texture>(wallTerrainUrl),
      Assets.load<Texture>(waterTileUrl),
    ]);
    this.terrain.setAtlas(wallTerrain, waterTile, buildTerrainConfig());
    waterTile.source.scaleMode = "nearest";
    this.backgroundLayer.addChild(
      new TilingSprite({ texture: waterTile, width: COMPOSITION_WIDTH, height: COMPOSITION_HEIGHT }),
    );
    await loadArenaDecorations(
      {
        waterReflection: this.waterReflectionLayer,
        arenaDepth: this.arenaDepthLayer,
        waterProp: this.waterPropLayer,
        frame: this.frameLayer,
      },
      BOARD_ORIGIN,
    );

    this.app.canvas.dataset.testid = "game-canvas";
    this.app.canvas.setAttribute("aria-label", "Tickstrike arena");
    host.replaceChildren(this.app.canvas);

    this.worldLayer.addChild(
      this.terrainLayer,
      this.waterReflectionLayer,
      this.gridLayer,
      this.arenaDepthLayer,
      this.waterPropLayer,
      this.frameLayer,
      this.reservationLayer,
      this.telegraphLayer,
      // Pointer cell markers are floor paint: actors standing in a marked
      // cell cover the marker's lower edge instead of being sliced by it.
      this.pointerGroundLayer,
      // The south wall trim draws above cell markers and below actors. Its lip
      // begins at the arena edge, leaving the southern cells at full height.
      this.terrainOverlayLayer,
      this.actorLayer,
      this.telegraphLabelLayer,
      // Victim outcome markers (kill cross, knockback arrows) annotate the
      // actors themselves, so they stay above the actor layer.
      this.pointerPreviewLayer,
      this.effectsLayer,
    );
    this.worldLayer.position.set(BOARD_ORIGIN.x, BOARD_ORIGIN.y);
    // Presenters tween roots every frame, so the depth key follows the animated
    // position rather than only the latest snapshot projection.
    this.actorLayer.sortableChildren = true;
    this.app.ticker.add(() => {
      for (const child of this.actorLayer.children) {
        child.zIndex = child.y;
      }
    });
    this.app.stage.addChild(this.backgroundLayer, this.worldLayer);
  }

  destroy(): void {
    this.attackReset?.kill();
    this.attackReset = undefined;
    this.stopPlayerAfterimage();
    this.input.unbind();
    this.preview.clear();
    for (const view of this.entityViews.values()) {
      view.enemyPresentation?.reset();
    }
    this.entityViews.clear();
    this.clearPositionReservations();
    this.clearTransient();
    this.enemySpriteSheets = {};
    this.enemyWaterAnimations = {};
    this.enemyActionAnimations = {};
    this.app.destroy(true, { children: true });
    this.host = undefined;
  }

  // `idle` is a request for the player's resting pose: the Alt-hold Dash draw stance while aiming a
  // dash, otherwise the plain idle. Only move/dash/attack lock facing; idle, prepare, and the held
  // dashLand finishing pose stay re-aimable so a new aim or command takes over immediately.
  private restingPose(): PlayerSpritePose {
    const mobility = this.snapshot?.entities.find((entity) => entity.kind === "player")?.mobility?.kind ?? "dash";
    return this.pointerMode === "mobility" && mobility === "dash" ? "prepare" : "idle";
  }

  setPlayerAnimation(pose: PlayerSpritePose): void {
    const effective = pose === "idle" ? this.restingPose() : pose;
    this.playerPose = effective;
    const player = this.entityViews.get("player");
    player?.sprite?.setPose(effective);
    // Only idle and the prepare aim stance re-face to the cursor; move, dash, attack, and the held
    // dashLand finishing pose keep their committed facing until a command forces a new one.
    this.input.setFacingLocked(effective !== "idle" && effective !== "prepare");
    // The dash draw-cut leaves an afterimage trail; every other pose clears it.
    if (effective === "dash") {
      this.startPlayerAfterimage();
    } else {
      this.stopPlayerAfterimage();
    }
    // The attack body animation plays to completion independent of the impact VFX, then settles to
    // idle on its own — the impact timeline no longer cuts it short.
    this.attackReset?.kill();
    this.attackReset = undefined;
    if (effective === "attack") {
      const duration = player?.sprite?.attackDurationSec ?? 0.24;
      this.attackReset = gsap.delayedCall(duration, () => this.setPlayerAnimation("idle"));
    }
    if (this.host) {
      this.app.canvas.dataset.playerAnimation = effective;
    }
  }

  // Spawns the shared PlayerSprite afterimage into the static actor layer while the dash motion (a
  // moving entity view) is in flight, on the catalog-authored cadence. The clone lives in
  // `actorLayer` so it stays put as the player continues; the sprite owns the appearance.
  private startPlayerAfterimage(): void {
    this.stopPlayerAfterimage();
    const view = this.entityViews.get("player");
    const sprite = view?.sprite;
    const root = view?.root;
    if (!sprite || !root) {
      return;
    }
    this.afterimageAccum = 0;
    const tick = () => {
      this.afterimageAccum += this.app.ticker.deltaMS;
      if (this.afterimageAccum >= sprite.afterimageIntervalMs) {
        this.afterimageAccum = 0;
        sprite.spawnAfterimage(this.actorLayer, { x: root.position.x, y: root.position.y });
      }
    };
    this.app.ticker.add(tick);
    this.afterimageTick = tick;
  }

  private stopPlayerAfterimage(): void {
    if (this.afterimageTick) {
      this.app.ticker.remove(this.afterimageTick);
      this.afterimageTick = undefined;
    }
  }

  /** Re-applies the current player pose so a live catalog refresh updates the visible frame/offset. */
  refreshPlayerAnimation(): void {
    this.setPlayerAnimation(this.playerPose);
    this.entityViews.get("player")?.sprite?.setFacing(this.input.playerFacing);
  }

  setPlayerFacing(facing: Cell, force = false): void {
    this.input.setPlayerFacing(facing, force);
  }

  private applyPlayerFacing(direction: Cell): void {
    this.entityViews.get("player")?.sprite?.setFacing(direction);
    if (this.host) {
      this.app.canvas.dataset.playerFacing = `${direction.x},${direction.y}`;
    }
  }

  sync(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.tick === 0) {
      this.input.resetForNewRun();
    }
    this.terrain.render(snapshot);
    this.board.drawArena(snapshot, this.debugMode);
    this.projectSnapshot(snapshot);

    this.input.refreshPreview();
  }

  updateSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (this.debugMode) {
      this.board.drawArena(snapshot, this.debugMode);
    }
    this.projectSnapshot(snapshot);
    this.input.refreshPreview();
  }

  /** Rebuilds live entity views after the dev presentation catalog changes. */
  refreshEntityPresentationProfiles(): void {
    if (!this.snapshot) {
      return;
    }
    for (const view of this.entityViews.values()) {
      this.destroyEntityView(view);
    }
    this.entityViews.clear();
    this.positionOwners.clear();
    this.projectSnapshot(this.snapshot);
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.app.canvas.dataset.debugMode = String(enabled);
    if (this.snapshot) {
      this.board.drawArena(this.snapshot, this.debugMode);
      this.projectSnapshot(this.snapshot);
    }
  }

  private projectSnapshot(snapshot: WorldSnapshot): void {
    this.board.drawReservations(snapshot);
    this.board.drawTelegraphs(snapshot);
    this.input.noteSnapshotMotion(snapshot);

    const liveIds = new Set(snapshot.entities.map((entity) => entity.id));
    for (const [id, view] of this.entityViews) {
      if (!liveIds.has(id)) {
        this.destroyEntityView(view);
        this.entityViews.delete(id);
        this.positionOwners.delete(id);
      }
    }

    for (const entity of snapshot.entities) {
      let view = this.entityViews.get(entity.id);
      if (view && view.presentationId !== entity.presentationId) {
        this.destroyEntityView(view);
        this.entityViews.delete(entity.id);
        this.positionOwners.delete(entity.id);
        view = undefined;
      }
      if (!view) {
        view = this.createEntityView(entity);
        this.entityViews.set(entity.id, view);
        this.actorLayer.addChild(view.root);
      }

      if (!this.positionOwners.has(entity.id)) {
        const pixels = cellToPixels(entity.cell);
        view.root.position.set(pixels.x, pixels.y);
      }
      if (view.enemyPresentation) {
        view.enemyPresentation.sync(entity);
        view.body.tint = 0xffffff;
      } else {
        view.body.tint = entityColor(entity);
      }
      if (this.host && entity.kind === "player" && view.sprite) {
        const playerFacing = this.input.playerFacing;
        // Re-aim while resting (idle or the prepare stance); the held dashLand pose keeps its facing
        // until a new aim ends it, and active animations stay locked to their committed direction.
        if (
          (view.sprite.pose === "idle" || view.sprite.pose === "prepare") &&
          !sameCell(view.sprite.facing, playerFacing)
        ) {
          view.sprite.setFacing(playerFacing);
        }
        view.body.tint = 0xffffff;
        this.app.canvas.dataset.playerProfile = view.sprite.profileId;
        this.app.canvas.dataset.playerFacing = `${playerFacing.x},${playerFacing.y}`;
        this.app.canvas.dataset.playerAnimation ??= "idle";
      } else if (this.host && entity.kind === "player") {
        delete this.app.canvas.dataset.playerProfile;
        delete this.app.canvas.dataset.playerFacing;
        this.app.canvas.dataset.playerAnimation = "idle";
      }
      view.root.alpha = 1;
      view.root.scale.set(1);
      drawStatusBar(
        view.hpBar,
        entity.hp,
        entity.maxHp,
        0xff5c7a,
        BODY_CENTER_Y + (entity.kind === "enemy" ? -42 : -34),
      );
      view.guardBar.visible = Boolean(entity.guard);
      if (entity.guard) {
        drawStatusBar(view.guardBar, entity.guard.current, entity.guard.max, 0x72d4ff, BODY_CENTER_Y - 36);
      }
      view.label.text =
        (entity.kind === "player" && view.sprite) || view.enemyPresentation ? "" : entity.kind === "player" ? "P" : "E";
      view.label.visible = entity.kind !== "player" || !view.sprite;
      view.facingMarker.visible = entity.kind === "enemy" && Boolean(entity.facing);
      view.facingMarker.text = facingGlyph(entity.facing);
      if (entity.facing) {
        view.facingMarker.position.set(entity.facing.x * 31, BODY_CENTER_Y + entity.facing.y * 31);
      }
      view.debugLabel.visible = this.debugMode && entity.kind === "enemy";
      view.debugLabel.text = debugStateLabel(entity);
      view.statusLabel.visible = entity.kind === "enemy" && Boolean(combatStatusLabel(entity));
      view.statusLabel.text = combatStatusLabel(entity);
    }
    if (this.host) {
      this.app.canvas.dataset.enemyPresentations = snapshot.entities
        .map((entity) => {
          const presentation = this.entityViews.get(entity.id)?.enemyPresentation;
          if (entity.kind !== "enemy" || !presentation) {
            return undefined;
          }
          return enemyPresentationLabel(entity.id, presentation);
        })
        .filter((value): value is string => value !== undefined)
        .join("|");
    }
  }

  setPointerMode(mode: PointerMode): void {
    const changed = this.pointerMode !== mode;
    this.pointerMode = mode;
    this.input.setPointerMode(mode);
    // Alt swaps only between plain idle and the Dash prepare stance. An active animation and the
    // held dashLand finishing pose are left untouched — dashLand persists through Alt and cursor
    // moves, and is replaced only when the next move/attack/dash command begins.
    if (changed && (this.playerPose === "idle" || this.playerPose === "prepare")) {
      this.setPlayerAnimation("idle");
    }
  }

  bindPointerInput(binding: PointerInputBinding): () => void {
    return this.input.bind(binding);
  }

  getEntityView(id: EntityId): Container | undefined {
    return this.entityViews.get(id)?.root;
  }

  reservePosition(id: EntityId): void {
    this.positionOwners.add(id);
  }

  releasePosition(id: EntityId): void {
    if (!this.positionOwners.delete(id)) {
      return;
    }
    const entity = this.snapshot?.entities.find((candidate) => candidate.id === id);
    const view = this.entityViews.get(id);
    if (!entity || !view) {
      return;
    }
    const pixels = cellToPixels(entity.cell);
    view.root.position.set(pixels.x, pixels.y);
  }

  clearPositionReservations(): void {
    this.positionOwners.clear();
  }

  detachEntityView(id: EntityId): DetachedEntityView | undefined {
    const view = this.entityViews.get(id);
    if (!view) {
      return undefined;
    }
    this.entityViews.delete(id);
    if (view.enemyPresentation) {
      this.refreshEnemyPresentationDataset();
    }
    if (id === "player" && this.host) {
      delete this.app.canvas.dataset.playerProfile;
      delete this.app.canvas.dataset.playerFacing;
      this.app.canvas.dataset.playerAnimation = "idle";
    }
    return view;
  }

  getEnemyPresentation(id: EntityId): EnemyPresentation | undefined {
    return this.entityViews.get(id)?.enemyPresentation;
  }

  setTerminalPresentationLabels(labels: string): void {
    if (!this.host) {
      return;
    }
    if (labels) {
      this.app.canvas.dataset.retainedPresentations = labels;
    } else {
      delete this.app.canvas.dataset.retainedPresentations;
    }
  }

  resetEnemyPresentations(): void {
    for (const view of this.entityViews.values()) {
      view.enemyPresentation?.reset();
    }
    this.refreshEnemyPresentationDataset();
  }

  refreshEnemyPresentationDataset(): void {
    if (!this.host) {
      return;
    }
    this.app.canvas.dataset.enemyPresentations = this.presentationLabels(this.entityViews);
  }

  private presentationLabels(views: ReadonlyMap<EntityId, EntityView>): string {
    return [...views.entries()]
      .map(([id, view]) => {
        const presentation = view.enemyPresentation;
        if (!presentation) {
          return undefined;
        }
        return enemyPresentationLabel(id, presentation);
      })
      .filter((value): value is string => value !== undefined)
      .join("|");
  }

  getEntityBounds(id: EntityId): ScreenBounds | undefined {
    const view = this.entityViews.get(id);
    const canvas = this.app.canvas;
    if (!view || !this.host || !canvas) {
      return undefined;
    }

    const bounds = view.root.getBounds();
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.app.screen.width;
    const scaleY = canvasRect.height / this.app.screen.height;

    return {
      x: canvasRect.left + bounds.x * scaleX,
      y: canvasRect.top + bounds.y * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    };
  }

  createImpact(cell: Cell, color = 0xffffff): Graphics {
    const pixels = cellToPixels(cell);
    const effect = new Graphics().circle(0, 0, CELL_SIZE * 0.22).stroke({ color, width: 5, alpha: 0.9 });
    effect.position.set(pixels.x, pixels.y);
    this.effectsLayer.addChild(effect);
    this.transientEffects.add(effect);
    return effect;
  }

  releaseTransient(effect: Graphics): void {
    this.transientEffects.delete(effect);
    if (!effect.destroyed) {
      effect.destroy({ children: true });
    }
  }

  clearTransient(): void {
    for (const effect of this.transientEffects) {
      if (!effect.destroyed) {
        effect.destroy({ children: true });
      }
    }
    this.transientEffects.clear();
    this.effectsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  cellToPixels(cell: Cell): { x: number; y: number } {
    return cellToPixels(cell);
  }

  private createEntityView(entity: EntityState): EntityView {
    const root = new Container();
    root.label = entity.id;
    root.eventMode = "none";
    const hpBar = new Graphics();
    const guardBar = new Graphics();
    guardBar.visible = Boolean(entity.guard);

    const playerSprite = entity.kind === "player" ? createPlayerSprite(`character.${entity.archetype}`) : undefined;
    const enemyProfile =
      entity.kind === "enemy" && entity.presentationId ? getEnemyPresentationProfile(entity.presentationId) : undefined;
    const enemySpriteSheet = enemyProfile ? this.enemySpriteSheets[enemyProfile.sheet] : undefined;
    const waterAnimation = enemyProfile ? this.enemyWaterAnimations[enemyProfile.id] : undefined;
    const actionAnimations = enemyProfile ? this.enemyActionAnimations[enemyProfile.id] : undefined;
    const enemyPresentation =
      enemySpriteSheet && enemyProfile
        ? createEnemyPresentation(enemyProfile.id, enemySpriteSheet, waterAnimation, actionAnimations, () =>
            this.refreshEnemyPresentationDataset(),
          )
        : undefined;
    const body =
      playerSprite?.body ??
      enemyPresentation?.body ??
      new Graphics().roundRect(-22, -22, 44, 44, 10).fill(0xffffff).stroke({ color: 0x0a0c10, width: 4 });
    if (!playerSprite && !enemyPresentation) {
      body.tint = entityColor(entity);
    }

    const label = new Text({
      text: (entity.kind === "player" && playerSprite) || enemyPresentation ? "" : entity.kind === "player" ? "P" : "E",
      style: {
        fill: 0x10131a,
        fontFamily: "monospace",
        fontSize: 20,
        fontWeight: "700",
      },
    });
    label.anchor.set(0.5);
    label.position.set(0, -4);
    label.visible = entity.kind !== "player" ? !enemyPresentation : !playerSprite;

    const debugLabel = new Text({
      text: debugStateLabel(entity),
      style: {
        fill: 0xf4fbff,
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "700",
      },
    });
    debugLabel.anchor.set(0.5);
    debugLabel.position.set(0, BODY_CENTER_Y - 32);
    debugLabel.visible = this.debugMode && entity.kind === "enemy";

    const statusLabel = new Text({
      text: combatStatusLabel(entity),
      style: {
        fill: 0xffd166,
        fontFamily: "monospace",
        fontSize: 10,
        fontWeight: "700",
      },
    });
    statusLabel.anchor.set(0.5);
    statusLabel.position.set(0, BODY_CENTER_Y + 29);
    statusLabel.visible = entity.kind === "enemy" && Boolean(combatStatusLabel(entity));

    const facingMarker = new Text({
      text: facingGlyph(entity.facing),
      style: {
        fill: 0x72d4ff,
        fontFamily: "sans-serif",
        fontSize: 24,
        fontWeight: "700",
      },
    });
    facingMarker.anchor.set(0.5);
    facingMarker.visible = entity.kind === "enemy" && Boolean(entity.facing);
    if (entity.facing) {
      facingMarker.position.set(entity.facing.x * 31, BODY_CENTER_Y + entity.facing.y * 31);
    }

    root.addChild(
      hpBar,
      guardBar,
      ...(playerSprite ? [playerSprite.root] : enemyPresentation ? [enemyPresentation.root] : [body]),
      label,
      facingMarker,
      debugLabel,
      statusLabel,
    );
    return {
      root,
      body,
      ...(playerSprite ? { sprite: playerSprite } : {}),
      ...(enemyPresentation ? { enemyPresentation } : {}),
      presentationId: entity.presentationId,
      label,
      facingMarker,
      debugLabel,
      statusLabel,
      hpBar,
      guardBar,
    };
  }

  private destroyEntityView(view: EntityView): void {
    view.enemyPresentation?.reset();
    view.root.destroy({ children: true });
  }
}

export function enemyPresentationLabel(id: EntityId, presentation: EnemyPresentation): string {
  const water = presentation.waterFrame === undefined ? "" : `:water:${presentation.waterFrame}`;
  const action = presentation.bodyAnimation
    ? `:action:${presentation.bodyAnimation}:${presentation.bodyAnimationRow ?? 0}`
    : "";
  return `${id}:${presentation.profileId}:${presentation.palette}:${presentation.pose}${water}${action}`;
}
