import { BOARD_ORIGIN, COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from "../../src/presentation/pixi/arena-layout";
import { CELL_SIZE } from "../../src/presentation/pixi/pointer-aim";

interface CanvasBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function canvasPointForCell(box: CanvasBox, x: number, y: number): { x: number; y: number } {
  return canvasPointForPixel(box, BOARD_ORIGIN.x + (x + 0.5) * CELL_SIZE, BOARD_ORIGIN.y + (y + 0.5) * CELL_SIZE);
}

export function canvasPointForPixel(box: CanvasBox, x: number, y: number): { x: number; y: number } {
  return {
    x: box.x + (x / COMPOSITION_WIDTH) * box.width,
    y: box.y + (y / COMPOSITION_HEIGHT) * box.height,
  };
}
