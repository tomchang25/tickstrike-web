import { Graphics } from "pixi.js";

export interface EntityShadowStyle {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly color: number;
  readonly alpha: number;
}

export function applyEntityShadowStyle(shadow: Graphics, style: EntityShadowStyle): void {
  shadow.clear().ellipse(style.offsetX, style.offsetY, style.radiusX, style.radiusY).fill({
    color: style.color,
    alpha: style.alpha,
  });
}

export function createEntityShadow(style: EntityShadowStyle): Graphics {
  const shadow = new Graphics();
  applyEntityShadowStyle(shadow, style);
  return shadow;
}
