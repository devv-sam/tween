import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Composition } from "../core/types";
import { renderFrame, type Size } from "./frame";
import type { ImageLookup } from "../render/canvas2d";

export function exportGif(comp: Composition, w = 800, h = 600, imageOf?: ImageLookup, source?: Size): Blob {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const gif = GIFEncoder();
  const total = Math.max(1, Math.round(comp.duration * comp.fps));
  const delay = Math.round(1000 / comp.fps);

  for (let f = 0; f < total; f++) {
    renderFrame(ctx, comp, f / total, w, h, imageOf, source);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}
