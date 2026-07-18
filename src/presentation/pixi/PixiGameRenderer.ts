import { Application, Container, Graphics, Text } from "pixi.js";
import { previewAttack, previewDash, type AttackPreview, type DashPreview } from "../../core/actions/action-preview";
import type { Cell, EntityId, EntityState, WorldSnapshot } from "../../core/model/types";
import { CELL_SIZE, INITIAL_AIM, resolveAimDirection, screenPointToCell } from "./pointer-aim";

export type PointerMode = "attack" | "mobility";

export interface PointerInputBinding {
  canInteract(): boolean;
  onPrimaryClick(mode: PointerMode, direction: Cell): void | Promise<void>;
}

interface EntityView {
  readonly root: Container;
  readonly body: Graphics;
  readonly label: Text;
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
  return 0xe8eef7;
}

export class PixiGameRenderer {
  readonly app = new Application();
  readonly worldLayer = new Container();
  readonly gridLayer = new Container();
  readonly telegraphLayer = new Container();
  readonly pointerPreviewLayer = new Container();
  readonly reservationLayer = new Container();
  readonly actorLayer = new Container();
  readonly effectsLayer = new Container();

  private readonly entityViews = new Map<EntityId, EntityView>();
  private readonly transientEffects = new Set<Graphics>();
  private host: HTMLElement | undefined;
  private snapshot: WorldSnapshot | undefined;
  private pointerMode: PointerMode = "attack";
  private pointerCell: Cell | undefined;
  private lastAim: Cell = INITIAL_AIM;
  private attackPreview: AttackPreview | undefined;
  private mobilityCandidate: DashPreview | undefined;
  private retainedMobilityPreview: DashPreview | undefined;
  private pointerCleanup: (() => void) | undefined;

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

    this.app.canvas.dataset.testid = "game-canvas";
    this.app.canvas.setAttribute("aria-label", "Tickstrike arena");
    host.replaceChildren(this.app.canvas);

    this.worldLayer.addChild(
      this.gridLayer,
      this.reservationLayer,
      this.telegraphLayer,
      this.pointerPreviewLayer,
      this.actorLayer,
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
    this.app.destroy(true, { children: true });
    this.host = undefined;
  }

  sync(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    if (snapshot.tick === 0) {
      this.lastAim = INITIAL_AIM;
      this.retainedMobilityPreview = undefined;
    }
    this.drawArena(snapshot);
    this.drawReservations(snapshot);
    this.drawTelegraphs(snapshot);

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

      const pixels = cellToPixels(entity.cell);
      view.root.position.set(pixels.x, pixels.y);
      view.body.tint = entityColor(entity);
      view.root.alpha = 1;
      view.root.scale.set(1);
      view.label.text = entity.kind === "player" ? "P" : "E";
    }

