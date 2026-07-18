import { Application, Container, Graphics, Text } from "pixi.js";
import type { Cell, EntityId, EntityState, WorldSnapshot } from "../../core/model/types";

const CELL_SIZE = 64;

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
  readonly actorLayer = new Container();
  readonly effectsLayer = new Container();

  private readonly entityViews = new Map<EntityId, EntityView>();
  private host: HTMLElement | undefined;
  private snapshot: WorldSnapshot | undefined;

  async mount(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      width: 640,
      height: 512,
      antialias: true,
      background: 0x11131a,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.canvas.dataset.testid = "game-canvas";
    this.app.canvas.setAttribute("aria-label", "Tickstrike arena");
    host.replaceChildren(this.app.canvas);

    this.worldLayer.addChild(this.gridLayer, this.actorLayer, this.effectsLayer);
    this.app.stage.addChild(this.worldLayer);
  }

  destroy(): void {
    this.entityViews.clear();
    this.app.destroy(true, { children: true });
    this.host = undefined;
  }

  sync(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    this.drawArena(snapshot);

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
    return effect;
  }

  cellToPixels(cell: Cell): { x: number; y: number } {
    return cellToPixels(cell);
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
