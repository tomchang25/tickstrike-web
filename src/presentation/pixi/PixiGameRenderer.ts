import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import { type Cell, type EntityId, type EntityState, type WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";
import { BoardPainter } from "./board-painter";
import { InputController, type PointerInputBinding, type PointerMode } from "./input-controller";
import {
  createPlayerSprite,
  setNinjaSpriteSheet,
  type PlayerSprite,
  type PlayerSpritePose,
} from "./character-sprites";
import {
  createEnemyPresentation,
  getEnemyPresentationProfile,
  type EnemyWaterAnimation,
  type EnemyPresentation,
} from "./enemy-sprites";
import { enemyWaterAnimationAssets } from "@content/enemies/enemy-water-animation-assets";
import ninjaSpriteSheetUrl from "@content/characters/assets/ninja/body-sprite-sheet.png";
import { enemySpriteSheetUrls } from "@content/enemies/features";

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

function cellToPixels(cell: Cell): { x: number; y: number } {
  return {
    x: cell.x * CELL_SIZE + CELL_SIZE / 2,
    y: cell.y * CELL_SIZE + CELL_SIZE / 2,
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

function drawStatusBar(
  bar: Graphics,
  current: number,
  maximum: number,
  color: number,
  y: number,
): void {
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
  readonly worldLayer = new Container();
  readonly gridLayer = new Container();
  readonly telegraphLayer = new Container();
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

  private readonly input = new InputController(this.app, () => this.snapshot, {
    applyFacing: (direction) => this.applyPlayerFacing(direction),
    drawPreview: () => this.drawPointerPreview(),
    clearPreview: () => this.clearPointerPreview(),
  });

  private readonly entityViews = new Map<EntityId, EntityView>();
  private readonly transientEffects = new Set<Graphics>();
  private readonly positionOwners = new Set<EntityId>();
  private host: HTMLElement | undefined;
  private snapshot: WorldSnapshot | undefined;
  private debugMode = false;
  private enemySpriteSheets: Readonly<Record<string, Texture>> = {};
  private enemyWaterAnimations: Readonly<Record<string, EnemyWaterAnimation>> = {};

  get transientCount(): number {
    return this.transientEffects.size;
  }

  get positionOwnerCount(): number {
    return this.positionOwners.size;
  }

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      width: 768,
      height: 768,
      antialias: true,
      background: 0x11131a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    setNinjaSpriteSheet(await Assets.load<Texture>(ninjaSpriteSheetUrl));
    const loadedEnemySpriteSheets = await Promise.all(
      Object.entries(enemySpriteSheetUrls).map(async ([sheetKey, url]) => [
        sheetKey,
        await Assets.load<Texture>(url),
      ]),
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

    this.app.canvas.dataset.testid = "game-canvas";
    this.app.canvas.setAttribute("aria-label", "Tickstrike arena");
    host.replaceChildren(this.app.canvas);

    this.worldLayer.addChild(
      this.gridLayer,
      this.reservationLayer,
      this.telegraphLayer,
      this.actorLayer,
      this.telegraphLabelLayer,
      this.pointerPreviewLayer,
      this.effectsLayer,
    );
    this.app.stage.addChild(this.worldLayer);
  }

  destroy(): void {
    this.input.unbind();
    this.clearPointerPreview();
    this.entityViews.clear();
    this.clearPositionReservations();
    this.clearTransient();
    this.enemySpriteSheets = {};
    this.enemyWaterAnimations = {};
    this.app.destroy(true, { children: true });
    this.host = undefined;
  }

  setPlayerAnimation(pose: PlayerSpritePose): void {
    const player = this.entityViews.get("player");
    player?.sprite?.setPose(pose);
    this.input.setFacingLocked(pose !== "idle");
    if (this.host) {
      this.app.canvas.dataset.playerAnimation = pose;
    }
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
        view.root.destroy({ children: true });
        this.entityViews.delete(id);
        this.positionOwners.delete(id);
      }
    }

    for (const entity of snapshot.entities) {
      let view = this.entityViews.get(entity.id);
      if (view && view.presentationId !== entity.presentationId) {
        view.root.destroy({ children: true });
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
        if (view.sprite.pose === "idle") {
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
        entity.kind === "enemy" ? -42 : -34,
      );
      view.guardBar.visible = Boolean(entity.guard);
      if (entity.guard) {
        drawStatusBar(view.guardBar, entity.guard.current, entity.guard.max, 0x72d4ff, -36);
      }
      view.label.text =
        (entity.kind === "player" && view.sprite) || view.enemyPresentation
          ? ""
          : entity.kind === "player"
            ? "P"
            : "E";
      view.label.visible = entity.kind !== "player" || !view.sprite;
      view.facingMarker.visible = entity.kind === "enemy" && Boolean(entity.facing);
      view.facingMarker.text = facingGlyph(entity.facing);
      if (entity.facing) {
        view.facingMarker.position.set(entity.facing.x * 31, entity.facing.y * 31);
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
    this.input.setPointerMode(mode);
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
    const effect = new Graphics()
      .circle(0, 0, CELL_SIZE * 0.22)
      .stroke({ color, width: 5, alpha: 0.9 });
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

  private drawPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host) {
      // An unmounted renderer has no canvas to draw on or tag, matching clearPointerPreview.
      return;
    }
    const canvas = this.app.canvas;
    delete canvas.dataset.attackPreviewCell;
    delete canvas.dataset.attackTarget;
    delete canvas.dataset.selectedMobility;
    delete canvas.dataset.mobilityPreviewCell;
    delete canvas.dataset.mobilityPreviewValid;
    delete canvas.dataset.mobilityPreviewRetained;
    delete canvas.dataset.smashPreviewCell;
    delete canvas.dataset.smashPreviewValid;
    delete canvas.dataset.smashArmed;
    canvas.dataset.pointerMode = this.input.pointerMode;
    canvas.dataset.selectedMobility = this.input.activeMobility();

    if (this.input.pointerMode === "attack" && !this.snapshot?.armedSmashTarget) {
      const preview = this.input.attackPreview;
      if (!preview?.accepted) {
        this.drawVictimMarkers();
        return;
      }
      const color = preview.hasTarget ? 0x72d4ff : 0xff6b6b;
      const target = preview.target;
      const marker = new Graphics()
        .rect(target.x * CELL_SIZE + 7, target.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14)
        .fill({ color, alpha: preview.hasTarget ? 0.16 : 0.08 })
        .stroke({ color, width: 4, alpha: 0.95 });
      this.pointerPreviewLayer.addChild(marker);
      canvas.dataset.attackPreviewCell = `${target.x},${target.y}`;
      canvas.dataset.attackTarget = preview.hasTarget ? "enemy" : "empty";
      this.drawVictimMarkers();
      return;
    }

    if (this.input.activeMobility() === "smash" || this.snapshot?.armedSmashTarget) {
      const preview = this.input.smashPreview;
      canvas.dataset.smashPreviewValid = String(Boolean(preview?.accepted));
      canvas.dataset.smashArmed = String(Boolean(this.snapshot?.armedSmashTarget));
      if (!preview) {
        this.drawVictimMarkers();
        return;
      }
      for (const cell of preview.area) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 8, cell.y * CELL_SIZE + 8, CELL_SIZE - 16, CELL_SIZE - 16)
          .fill({
            color: preview.accepted ? 0x72d4ff : 0x8791a4,
            alpha: preview.accepted ? 0.2 : 0.12,
          });
        this.pointerPreviewLayer.addChild(marker);
      }
      const center = preview.target;
      const centerMarker = new Graphics()
        .rect(center.x * CELL_SIZE + 5, center.y * CELL_SIZE + 5, CELL_SIZE - 10, CELL_SIZE - 10)
        .stroke({ color: preview.accepted ? 0x72d4ff : 0xff6b6b, width: 5, alpha: 0.95 });
      this.pointerPreviewLayer.addChild(centerMarker);
      if (preview.accepted) {
        const virtualPlayer = new Graphics()
          .circle(
            center.x * CELL_SIZE + CELL_SIZE / 2,
            center.y * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE * 0.28,
          )
          .fill({ color: 0xf4fbff, alpha: 0.38 })
          .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
        this.pointerPreviewLayer.addChild(virtualPlayer);
      }
      canvas.dataset.smashPreviewCell = `${center.x},${center.y}`;
      this.drawVictimMarkers();
      return;
    }

    const preview = this.input.dashPreview;
    const retainedPreview = this.input.retainedDashPreview;
    canvas.dataset.mobilityPreviewValid = String(Boolean(preview?.accepted));
    canvas.dataset.mobilityPreviewRetained = String(Boolean(!preview?.accepted && retainedPreview));
    const visiblePreview = preview?.accepted ? preview : retainedPreview;
    if (!visiblePreview?.landing) {
      this.drawVictimMarkers();
      return;
    }

    for (const cell of visiblePreview.path) {
      const marker = new Graphics()
        .rect(cell.x * CELL_SIZE + 10, cell.y * CELL_SIZE + 10, CELL_SIZE - 20, CELL_SIZE - 20)
        .fill({ color: 0x72d4ff, alpha: 0.22 });
      this.pointerPreviewLayer.addChild(marker);
    }

    const landing = visiblePreview.landing;
    const landingMarker = new Graphics()
      .rect(landing.x * CELL_SIZE + 6, landing.y * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12)
      .stroke({ color: 0x72d4ff, width: 5, alpha: 0.95 });
    const virtualPlayer = new Graphics()
      .circle(
        landing.x * CELL_SIZE + CELL_SIZE / 2,
        landing.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE * 0.28,
      )
      .fill({ color: 0xf4fbff, alpha: 0.38 })
      .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
    this.pointerPreviewLayer.addChild(landingMarker, virtualPlayer);
    canvas.dataset.mobilityPreviewCell = `${landing.x},${landing.y}`;
    this.drawVictimMarkers();
  }

  private drawVictimMarkers(): void {
    const canvas = this.app.canvas;
    const markers = this.input.victimPreviewMarkers;
    const kills = markers.filter((marker) => marker.outcome === "kill");
    const displacements = markers.filter(
      (marker) => (marker.outcome === "knockback" || marker.outcome === "water") && marker.to,
    );
    const terminal = markers.filter(
      (marker) => marker.outcome === "crush" || marker.outcome === "water",
    );
    const blocked = markers.filter((marker) => marker.outcome === "blocked");

    canvas.dataset.previewKills = kills.map((marker) => marker.enemyId).join(",");
    canvas.dataset.previewDisplacements = displacements
      .map(
        (marker) =>
          `${marker.enemyId}:${marker.from.x},${marker.from.y}>${marker.to?.x},${marker.to?.y}`,
      )
      .join(";");
    canvas.dataset.previewTerminal = terminal
      .map((marker) => `${marker.enemyId}:${marker.outcome}`)
      .join(";");
    canvas.dataset.previewBlocked = blocked.map((marker) => marker.enemyId).join(",");

    for (const marker of markers) {
      const from = cellToPixels(marker.from);
      if (marker.outcome === "kill") {
        this.pointerPreviewLayer.addChild(
          new Graphics()
            .circle(from.x, from.y, 25)
            .fill({ color: 0x11131a, alpha: 0.82 })
            .stroke({ color: 0xff5c7a, width: 3, alpha: 0.95 })
            .moveTo(from.x - 16, from.y - 16)
            .lineTo(from.x + 16, from.y + 16)
            .moveTo(from.x + 16, from.y - 16)
            .lineTo(from.x - 16, from.y + 16)
            .stroke({ color: 0xff5c7a, width: 5, alpha: 0.95 }),
        );
        continue;
      }

      if (marker.outcome === "crush") {
        this.pointerPreviewLayer.addChild(
          new Graphics()
            .rect(
              marker.from.x * CELL_SIZE + 7,
              marker.from.y * CELL_SIZE + 7,
              CELL_SIZE - 14,
              CELL_SIZE - 14,
            )
            .fill({ color: 0xff8c42, alpha: 0.28 })
            .stroke({ color: 0xffd27d, width: 5, alpha: 1 }),
        );
        continue;
      }

      if (marker.outcome === "blocked") {
        this.pointerPreviewLayer.addChild(
          new Graphics()
            .circle(from.x, from.y, 13)
            .fill({ color: 0x11131a, alpha: 0.76 })
            .stroke({ color: 0x8791a4, width: 3, alpha: 0.9 }),
        );
        continue;
      }

      if (!marker.to) {
        continue;
      }
      const to = cellToPixels(marker.to);
      const color = marker.outcome === "water" ? 0xf2d06b : 0xffb86b;
      const directionX = to.x - from.x;
      const directionY = to.y - from.y;
      const length = Math.hypot(directionX, directionY) || 1;
      const unitX = directionX / length;
      const unitY = directionY / length;
      this.pointerPreviewLayer.addChild(
        new Graphics()
          .circle(from.x, from.y, 10)
          .fill({ color: 0x11131a, alpha: 0.72 })
          .moveTo(from.x, from.y)
          .lineTo(to.x, to.y)
          .moveTo(to.x, to.y)
          .lineTo(to.x - unitX * 16 - unitY * 8, to.y - unitY * 16 + unitX * 8)
          .moveTo(to.x, to.y)
          .lineTo(to.x - unitX * 16 + unitY * 8, to.y - unitY * 16 - unitX * 8)
          .stroke({ color, width: 4, alpha: 0.85 }),
        new Graphics()
          .rect(
            marker.to.x * CELL_SIZE + 6,
            marker.to.y * CELL_SIZE + 6,
            CELL_SIZE - 12,
            CELL_SIZE - 12,
          )
          .fill({ color, alpha: 0.28 })
          .stroke({ color, width: 5, alpha: 1 }),
      );
    }
  }

  private clearPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host) {
      return;
    }
    const canvas = this.app.canvas;
    delete canvas.dataset.pointerMode;
    delete canvas.dataset.attackPreviewCell;
    delete canvas.dataset.attackTarget;
    delete canvas.dataset.selectedMobility;
    delete canvas.dataset.mobilityPreviewCell;
    delete canvas.dataset.mobilityPreviewValid;
    delete canvas.dataset.mobilityPreviewRetained;
    delete canvas.dataset.smashPreviewCell;
    delete canvas.dataset.smashPreviewValid;
    delete canvas.dataset.smashArmed;
    delete canvas.dataset.previewKills;
    delete canvas.dataset.previewDisplacements;
    delete canvas.dataset.previewTerminal;
    delete canvas.dataset.previewBlocked;
  }

  private createEntityView(entity: EntityState): EntityView {
    const root = new Container();
    root.label = entity.id;
    root.eventMode = "none";
    const hpBar = new Graphics();
    const guardBar = new Graphics();
    guardBar.visible = Boolean(entity.guard);

    const playerSprite =
      entity.kind === "player" ? createPlayerSprite(`character.${entity.archetype}`) : undefined;
    const enemyProfile =
      entity.kind === "enemy" && entity.presentationId
        ? getEnemyPresentationProfile(entity.presentationId)
        : undefined;
    const enemySpriteSheet = enemyProfile ? this.enemySpriteSheets[enemyProfile.sheet] : undefined;
    const waterAnimation = enemyProfile ? this.enemyWaterAnimations[enemyProfile.id] : undefined;
    const enemyPresentation =
      enemySpriteSheet && enemyProfile
        ? createEnemyPresentation(enemyProfile.id, enemySpriteSheet, waterAnimation, () =>
            this.refreshEnemyPresentationDataset(),
          )
        : undefined;
    const body =
      playerSprite?.body ??
      enemyPresentation?.body ??
      new Graphics()
        .roundRect(-22, -22, 44, 44, 10)
        .fill(0xffffff)
        .stroke({ color: 0x0a0c10, width: 4 });
    if (!playerSprite && !enemyPresentation) {
      body.tint = entityColor(entity);
    }

    const label = new Text({
      text:
        (entity.kind === "player" && playerSprite) || enemyPresentation
          ? ""
          : entity.kind === "player"
            ? "P"
            : "E",
      style: {
        fill: 0x10131a,
        fontFamily: "monospace",
        fontSize: 20,
        fontWeight: "700",
      },
    });
    label.anchor.set(0.5);
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
    debugLabel.position.set(0, -32);
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
    statusLabel.position.set(0, 29);
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
      facingMarker.position.set(entity.facing.x * 31, entity.facing.y * 31);
    }

    root.addChild(
      hpBar,
      guardBar,
      ...(playerSprite
        ? [playerSprite.root]
        : enemyPresentation
          ? [enemyPresentation.root]
          : [body]),
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
}

export function enemyPresentationLabel(id: EntityId, presentation: EnemyPresentation): string {
  const water = presentation.waterFrame === undefined ? "" : `:water:${presentation.waterFrame}`;
  return `${id}:${presentation.profileId}:${presentation.palette}:${presentation.pose}${water}`;
}
