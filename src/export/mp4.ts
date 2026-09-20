import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Composition, ModuleAsset } from "../core/types";
import { renderFrame, type Size } from "./frame";
import type { ImageLookup } from "../render/canvas2d";

/**
 * The AVC level the frame actually needs. Levels cap the coded area, and encoding
 * is refused outright above the cap — 3.1 stops at 720p, which is smaller than the
 * composition sizes this app offers by default.
 */
export function avcCodec(w: number, h: number): string {
  // Macroblocks are 16px, so the coded area rounds up to a multiple of 16 per side.
  const area = Math.ceil(w / 16) * 16 * Math.ceil(h / 16) * 16;
  if (area <= 921_600) return "avc1.42001f"; // 3.1
  if (area <= 2_097_152) return "avc1.420028"; // 4.0
  if (area <= 3_211_264) return "avc1.420029"; // 4.1
  if (area <= 9_437_184) return "avc1.420033"; // 5.1
  return "avc1.420034"; // 5.2
}

export async function exportMp4(comp: Composition, library: ModuleAsset[], w = 800, h = 600, imageOf?: ImageLookup, source?: Size): Promise<Blob> {
  if (typeof VideoEncoder === "undefined") throw new Error("webcodecs not supported in this browser (use chrome or edge)");

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: w, height: h },
    fastStart: "in-memory",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  encoder.configure({ codec: avcCodec(w, h), width: w, height: h, bitrate: 6_000_000, framerate: comp.fps });

  const total = Math.max(1, Math.round(comp.duration * comp.fps));
  for (let f = 0; f < total; f++) {
    const t = f / total;
    renderFrame(ctx, comp, t, w, h, library, imageOf, source);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / comp.fps) });
    encoder.encode(frame, { keyFrame: f % comp.fps === 0 });
    frame.close();
  }

  await encoder.flush();
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
