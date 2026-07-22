import { Application, Container, Graphics, Text } from "pixi.js";
import { cellKey, type WorldSnapshot } from "@core/model/types";
import { CELL_SIZE } from "./pointer-aim";
import { aggregateTelegraphLabels, formatTelegraphMultiplier, placeTelegraphLabels } from "./telegraph-labels";

/**
 * Draws the static board — arena tiles, the debug occupancy overlay, reservation
 * outlines, and telegraph cells with their aggregated countdown labels — into
 * renderer-owned layers from a snapshot. It decides no gameplay and holds no
 * pointer or entity-view state; the renderer keeps `debugMode` (entity views
 * read it too) and passes it in. The `data-*` datasets these methods write are
 * asserted by the browser suite and must stay byte-for-byte identical.
 */
export class BoardPainter {
  constructor(
    private readonly app: Application,
    private readonly gridLayer: Container,
    private readonly reservationLayer: Container,
    private readonly telegraphLayer: Container,
    private readonly telegraphLabelLayer: Container,
    private readonly host: () => HTMLElement | undefined,
  ) {}

  drawArena(snapshot: WorldSnapshot, debugMode: boolean): void {
    this.gridLayer.removeChildren().forEach((child) => child.destroy());

    // Tile fills are painted by the terrain layer beneath; this layer keeps only the grid lines
    // (over the terrain) and the debug occupancy overlay.
    for (let y = 0; y < snapshot.arena.height; y += 1) {
      for (let x = 0; x < snapshot.arena.width; x += 1) {
        const tileView = new Graphics()
          .rect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          .stroke({ color: 0x343b4c, width: 1, alpha: 0.8 });
        this.gridLayer.addChild(tileView);
      }
    }
    if (debugMode) {
      this.drawDebugGridState(snapshot);
    } else if (this.host()) {
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
        if (tile !== "floor") {
          blockedCells.add(cellKey(cell));
        }
      }
    }

    for (const entity of snapshot.entities) {
      if (entity.phase !== "alive") {
        continue;
      }
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

    if (!this.host()) {
      return;
    }
    this.app.canvas.dataset.debugBlockedCount = String(blockedCells.size);
    this.app.canvas.dataset.debugBlockedCells = [...blockedCells].sort().join(";");
    this.app.canvas.dataset.debugNavigationBlockerCount = String(reservedCells.size);
    this.app.canvas.dataset.debugNavigationBlockerCells = [...reservedCells].sort().join(";");
  }

  drawReservations(snapshot: WorldSnapshot): void {
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

  drawTelegraphs(snapshot: WorldSnapshot): void {
    this.telegraphLayer.removeChildren().forEach((child) => child.destroy());
    this.telegraphLabelLayer.removeChildren().forEach((child) => child.destroy());
    for (const telegraph of snapshot.telegraphs) {
      const color = telegraph.phase === "active" ? 0xff5c7a : telegraph.phase === "spawning" ? 0x9a7cff : 0xffd166;
      for (const cell of telegraph.cells) {
        const marker = new Graphics()
          .rect(cell.x * CELL_SIZE + 12, cell.y * CELL_SIZE + 12, CELL_SIZE - 24, CELL_SIZE - 24)
          .fill({ color, alpha: 0.22 });
        this.telegraphLayer.addChild(marker);
      }
    }

    const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));
    const sources = snapshot.telegraphs.flatMap((telegraph) => {
      const ticks = telegraph.remainingTicks ?? entitiesById.get(telegraph.sourceId)?.committedAttack?.warningTicks;
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

    if (this.host()) {
      this.app.canvas.dataset.telegraphLabels = placements
        .map((placement) => {
          const multiplier = formatTelegraphMultiplier(placement.count) ?? "";
          const position =
            placement.primary && placement.offset.y < 0 ? "@head" : placement.primary ? "@center" : "@side";
          return `${placement.cell.x},${placement.cell.y}:${placement.ticks}${multiplier}${position}`;
        })
        .join("|");
      this.app.canvas.dataset.telegraphSourceCount = String(snapshot.telegraphs.length);
      this.app.canvas.dataset.spawnTelegraphCount = String(
        snapshot.telegraphs.filter((telegraph) => telegraph.phase === "spawning").length,
      );
      this.app.canvas.dataset.committedAttackCount = String(
        snapshot.entities.filter((entity) => entity.committedAttack !== undefined).length,
      );
    }
  }
}
