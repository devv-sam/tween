import type { Composition } from "../core/types";
import { renderState } from "../core/renderState";
import { drawScene } from "../render/canvas2d";

export function renderFrame(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, comp: Composition, t: number, w: number, h: number): void {
  drawScene(ctx as CanvasRenderingContext2D, renderState(comp, t), w, h);
}
