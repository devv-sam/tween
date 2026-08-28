import { create } from "zustand";
import type { Composition, Track } from "../core/types";
import { ensureImage, forgetImage } from "../render/images";
import { imageError } from "./files";
import {
  DEFAULT_FRAME,
  DEFAULT_VIEW_SCALE,
  clampPan,
  isPannable,
  zoomAround,
  type Point,
  type Size,
  type View,
} from "./view";

export type ImageAsset = {
  id: string;
  kind: "image";
  src: string;
  name: string;
  naturalW: number;
  naturalH: number;
};

const emptyComposition = (): Composition => ({
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  tracks: [],
});

const centerOf = (frame: Size): Point => ({ x: frame.width / 2, y: frame.height / 2 });

function imageTrack(assetId: string, at: Point): Track {
  return {
    layer: {
      id: crypto.randomUUID(),
      source: { kind: "image", value: assetId },
      base: { x: at.x, y: at.y, scale: 1, rotation: 0, opacity: 1 },
    },
    modules: [],
  };
}

async function readImageAsset(file: File): Promise<ImageAsset> {
  const id = crypto.randomUUID();
  const src = URL.createObjectURL(file);
  try {
    const img = await ensureImage(id, src);
    return { id, kind: "image", src, name: file.name, naturalW: img.naturalWidth, naturalH: img.naturalHeight };
  } catch (err) {
    URL.revokeObjectURL(src);
    forgetImage(id);
    throw err;
  }
}

type StudioState = {
  composition: Composition;
  assets: ImageAsset[];
  importError: string | null;
  frame: Size;
  t: number;
  viewport: Size;
  view: View;
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
  importImages: (files: Iterable<File>) => Promise<void>;
  placeElement: (assetId: string, at?: Point) => void;
  removeAsset: (id: string) => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  composition: emptyComposition(),
  assets: [],
  importError: null,
  frame: DEFAULT_FRAME,
  t: 0,
  viewport: { width: 0, height: 0 },
  view: { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 },

  setViewport: (viewport) => {
    const { frame, view } = get();
    const pan = clampPan({ x: view.panX, y: view.panY }, view, frame);
    set({ viewport, view: { ...view, panX: pan.x, panY: pan.y } });
  },

  zoomAroundPoint: (screen, nextZoom) => {
    const { viewport, frame, view } = get();
    if (viewport.width < 1 || viewport.height < 1) return;
    set({ view: zoomAround(screen, nextZoom, viewport, frame, view) });
  },

  panBy: (dx, dy) => {
    const { frame, view } = get();
    if (!isPannable(view, frame)) return;
    const pan = clampPan({ x: view.panX + dx, y: view.panY + dy }, view, frame);
    set({ view: { ...view, panX: pan.x, panY: pan.y } });
  },

  resetZoom: () => {
    const { view } = get();
    set({ view: { ...view, zoom: 1, panX: 0, panY: 0 } });
  },

  importImages: async (files) => {
    let importError: string | null = null;
    const added: ImageAsset[] = [];
    for (const file of files) {
      const err = imageError(file);
      if (err) {
        importError = err;
        continue;
      }
      try {
        added.push(await readImageAsset(file));
      } catch {
        importError = imageError(file) ?? "tween takes png, jpg, or webp.";
      }
    }
    if (added.length === 0) {
      set({ importError });
      return;
    }
    set((s) => ({
      assets: [...s.assets, ...added],
      importError,
    }));
  },

  placeElement: (assetId, at) => {
    const { assets, frame } = get();
    if (!assets.some((a) => a.id === assetId)) return;
    const place = at ?? centerOf(frame);
    set((s) => ({
      composition: {
        ...s.composition,
        tracks: [...s.composition.tracks, imageTrack(assetId, place)],
      },
    }));
  },

  removeAsset: (id) => {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    URL.revokeObjectURL(asset.src);
    forgetImage(id);
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.filter(
          (tr) => !(tr.layer.source.kind === "image" && tr.layer.source.value === id),
        ),
      },
    }));
  },
}));
