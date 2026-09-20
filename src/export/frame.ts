import type { Composition } from "../core/types";
import { renderState } from "../core/renderState";
import { drawScene, type ImageLookup } from "../render/canvas2d";

/** The coordinate space a composition was authored in. */
export type Size = { width: number; height: number };

/**
 * One frame, drawn to fill `w` × `h`.
 *
 * Layers carry absolute coordinates, so rendering at a size other than the one the
 * composition was laid out in has to scale — without this it crops to the top-left
 * corner instead, and asking for a smaller file quietly returns a smaller crop.
 * `source` says what that layout size is; leaving it out keeps the old meaning,
 * which is that the output size and the layout size are the same.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  comp: Composition,
  t: number,
  w: number,
  h: number,
  imageOf?: ImageLookup,
  source?: Size,
): void {
  const from = source ?? { width: w, height: h };
  const paint = ctx as CanvasRenderingContext2D;
  paint.save();
  paint.scale(w / from.width, h / from.height);
  drawScene(paint, renderState(comp, t), from.width, from.height, imageOf, comp.background);
  paint.restore();
}
