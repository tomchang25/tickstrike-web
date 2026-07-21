import { Application, Container, Graphics } from "pixi.js";
import type { PreviewVictimMarker } from "@core/actions/action-preview";
import type { Cell } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";
import type { PointerPreviewModel } from "./input-controller";

/**
 * Draws the pointer preview — attack marker, dash path/landing, smash area, and
 * the predicted victim markers — into a renderer-owned layer from the preview
 * model the {@link InputController} already computed. It decides nothing: the
 * model carries the accepted flags and geometry, and this painter only renders
 * them and writes the asserted `data-*` datasets. The `data-*` strings must stay
 * byte-for-byte identical; the browser suite asserts them.
 */
export class PreviewPainter {
  constructor(
    private readonly app: Application,
    private readonly layer: Container,
    private readonly host: () => HTMLElement | undefined,
    private readonly cellToPixels: (cell: Cell) => { x: number; y: number },
  ) {}

  draw(model: PointerPreviewModel): void {
    this.layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host()) {
      // An unmounted renderer has no canvas to draw on or tag, matching clear().
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
    canvas.dataset.pointerMode = model.pointerMode;
    canvas.dataset.selectedMobility = model.mobility;

    if (model.pointerMode === "attack" && !model.armedSmash) {
      const preview = model.attack;
      if (!preview?.accepted) {
        this.drawVictimMarkers(model.victims);
        return;
      }
      const color = preview.hasTarget ? 0x72d4ff : 0xff6b6b;
      const target = preview.target;
      const marker = new Graphics()
        .rect(target.x * CELL_SIZE + 7, target.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14)
        .fill({ color, alpha: preview.hasTarget ? 0.16 : 0.08 })
        .stroke({ color, width: 4, alpha: 0.95 });
      this.layer.addChild(marker);
      canvas.dataset.attackPreviewCell = `${target.x},${target.y}`;
      canvas.dataset.attackTarget = preview.hasTarget ? "enemy" : "empty";
      this.drawVictimMarkers(model.victims);
      return;
    }

    if (model.mobility === "smash" || model.armedSmash) {
      const preview = model.smash;
      canvas.dataset.smashPreviewValid = String(Boolean(preview?.accepted));
      canvas.dataset.smashArmed = String(model.armedSmash);
      if (!preview) {
        this.drawVictimMarkers(model.victims);
        return;
      }
      for (const cell of preview.area) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 8, cell.y * CELL_SIZE + 8, CELL_SIZE - 16, CELL_SIZE - 16)
          .fill({
            color: preview.accepted ? 0x72d4ff : 0x8791a4,
            alpha: preview.accepted ? 0.2 : 0.12,
          });
        this.layer.addChild(marker);
      }
      const center = preview.target;
      const centerMarker = new Graphics()
        .rect(center.x * CELL_SIZE + 5, center.y * CELL_SIZE + 5, CELL_SIZE - 10, CELL_SIZE - 10)
        .stroke({ color: preview.accepted ? 0x72d4ff : 0xff6b6b, width: 5, alpha: 0.95 });
      this.layer.addChild(centerMarker);
      if (preview.accepted) {
        const virtualPlayer = new Graphics()
          .circle(
            center.x * CELL_SIZE + CELL_SIZE / 2,
            center.y * CELL_SIZE + CELL_SIZE / 2,
            CELL_SIZE * 0.28,
          )
          .fill({ color: 0xf4fbff, alpha: 0.38 })
          .stroke({ color: 0x72d4ff, width: 3, alpha: 0.8 });
        this.layer.addChild(virtualPlayer);
      }
      canvas.dataset.smashPreviewCell = `${center.x},${center.y}`;
      this.drawVictimMarkers(model.victims);
      return;
    }

    const preview = model.dash;
    const retainedPreview = model.retainedDash;
    canvas.dataset.mobilityPreviewValid = String(Boolean(preview?.accepted));
    canvas.dataset.mobilityPreviewRetained = String(Boolean(!preview?.accepted && retainedPreview));
    const visiblePreview = preview?.accepted ? preview : retainedPreview;
    if (!visiblePreview?.landing) {
      this.drawVictimMarkers(model.victims);
      return;
    }

    for (const cell of visiblePreview.path) {
      const marker = new Graphics()
        .rect(cell.x * CELL_SIZE + 10, cell.y * CELL_SIZE + 10, CELL_SIZE - 20, CELL_SIZE - 20)
        .fill({ color: 0x72d4ff, alpha: 0.22 });
      this.layer.addChild(marker);
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
    this.layer.addChild(landingMarker, virtualPlayer);
    canvas.dataset.mobilityPreviewCell = `${landing.x},${landing.y}`;
    this.drawVictimMarkers(model.victims);
  }

  clear(): void {
    this.layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!this.host()) {
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

  private drawVictimMarkers(markers: readonly PreviewVictimMarker[]): void {
    const canvas = this.app.canvas;
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
      const from = this.cellToPixels(marker.from);
      if (marker.outcome === "kill") {
        this.layer.addChild(
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
        this.layer.addChild(
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
        this.layer.addChild(
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
      const to = this.cellToPixels(marker.to);
      const color = marker.outcome === "water" ? 0xf2d06b : 0xffb86b;
      const directionX = to.x - from.x;
      const directionY = to.y - from.y;
      const length = Math.hypot(directionX, directionY) || 1;
      const unitX = directionX / length;
      const unitY = directionY / length;
      this.layer.addChild(
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
}
