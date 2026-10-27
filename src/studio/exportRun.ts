import { exportCode } from "../export/code";
import { downloadBlob, downloadText } from "../export/download";
import { exportGif } from "../export/gif";
import { exportMp4 } from "../export/mp4";
import type { ImageLookup } from "../render/canvas2d";
import { ensureImage, getCachedImage } from "../render/images";
import { exportContent, useStudio } from "./store";

export type ExportFormat = "mp4" | "webm" | "gif" | "png" | "canvas";

export const FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
  note: string;
  ready: boolean;
}[] = [
  { id: "mp4", label: "MP4", ext: "mp4", note: "H.264", ready: true },
  { id: "webm", label: "WebM", ext: "webm", note: "VP9", ready: false },
  { id: "gif", label: "GIF", ext: "gif", note: "256 colours at most", ready: true },
  { id: "png", label: "PNG", ext: "png", note: "Still frame", ready: false },
  { id: "canvas", label: "Canvas", ext: "html", note: "Canvas 2D", ready: true },
];

export const QUALITY_STOPS = ["Low", "Medium", "High", "Max"] as const;
const MP4_BITRATE = [2_000_000, 4_000_000, 6_000_000, 12_000_000];
const GIF_COLOURS = [32, 96, 192, 256];

export interface ExportSettings {
  format: ExportFormat;
  /** An index into `QUALITY_STOPS`. */
  quality: number;
  /** The share of the composition's size the file is drawn at. */
  scale: number;
  /** Frames per second, or the composition's own when null. */
  fps: number | null;
  name: string;
  minify: boolean;
  controls: boolean;
  loop: boolean;
}

export const DEFAULT_EXPORT: ExportSettings = {
  format: "mp4",
  quality: 2,
  scale: 1,
  fps: null,
  name: "comp-01",
  minify: false,
  controls: false,
  loop: true,
};

/** Video encoders want whole 2 px steps; nothing smaller than that is a picture. */
export const evenSize = (px: number): number => Math.max(2, Math.round(px / 2) * 2);

/** A name the OS will accept, never empty, without an extension the user typed twice. */
export function fileNameOf(name: string, ext: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(new RegExp(`\\.${ext}$`, "i"), "");
  return `${base || DEFAULT_EXPORT.name}.${ext}`;
}

/** Renders and downloads the studio's composition as the settings say. */
export async function runExport(s: ExportSettings): Promise<string> {
  const { composition, moduleLibrary, assets, frame } = useStudio.getState();
  const format = FORMATS.find((f) => f.id === s.format);
  if (!format?.ready) throw new Error(`${format?.label ?? s.format} is not available yet`);
  const name = fileNameOf(s.name, format.ext);

  if (s.format === "canvas") {
    const html = exportCode(composition, moduleLibrary, 60, exportContent(composition, assets), {
      loop: s.loop,
      controls: s.controls,
      minify: s.minify,
    });
    downloadText(html, name);
    return name;
  }

  await Promise.all(
    assets.filter((a) => a.kind === "image").map((a) => ensureImage(a.id, a.src).catch(() => null)),
  );
  const imageOf: ImageLookup = (id) => {
    const img = getCachedImage(id);
    return img && img.naturalWidth > 0
      ? { source: img, width: img.naturalWidth, height: img.naturalHeight }
      : undefined;
  };
  const comp = { ...composition, fps: s.fps ?? composition.fps };
  const w = evenSize(frame.width * s.scale);
  const h = evenSize(frame.height * s.scale);
  const blob =
    s.format === "gif"
      ? await exportGif(comp, moduleLibrary, w, h, imageOf, frame, {
          colors: GIF_COLOURS[s.quality],
        })
      : await exportMp4(comp, moduleLibrary, w, h, imageOf, frame, {
          bitrate: MP4_BITRATE[s.quality],
        });
  downloadBlob(blob, name);
  return name;
}
