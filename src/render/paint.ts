import type { Composition, ModuleAsset } from "../core/types";
import { renderState } from "../core/renderState";
import { drawScene, type ImageLookup } from "./canvas2d";

/** Single Canvas2D paint path: evaluate `renderState`, then draw. */
export function paintComposition(
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  t: number,
  w: number,
  h: number,
  library: ModuleAsset[],
  imageOf?: ImageLookup,
): void {
  drawScene(ctx, renderState(comp, t, library), w, h, imageOf);
}