    this.refreshPointerPreview();
  }

  updateSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    this.refreshPointerPreview();
  }

  setPointerMode(mode: PointerMode): void {
    if (this.pointerMode === mode) return;
    this.pointerMode = mode;
    this.mobilityCandidate = undefined;
    this.retainedMobilityPreview = undefined;
    this.refreshPointerPreview();
  }

  bindPointerInput(binding: PointerInputBinding): () => void {
    this.pointerCleanup?.();

    const canvas = this.app.canvas;
    const onPointerMove = (event: PointerEvent) => {
      this.pointerCell = this.pointerToCell(event);
      this.refreshPointerPreview();
    };
    const onPointerLeave = () => {
      this.pointerCell = undefined;
      this.attackPreview = undefined;
      this.mobilityCandidate = undefined;
      this.retainedMobilityPreview = undefined;
      this.clearPointerPreview();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || !binding.canInteract()) return;
      this.refreshPointerPreview();
      const preview = this.pointerMode === "attack" ? this.attackPreview : this.mobilityCandidate;
      if (!preview?.accepted) return;
      event.preventDefault();
      this.lastAim = preview.direction;
      void binding.onPrimaryClick(this.pointerMode, preview.direction);
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

  private refreshPointerPreview(): void {
    if (!this.snapshot || !this.pointerCell) {
      this.attackPreview = undefined;
      this.mobilityCandidate = undefined;
      this.clearPointerPreview();
      return;
    }

    const player = this.snapshot.entities.find((entity) => entity.id === "player" && entity.phase === "alive");
    if (!player) {
      this.attackPreview = undefined;
      this.mobilityCandidate = undefined;
      this.clearPointerPreview();
      return;
    }

    const direction = resolveAimDirection(this.pointerCell, player.cell, this.lastAim);
    this.attackPreview = undefined;
    this.mobilityCandidate = undefined;

    if (this.pointerMode === "attack") {
      this.attackPreview = previewAttack(this.snapshot, player.id, direction);
      this.drawPointerPreview();
      return;
    }

    const candidate = previewDash(this.snapshot, player.id, direction);
    this.mobilityCandidate = candidate;
    if (candidate.accepted) this.retainedMobilityPreview = candidate;
    this.drawPointerPreview();
  }

  private drawPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    const canvas = this.app.canvas;
    delete canvas.dataset.attackPreviewCell;
    delete canvas.dataset.attackTarget;
    delete canvas.dataset.mobilityPreviewCell;
    delete canvas.dataset.mobilityPreviewValid;
    delete canvas.dataset.mobilityPreviewRetained;
    canvas.dataset.pointerMode = this.pointerMode;

    if (this.pointerMode === "attack") {
      const preview = this.attackPreview;
      if (!preview?.accepted) return;
      const color = preview.hasTarget ? 0x72d4ff : 0xff6b6b;
      const target = preview.target;
      const marker = new Graphics()
        .rect(target.x * CELL_SIZE + 7, target.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14)
        .fill({ color, alpha: preview.hasTarget ? 0.16 : 0.08 })
        .stroke({ color, width: 4, alpha: 0.95 });
      this.pointerPreviewLayer.addChild(marker);
      canvas.dataset.attackPreviewCell = `${target.x},${target.y}`;
      canvas.dataset.attackTarget = preview.hasTarget ? "enemy" : "empty";
      return;
    }

    const preview = this.retainedMobilityPreview;
    const candidate = this.mobilityCandidate;
    canvas.dataset.mobilityPreviewValid = String(Boolean(candidate?.accepted));
    canvas.dataset.mobilityPreviewRetained = String(Boolean(!candidate?.accepted && preview));
    if (!preview?.landing) return;

    for (const cell of preview.path) {
      const marker = new Graphics()
        .rect(cell.x * CELL_SIZE + 10, cell.y * CELL_SIZE + 10, CELL_SIZE - 20, CELL_SIZE - 20)
        .fill({ color: 0x72d4ff, alpha: 0.22 });
      this.pointerPreviewLayer.addChild(marker);
    }

    const landing = preview.landing;
    const landingMarker = new Graphics()
      .rect(landing.x * CELL_SIZE + 6, landing.y * CELL_SIZE + 6, CELL_SIZE - 12, CELL_SIZE - 12)
      .stroke({ color: 0x72d4ff, width: 5, alpha: 0.95 });
    const virtualPlayer = new Graphics()
      .circle(landing.x * CELL_SIZE + CELL_SIZE / 2, landing.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.28)
      .fill({ color: 0xf4fbff, alpha: 0.38 })
      .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
    this.pointerPreviewLayer.addChild(landingMarker, virtualPlayer);
    canvas.dataset.mobilityPreviewCell = `${landing.x},${landing.y}`;
  }

  private clearPointerPreview(): void {
    this.pointerPreviewLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host) return;
    const canvas = this.app.canvas;
    delete canvas.dataset.pointerMode;
    delete canvas.dataset.attackPreviewCell;
    delete canvas.dataset.attackTarget;
    delete canvas.dataset.mobilityPreviewCell;
    delete canvas.dataset.mobilityPreviewValid;
    delete canvas.dataset.mobilityPreviewRetained;
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
    for (const telegraph of snapshot.telegraphs) {
      for (const cell of telegraph.cells) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 12, cell.y * CELL_SIZE + 12, CELL_SIZE - 24, CELL_SIZE - 24)
          .fill({ color: telegraph.phase === "active" ? 0xff5c7a : 0xffd166, alpha: 0.22 });
        this.telegraphLayer.addChild(marker);
      }
    }
  }

  private createEntityView(entity: EntityState): EntityView {
    const root = new Container();
    root.label = entity.id;
    root.eventMode = "none";

    const body = new Graphics()
      .roundRect(-22, -22, 44, 44, 10)
      .fill(0xffffff)
      .stroke({ color: 0x0a0c10, width: 4 });
    body.tint = entityColor(entity);

    const label = new Text({
      text: entity.kind === "player" ? "P" : "E",
      style: {
        fill: 0x10131a,
        fontFamily: "monospace",
        fontSize: 20,
        fontWeight: "700",
      },
    });
    label.anchor.set(0.5);

    root.addChild(body, label);
    return { root, body, label };
  }
}
