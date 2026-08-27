import type { Composition } from "../core/types";
import { renderState } from "../core/renderState";
import { drawScene } from "./canvas2d";

/** Single Canvas2D paint path: evaluate `renderState`, then draw. */
export function paintComposition(
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  t: number,
  w: number,
  h: number,
): void {
  drawScene(ctx, renderState(comp, t), w, h);
}
