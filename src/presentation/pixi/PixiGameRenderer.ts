import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
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
} from "../../core/actions/action-preview";
import {
  cardinalDirection,
  cellKey,
  sameCell,
  type Cell,
  type EntityId,
  type EntityState,
  type MobilityKind,
  type WorldSnapshot,
} from "../../core/model/types";
import {
  CELL_SIZE,
  INITIAL_AIM,
  resolveAimDirection,
  resolveAimDistance,
  screenPointToCell,
} from "./pointer-aim";
import {
  aggregateTelegraphLabels,
  formatTelegraphMultiplier,
  placeTelegraphLabels,
} from "./telegraph-labels";
import {
  createPlayerSprite,
  setNinjaSpriteSheet,
  type PlayerSprite,
  type PlayerSpritePose,
} from "./character-sprites";
import {
  createEnemyPresentation,
  type EnemyPresentation,
} from "./enemy-sprites";
import ninjaSpriteSheetUrl from "../../content/characters/assets/ninja/body-sprite-sheet.png";
import greenEnemySpriteSheetUrl from "../../content/enemies/assets/kappa-green-sprite-sheet.png";
import purpleEnemySpriteSheetUrl from "../../content/enemies/assets/kappa-purple-sprite-sheet.png";

export type PointerMode = "attack" | "mobility";
export type PointerCommit =
  | { readonly kind: "attack"; readonly direction: Cell }
  | { readonly kind: "dash"; readonly direction: Cell; readonly distance: number }
  | { readonly kind: "smash"; readonly target: Cell };

export interface PointerInputBinding {
  canInteract(): boolean;
  onPrimaryClick(commit: PointerCommit): void | Promise<void>;
}

interface EntityView {
  readonly root: Container;
  readonly body: Graphics | Sprite;
  readonly sprite?: PlayerSprite;
  readonly enemyPresentation?: EnemyPresentation;
  readonly label: Text;
  readonly facingMarker: Text;
  readonly debugLabel: Text;
  readonly statusLabel: Text;
  readonly hpBar: Graphics;
  readonly guardBar: Graphics;
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
  if (entity.kind === "player") return 0x6ed0ff;
  if (entity.phase === "drowning") return 0xf2d06b;
  if (entity.phase === "dead") return 0xff6b6b;
  if (entity.activity === "staggered") return 0xc79cff;
  if (entity.activity === "telegraphing") return 0xffb86b;
  if (entity.activity === "recovering") return 0xb5bfce;
  return 0xe8eef7;
}

function facingGlyph(facing: Cell | undefined): string {
  if (!facing) return "";
  if (facing.x > 0) return "→";
  if (facing.x < 0) return "←";
  if (facing.y > 0) return "↓";
  return "↑";
}

function debugStateLabel(entity: EntityState): string {
  if (entity.phase !== "alive") return entity.phase;
  if (entity.activity && entity.activity !== "ready") return entity.activity;
  return entity.lastDecision ?? "idle";
}

