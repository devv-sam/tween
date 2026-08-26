import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Composition } from "../core/types";
import { renderFrame } from "./frame";

export async function exportMp4(comp: Composition, w = 800, h = 600): Promise<Blob> {
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
  encoder.configure({ codec: "avc1.42001f", width: w, height: h, bitrate: 6_000_000, framerate: comp.fps });

  const total = Math.max(1, Math.round(comp.duration * comp.fps));
  for (let f = 0; f < total; f++) {
    const t = f / total;
    renderFrame(ctx, comp, t, w, h);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / comp.fps) });
    encoder.encode(frame, { keyFrame: f % comp.fps === 0 });
    frame.close();
  }

  await encoder.flush();
  muxer.finalize();
  const { buffer } = muxer.target as ArrayBufferTarget;
  return new Blob([buffer], { type: "video/mp4" });
}
