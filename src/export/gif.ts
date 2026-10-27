import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Composition, ModuleAsset } from "../core/types";
import { preloadFonts, renderFrame, type Size } from "./frame";
import type { ImageLookup } from "../render/canvas2d";

export async function exportGif(comp: Composition, library: ModuleAsset[], w = 800, h = 600, imageOf?: ImageLookup, source?: Size, options: { colors?: number } = {}): Promise<Blob> {
  await preloadFonts(comp);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  const gif = GIFEncoder();
  const total = Math.max(1, Math.round(comp.duration * comp.fps));
  const delay = Math.round(1000 / comp.fps);

  for (let f = 0; f < total; f++) {
    renderFrame(ctx, comp, f / total, w, h, library, imageOf, source);
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, options.colors ?? 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, w, h, { palette, delay });
    // Hands the thread back between frames, so the page stays alive while it works.
    await new Promise((r) => setTimeout(r));
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
}