function combatStatusLabel(entity: EntityState): string {
  if (entity.phase !== "alive") return entity.phase.toUpperCase();
  if (entity.staggerTicks !== undefined) return `STAGGER ${entity.staggerTicks}`;
  if (entity.protectionTicks !== undefined) return `PROTECT ${entity.protectionTicks}`;
  if (entity.activity === "telegraphing") return `TELEGRAPH ${entity.committedAttack?.warningTicks ?? 0}`;
  if (entity.activity === "recovering") return `RECOVER ${entity.recoveryTicks ?? 0}`;
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
  bar.clear()
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

  private readonly entityViews = new Map<EntityId, EntityView>();
  private readonly transientEffects = new Set<Graphics>();
  private host: HTMLElement | undefined;
  private snapshot: WorldSnapshot | undefined;
  private pointerMode: PointerMode = "attack";
  private debugMode = false;
  private pointerCell: Cell | undefined;
  private lastAim: Cell = INITIAL_AIM;
  private playerFacing: Cell = INITIAL_AIM;
  private playerFacingLocked = false;
  private projectedPlayerMotionKey: string | undefined;
  private dashDistance = 3;
  private attackPreview: AttackPreview | undefined;
  private dashPreview: DashPreview | undefined;
  private retainedDashPreview: DashPreview | undefined;
  private smashPreview: SmashPreview | undefined;
  private victimPreviewMarkers: readonly PreviewVictimMarker[] = [];
  private pointerCleanup: (() => void) | undefined;
  private enemySpriteSheets: {
    green?: Texture;
    purple?: Texture;
  } = {};

  get transientCount(): number {
    return this.transientEffects.size;
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
    const [greenEnemySpriteSheet, purpleEnemySpriteSheet] = await Promise.all([
      Assets.load<Texture>(greenEnemySpriteSheetUrl),
      Assets.load<Texture>(purpleEnemySpriteSheetUrl),
    ]);
    this.enemySpriteSheets = {
      green: greenEnemySpriteSheet,
      purple: purpleEnemySpriteSheet,
    };

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
    this.pointerCleanup?.();
    this.pointerCleanup = undefined;
    this.clearPointerPreview();
    this.entityViews.clear();
    this.clearTransient();
    this.enemySpriteSheets = {};
    this.app.destroy(true, { children: true });
    this.host = undefined;
  }

  setPlayerAnimation(pose: PlayerSpritePose): void {
    const player = this.entityViews.get("player");
    player?.sprite?.setPose(pose);
    this.playerFacingLocked = pose !== "idle";
    if (this.host) this.app.canvas.dataset.playerAnimation = pose;
  }

  setPlayerFacing(facing: Cell, force = false): void {
    const direction = cardinalDirection(facing);
    if (!direction) return;
    if (this.playerFacingLocked && !force) return;
    if (sameCell(this.playerFacing, direction)) return;
    this.applyPlayerFacing(direction);
  }

  private applyPlayerFacing(direction: Cell): void {
    this.playerFacing = direction;
    this.entityViews.get("player")?.sprite?.setFacing(direction);
    if (this.host) this.app.canvas.dataset.playerFacing = `${direction.x},${direction.y}`;
  }

  sync(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.tick === 0) {
      this.lastAim = INITIAL_AIM;
      this.playerFacing = INITIAL_AIM;
      this.playerFacingLocked = false;
      this.projectedPlayerMotionKey = undefined;
      this.dashPreview = undefined;
      this.retainedDashPreview = undefined;
      this.smashPreview = undefined;
      this.victimPreviewMarkers = [];
    }
    this.drawArena(snapshot);
    this.projectSnapshot(snapshot);

    this.refreshPointerPreview();
  }

  updateSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (this.debugMode) this.drawArena(snapshot);
    this.projectSnapshot(snapshot);
    this.refreshPointerPreview();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.app.canvas.dataset.debugMode = String(enabled);
    if (this.snapshot) {
      this.drawArena(this.snapshot);
      this.projectSnapshot(this.snapshot);
    }
  }

  private projectSnapshot(snapshot: WorldSnapshot): void {
    this.drawReservations(snapshot);
    this.drawTelegraphs(snapshot);
    this.projectPlayerFacing(snapshot);

    const liveIds = new Set(snapshot.entities.map((entity) => entity.id));
    for (const [id, view] of this.entityViews) {
      if (!liveIds.has(id)) {
        view.root.destroy({ children: true });
        this.entityViews.delete(id);
      }
    }

    for (const entity of snapshot.entities) {
      let view = this.entityViews.get(entity.id);
      if (!view) {
        view = this.createEntityView(entity);
        this.entityViews.set(entity.id, view);
        this.actorLayer.addChild(view.root);
      }

      if (!this.isAnimatedByLastEvents(snapshot, entity.id)) {
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
        if (view.sprite.pose === "idle") view.sprite.setFacing(this.playerFacing);
        view.body.tint = 0xffffff;
        this.app.canvas.dataset.playerProfile = view.sprite.profileId;
        this.app.canvas.dataset.playerFacing = `${this.playerFacing.x},${this.playerFacing.y}`;
        this.app.canvas.dataset.playerAnimation ??= "idle";
      } else if (this.host && entity.kind === "player") {
        delete this.app.canvas.dataset.playerProfile;
        delete this.app.canvas.dataset.playerFacing;
        this.app.canvas.dataset.playerAnimation = "idle";
      }
      view.root.alpha = 1;
      view.root.scale.set(1);
      drawStatusBar(view.hpBar, entity.hp, entity.maxHp, 0xff5c7a, entity.kind === "enemy" ? -42 : -34);
      view.guardBar.visible = Boolean(entity.guard);
      if (entity.guard) drawStatusBar(view.guardBar, entity.guard.current, entity.guard.max, 0x72d4ff, -36);
      view.label.text = entity.kind === "player" && view.sprite || view.enemyPresentation
        ? ""
        : entity.kind === "player"
          ? "P"
          : "E";
      view.label.visible = entity.kind !== "player" || !view.sprite;
      view.facingMarker.visible = entity.kind === "enemy" && Boolean(entity.facing);
      view.facingMarker.text = facingGlyph(entity.facing);
      if (entity.facing) view.facingMarker.position.set(entity.facing.x * 31, entity.facing.y * 31);
      view.debugLabel.visible = this.debugMode && entity.kind === "enemy";
      view.debugLabel.text = debugStateLabel(entity);
      view.statusLabel.visible = entity.kind === "enemy" && Boolean(combatStatusLabel(entity));
      view.statusLabel.text = combatStatusLabel(entity);
    }
    if (this.host) {
      this.app.canvas.dataset.enemyPresentations = snapshot.entities
        .map((entity) => {
          const presentation = this.entityViews.get(entity.id)?.enemyPresentation;
          if (entity.kind !== "enemy" || !presentation) return undefined;
          return `${entity.id}:${presentation.profileId}:${presentation.palette}:${presentation.pose}`;
        })
        .filter((value): value is string => value !== undefined)
        .join("|");
    }
  }

  private projectPlayerFacing(snapshot: WorldSnapshot): void {
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
    if (!motionKey || motionKey === this.projectedPlayerMotionKey || !motionFrom || !motionTo) return;
    this.projectedPlayerMotionKey = motionKey;
    this.playerFacingLocked = true;
    const direction = { x: Math.sign(motionTo.x - motionFrom.x), y: Math.sign(motionTo.y - motionFrom.y) };
    if (Math.abs(direction.x) + Math.abs(direction.y) === 1) {
      this.playerFacing = direction;
    }
  }

  private isAnimatedByLastEvents(snapshot: WorldSnapshot, entityId: EntityId): boolean {
    return snapshot.lastEvents.some((event) => {
      switch (event.type) {
        case "actor_moved":
          return event.entityId === entityId;
        case "player_dashed":
          return event.actorId === entityId;
        case "enemy_moved":
        case "enemy_knocked":
        case "enemy_entered_water":
          return event.enemyId === entityId;
        default:
          return false;
      }
    });
  }

  setPointerMode(mode: PointerMode): void {
    if (this.pointerMode === mode) return;
    this.pointerMode = mode;
    this.dashPreview = undefined;
    this.retainedDashPreview = undefined;
    this.smashPreview = undefined;
    this.refreshPointerPreview();
  }

  bindPointerInput(binding: PointerInputBinding): () => void {
    this.pointerCleanup?.();

    const canvas = this.app.canvas;
    const onPointerMove = (event: PointerEvent) => {
      const nextPointerCell = this.pointerToCell(event);
      if (nextPointerCell && this.pointerCell && sameCell(nextPointerCell, this.pointerCell)) return;
      this.pointerCell = nextPointerCell;
      this.refreshPointerPreview(true);
    };
    const onPointerLeave = () => {
      this.pointerCell = undefined;
      this.attackPreview = undefined;
      this.dashPreview = undefined;
      this.retainedDashPreview = undefined;
      this.smashPreview = undefined;
      this.victimPreviewMarkers = [];
      if (this.snapshot?.armedSmashTarget) this.refreshPointerPreview();
      else this.clearPointerPreview();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !binding.canInteract()) return;
      this.refreshPointerPreview();
      if (this.snapshot?.armedSmashTarget) {
        if (!this.smashPreview?.accepted) return;
        event.preventDefault();
        void binding.onPrimaryClick({ kind: "smash", target: this.smashPreview.target });
        return;
      }
      if (this.pointerMode === "attack") {
        if (!this.attackPreview?.accepted) return;
        event.preventDefault();
        this.lastAim = this.attackPreview.direction;
        void binding.onPrimaryClick({ kind: "attack", direction: this.attackPreview.direction });
        return;
      }
      if (this.activeMobility() === "dash") {
        if (!this.dashPreview?.accepted) return;
        event.preventDefault();
        this.lastAim = this.dashPreview.direction;
        void binding.onPrimaryClick({
          kind: "dash",
          direction: this.dashPreview.direction,
          distance: this.dashDistance,
        });
        return;
      }
      if (!this.smashPreview?.accepted) return;
      event.preventDefault();
      void binding.onPrimaryClick({ kind: "smash", target: this.smashPreview.target });
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      if (this.pointerCleanup === cleanup) this.pointerCleanup = undefined;
    };
    this.pointerCleanup = cleanup;
    return cleanup;
  }

  getEntityView(id: EntityId): Container | undefined {
    return this.entityViews.get(id)?.root;
  }

  removeEntityView(id: EntityId): void {
    const view = this.entityViews.get(id);
    if (!view) return;
    view.root.destroy({ children: true });
    this.entityViews.delete(id);
    if (id === "player" && this.host) {
      delete this.app.canvas.dataset.playerProfile;
      delete this.app.canvas.dataset.playerFacing;
      this.app.canvas.dataset.playerAnimation = "idle";
    }
  }

  getEnemyPresentation(id: EntityId): EnemyPresentation | undefined {
    return this.entityViews.get(id)?.enemyPresentation;
  }

  resetEnemyPresentations(): void {
    for (const view of this.entityViews.values()) view.enemyPresentation?.reset();
    this.refreshEnemyPresentationDataset();
  }

  refreshEnemyPresentationDataset(): void {
    if (!this.host) return;
    this.app.canvas.dataset.enemyPresentations = [...this.entityViews.entries()]
      .map(([id, view]) => {
        const presentation = view.enemyPresentation;
        if (!presentation) return undefined;
        return `${id}:${presentation.profileId}:${presentation.palette}:${presentation.pose}`;
      })
      .filter((value): value is string => value !== undefined)
      .join("|");
  }

  getEntityBounds(id: EntityId): ScreenBounds | undefined {
    const view = this.entityViews.get(id);
    const canvas = this.app.canvas;
    if (!view || !this.host || !canvas) return undefined;

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

  createImpact(cell: Cell): Graphics {
    const pixels = cellToPixels(cell);
    const effect = new Graphics()
      .circle(0, 0, CELL_SIZE * 0.22)
      .stroke({ color: 0xffffff, width: 5, alpha: 0.9 });
    effect.position.set(pixels.x, pixels.y);
    this.effectsLayer.addChild(effect);
    this.transientEffects.add(effect);
    return effect;
  }

  releaseTransient(effect: Graphics): void {
    this.transientEffects.delete(effect);
    if (!effect.destroyed) effect.destroy({ children: true });
  }

  clearTransient(): void {
    for (const effect of this.transientEffects) {
      if (!effect.destroyed) effect.destroy({ children: true });
    }
    this.transientEffects.clear();
    this.effectsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  cellToPixels(cell: Cell): { x: number; y: number } {
    return cellToPixels(cell);
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

  private refreshPointerPreview(allowFacingUpdate = false): void {
    if (!this.snapshot) {
      this.attackPreview = undefined;
      this.dashPreview = undefined;
      this.retainedDashPreview = undefined;
      this.smashPreview = undefined;
      this.victimPreviewMarkers = [];
      this.clearPointerPreview();
      return;
    }

    const player = this.snapshot.entities.find((entity) => entity.id === "player" && entity.phase === "alive");
    if (!player) {
      this.attackPreview = undefined;
      this.dashPreview = undefined;
      this.smashPreview = undefined;
      this.victimPreviewMarkers = [];
      this.clearPointerPreview();
      return;
    }

    this.attackPreview = undefined;
    this.dashPreview = undefined;
    this.smashPreview = undefined;
    this.victimPreviewMarkers = [];

    if (this.snapshot.armedSmashTarget) {
      if (allowFacingUpdate) {
        this.setPlayerFacing(resolveAimDirection(this.snapshot.armedSmashTarget, player.cell, this.lastAim));
      }
      this.smashPreview = previewSmash(this.snapshot, player.id, this.snapshot.armedSmashTarget);
      this.victimPreviewMarkers = previewSmashVictimMarkers(this.smashPreview);
      this.drawPointerPreview();
      return;
    }

    if (!this.pointerCell) {
      this.clearPointerPreview();
      return;
    }

    const direction = resolveAimDirection(this.pointerCell, player.cell, this.lastAim);
    if (allowFacingUpdate) this.setPlayerFacing(direction);

    if (this.pointerMode === "attack" && !this.snapshot?.armedSmashTarget) {
      this.attackPreview = previewAttack(this.snapshot, player.id, direction);
      this.victimPreviewMarkers = previewAttackVictimMarkers(this.attackPreview);
      this.drawPointerPreview();
      return;
    }

    const mobility = this.activeMobility();
    const range = player.mobility?.range ?? 3;
    if (mobility === "dash") {
      this.dashDistance = resolveAimDistance(this.pointerCell, player.cell, range);
      this.dashPreview = previewDash(this.snapshot, player.id, direction, this.dashDistance);
      this.victimPreviewMarkers = previewDashVictimMarkers(this.dashPreview);
      if (this.dashPreview.accepted) this.retainedDashPreview = this.dashPreview;
    } else {
      this.smashPreview = previewSmash(
        this.snapshot,
        player.id,
        clampSmashTarget(this.pointerCell, player.cell, range),
      );
      this.victimPreviewMarkers = previewSmashVictimMarkers(this.smashPreview);
    }
    this.drawPointerPreview();
  }

  private drawPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
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
    canvas.dataset.pointerMode = this.pointerMode;
    canvas.dataset.selectedMobility = this.activeMobility();

    if (this.pointerMode === "attack" && !this.snapshot?.armedSmashTarget) {
      const preview = this.attackPreview;
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

    if (this.activeMobility() === "smash" || this.snapshot?.armedSmashTarget) {
      const preview = this.smashPreview;
      canvas.dataset.smashPreviewValid = String(Boolean(preview?.accepted));
      canvas.dataset.smashArmed = String(Boolean(this.snapshot?.armedSmashTarget));
      if (!preview) {
        this.drawVictimMarkers();
        return;
      }
      for (const cell of preview.area) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 8, cell.y * CELL_SIZE + 8, CELL_SIZE - 16, CELL_SIZE - 16)
          .fill({ color: preview.accepted ? 0x72d4ff : 0x8791a4, alpha: preview.accepted ? 0.2 : 0.12 });
        this.pointerPreviewLayer.addChild(marker);
      }
      const center = preview.target;
      const centerMarker = new Graphics()
        .rect(center.x * CELL_SIZE + 5, center.y * CELL_SIZE + 5, CELL_SIZE - 10, CELL_SIZE - 10)
        .stroke({ color: preview.accepted ? 0x72d4ff : 0xff6b6b, width: 5, alpha: 0.95 });
      this.pointerPreviewLayer.addChild(centerMarker);
      if (preview.accepted) {
        const virtualPlayer = new Graphics()
          .circle(center.x * CELL_SIZE + CELL_SIZE / 2, center.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.28)
          .fill({ color: 0xf4fbff, alpha: 0.38 })
          .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
        this.pointerPreviewLayer.addChild(virtualPlayer);
      }
      canvas.dataset.smashPreviewCell = `${center.x},${center.y}`;
      this.drawVictimMarkers();
      return;
    }

    const preview = this.dashPreview;
    const retainedPreview = this.retainedDashPreview;
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
      .circle(landing.x * CELL_SIZE + CELL_SIZE / 2, landing.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.28)
      .fill({ color: 0xf4fbff, alpha: 0.38 })
      .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
    this.pointerPreviewLayer.addChild(landingMarker, virtualPlayer);
    canvas.dataset.mobilityPreviewCell = `${landing.x},${landing.y}`;
    this.drawVictimMarkers();
  }

  private drawVictimMarkers(): void {
    const canvas = this.app.canvas;
    const markers = this.victimPreviewMarkers;
    const kills = markers.filter((marker) => marker.outcome === "kill");
    const displacements = markers.filter(
      (marker) => (marker.outcome === "knockback" || marker.outcome === "water") && marker.to,
    );
    const terminal = markers.filter((marker) => marker.outcome === "crush" || marker.outcome === "water");
    const blocked = markers.filter((marker) => marker.outcome === "blocked");

    canvas.dataset.previewKills = kills.map((marker) => marker.enemyId).join(",");
    canvas.dataset.previewDisplacements = displacements
      .map((marker) => `${marker.enemyId}:${marker.from.x},${marker.from.y}>${marker.to?.x},${marker.to?.y}`)
      .join(";");
    canvas.dataset.previewTerminal = terminal.map((marker) => `${marker.enemyId}:${marker.outcome}`).join(";");
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
            .rect(marker.from.x * CELL_SIZE + 7, marker.from.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14)
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

      if (!marker.to) continue;
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
          .rect(marker.to.x * CELL_SIZE + 6, marker.to.y * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12)
          .fill({ color, alpha: 0.28 })
          .stroke({ color, width: 5, alpha: 1 }),
      );
    }
  }

  private clearPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host) return;
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

  private activeMobility(): MobilityKind {
    return this.snapshot?.entities.find((entity) => entity.kind === "player")?.mobility?.kind ?? "dash";
  }

  private drawArena(snapshot: WorldSnapshot): void {
    this.gridLayer.removeChildren().forEach((child) => child.destroy());

    for (let y = 0; y < snapshot.arena.height; y += 1) {
      for (let x = 0; x < snapshot.arena.width; x += 1) {
        const index = y * snapshot.arena.width + x;
        const tile = snapshot.arena.tiles[index];
        const color = tile === "wall" ? 0x282d3a : tile === "water" ? 0x174f73 : 0x1a1e27;
        const tileView = new Graphics()
          .rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          .fill(color)
          .stroke({ color: 0x343b4c, width: 1, alpha: 0.8 });
        this.gridLayer.addChild(tileView);
      }
    }
    if (this.debugMode) {
      this.drawDebugGridState(snapshot);
    } else if (this.host) {
      delete this.app.canvas.dataset.debugBlockedCount;
      delete this.app.canvas.dataset.debugBlockedCells;
      delete this.app.canvas.dataset.debugNavigationBlockerCount;
      delete this.app.canvas.dataset.debugNavigationBlockerCells;
    }
  }

  private drawDebugGridState(snapshot: WorldSnapshot): void {
    const blockedCells = new Set<string>();
    const occupiedCells = new Set<string>();
    const reservedCells = new Set<string>();

    for (let y = 0; y < snapshot.arena.height; y += 1) {
      for (let x = 0; x < snapshot.arena.width; x += 1) {
        const cell = { x, y };
        const tile = snapshot.arena.tiles[y * snapshot.arena.width + x];
        if (tile !== "floor") blockedCells.add(cellKey(cell));
      }
    }

    for (const entity of snapshot.entities) {
      if (entity.phase !== "alive") continue;
      for (const cell of [entity.cell, ...entity.footprint]) {
        const key = cellKey(cell);
        blockedCells.add(key);
        occupiedCells.add(key);
      }
    }

    for (const reservation of snapshot.reservations) {
      for (const cell of reservation.cells) {
        const key = cellKey(cell);
        reservedCells.add(key);
        blockedCells.add(key);
      }
    }

    for (const key of blockedCells) {
      const coordinates = key.split(",");
      const x = Number(coordinates[0]!);
      const y = Number(coordinates[1]!);
      const isReserved = reservedCells.has(key);
      const isOccupied = occupiedCells.has(key);
      const color = isReserved ? 0x9a7cff : isOccupied ? 0xff5c7a : 0xf2d06b;
      const alpha = isReserved && isOccupied ? 0.4 : 0.24;
      this.gridLayer.addChild(
        new Graphics()
          .rect(x * CELL_SIZE + 3, y * CELL_SIZE + 3, CELL_SIZE - 6, CELL_SIZE - 6)
          .fill({ color, alpha })
          .stroke({ color, width: 2, alpha: 0.8 }),
      );
    }

    if (!this.host) return;
    this.app.canvas.dataset.debugBlockedCount = String(blockedCells.size);
    this.app.canvas.dataset.debugBlockedCells = [...blockedCells].sort().join(";");
    this.app.canvas.dataset.debugNavigationBlockerCount = String(reservedCells.size);
    this.app.canvas.dataset.debugNavigationBlockerCells = [...reservedCells].sort().join(";");
  }

  private drawReservations(snapshot: WorldSnapshot): void {
    this.reservationLayer.removeChildren().forEach((child) => child.destroy());
    for (const reservation of snapshot.reservations) {
      for (const cell of reservation.cells) {
        const color = reservation.purpose === "attack" ? 0xff9c5c : 0x9a7cff;
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 5, cell.y * CELL_SIZE + 5, CELL_SIZE - 10, CELL_SIZE - 10)
          .stroke({ color, width: 3, alpha: 0.8 });
        this.reservationLayer.addChild(marker);
      }
    }
  }

  private drawTelegraphs(snapshot: WorldSnapshot): void {
    this.telegraphLayer.removeChildren().forEach((child) => child.destroy());
    this.telegraphLabelLayer.removeChildren().forEach((child) => child.destroy());
    for (const telegraph of snapshot.telegraphs) {
      for (const cell of telegraph.cells) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 12, cell.y * CELL_SIZE + 12, CELL_SIZE - 24, CELL_SIZE - 24)
          .fill({ color: telegraph.phase === "active" ? 0xff5c7a : 0xffd166, alpha: 0.22 });
        this.telegraphLayer.addChild(marker);
      }
    }

    const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
    const sources = snapshot.telegraphs.flatMap((telegraph) => {
      const ticks = entitiesById.get(telegraph.sourceId)?.committedAttack?.warningTicks;
      return ticks === undefined ? [] : [{ cells: telegraph.cells, ticks }];
    });
    const summaries = aggregateTelegraphLabels(sources);
    const occupiedCells = snapshot.entities.flatMap((entity) => [entity.cell, ...entity.footprint]);
    const placements = placeTelegraphLabels(summaries, occupiedCells);

    for (const placement of placements) {
      const primaryFontSize = placement.primary && placement.offset.y < 0 ? 36 : placement.primary ? 52 : 26;
      const multiplierFontSize = placement.primary && placement.offset.y < 0 ? 16 : placement.primary ? 22 : 14;
      const label = new Container();
      label.label = `telegraph-${placement.cell.x}-${placement.cell.y}-${placement.ticks}`;
      label.position.set(
        placement.cell.x * CELL_SIZE + CELL_SIZE / 2 + placement.offset.x * CELL_SIZE,
        placement.cell.y * CELL_SIZE + CELL_SIZE / 2 + placement.offset.y * CELL_SIZE,
      );

      const number = new Text({
        text: String(placement.ticks),
        style: {
          fill: 0xffffff,
          fontFamily: "monospace",
          fontSize: primaryFontSize,
          fontWeight: "700",
        },
      });
      number.anchor.set(0.5);
      label.addChild(number);

      const multiplier = formatTelegraphMultiplier(placement.count);
      if (multiplier) {
        const suffix = new Text({
          text: multiplier,
          style: {
            fill: 0xffffff,
            fontFamily: "monospace",
            fontSize: multiplierFontSize,
            fontWeight: "700",
          },
        });
        suffix.anchor.set(0, 0.5);
        suffix.position.set(number.width / 2 + primaryFontSize * 0.08, 0);
        label.addChild(suffix);
      }
      this.telegraphLabelLayer.addChild(label);
    }

    if (this.host) {
      this.app.canvas.dataset.telegraphLabels = placements
        .map((placement) => {
          const multiplier = formatTelegraphMultiplier(placement.count) ?? "";
          const position = placement.primary && placement.offset.y < 0 ? "@head" : placement.primary ? "@center" : "@side";
          return `${placement.cell.x},${placement.cell.y}:${placement.ticks}${multiplier}${position}`;
        })
        .join("|");
      this.app.canvas.dataset.telegraphSourceCount = String(snapshot.telegraphs.length);
      this.app.canvas.dataset.committedAttackCount = String(
        snapshot.entities.filter((entity) => entity.committedAttack !== undefined).length,
      );
    }
  }

  private createEntityView(entity: EntityState): EntityView {
    const root = new Container();
    root.label = entity.id;
    root.eventMode = "none";
    const hpBar = new Graphics();
    const guardBar = new Graphics();
    guardBar.visible = Boolean(entity.guard);

    const playerSprite = entity.kind === "player"
      ? createPlayerSprite(`character.${entity.archetype}`)
      : undefined;
    const enemySpriteSheet = entity.kind === "enemy"
      ? entity.archetype === "slash"
        ? this.enemySpriteSheets.purple
        : entity.archetype === "thrust"
          ? this.enemySpriteSheets.green
          : undefined
      : undefined;
    const enemyPresentation = enemySpriteSheet
      ? createEnemyPresentation(entity.archetype, enemySpriteSheet, () => this.refreshEnemyPresentationDataset())
      : undefined;
    const body = playerSprite?.body ?? enemyPresentation?.body ?? new Graphics()
      .roundRect(-22, -22, 44, 44, 10)
      .fill(0xffffff)
      .stroke({ color: 0x0a0c10, width: 4 });
    if (!playerSprite && !enemyPresentation) body.tint = entityColor(entity);

    const label = new Text({
      text: entity.kind === "player" && playerSprite || enemyPresentation ? "" : entity.kind === "player" ? "P" : "E",
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
    if (entity.facing) facingMarker.position.set(entity.facing.x * 31, entity.facing.y * 31);

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
      label,
      facingMarker,
      debugLabel,
      statusLabel,
      hpBar,
      guardBar,
    };
  }
}
