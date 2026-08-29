import { create } from "zustand";
import type { Composition, Track, Transform } from "../core/types";
import { ensureImage, forgetImage } from "../render/images";
import { imageError } from "./files";
import { boundsHalf, clampToFrame } from "./selection";
import {
  DEFAULT_FRAME,
  DEFAULT_VIEW_SCALE,
  clampPan,
  fitScale,
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

function imageTrack(id: string, assetId: string, at: Point): Track {
  return {
    layer: {
      id,
      source: { kind: "image", value: assetId },
      base: { x: at.x, y: at.y, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
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
  selectedId: string | null;
  viewport: Size;
  view: View;
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
  importImages: (files: Iterable<File>) => Promise<void>;
  placeElement: (assetId: string, at?: Point) => void;
  removeAsset: (id: string) => void;
  select: (layerId: string | null) => void;
  setLayerBase: (layerId: string, patch: Partial<Transform>) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  deleteSelected: () => void;
  toggleLayerLock: (layerId: string) => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  composition: emptyComposition(),
  assets: [],
  importError: null,
  frame: DEFAULT_FRAME,
  t: 0,
  selectedId: null,
  viewport: { width: 0, height: 0 },
  view: { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 },

  setViewport: (viewport) => {
    const { frame, view } = get();
    // Refit on every resize: the frame's screen size follows the room it has.
    const next = { ...view, scale: fitScale(viewport, frame) };
    const pan = clampPan({ x: next.panX, y: next.panY }, next, frame);
    set({ viewport, view: { ...next, panX: pan.x, panY: pan.y } });
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
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    // A drop near an edge lands the whole element inside, not straddling it.
    const place = clampToFrame(
      at ?? centerOf(frame),
      { x: asset.naturalW / 2, y: asset.naturalH / 2 },
      frame,
    );
    const layerId = crypto.randomUUID();
    set((s) => ({
      selectedId: layerId,
      composition: {
        ...s.composition,
        tracks: [...s.composition.tracks, imageTrack(layerId, assetId, place)],
      },
    }));
  },

  removeAsset: (id) => {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    URL.revokeObjectURL(asset.src);
    forgetImage(id);
    set((s) => {
      const tracks = s.composition.tracks.filter(
        (tr) => !(tr.layer.source.kind === "image" && tr.layer.source.value === id),
      );
      return {
        assets: s.assets.filter((a) => a.id !== id),
        composition: { ...s.composition, tracks },
        selectedId: tracks.some((tr) => tr.layer.id === s.selectedId) ? s.selectedId : null,
      };
    });
  },

  select: (layerId) => set({ selectedId: layerId }),

  setLayerBase: (layerId, patch) => {
    set((s) => ({
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.map((tr) =>
          tr.layer.id === layerId
            ? { ...tr, layer: { ...tr.layer, base: { ...tr.layer.base, ...patch } } }
            : tr,
        ),
      },
    }));
  },

  nudgeSelected: (dx, dy) => {
    const { selectedId, composition, assets, frame, setLayerBase } = get();
    const track = composition.tracks.find((tr) => tr.layer.id === selectedId);
    if (!track || !selectedId) return;
    const { base, source } = track.layer;
    const asset = source.kind === "image" ? assets.find((a) => a.id === source.value) : undefined;
    const wanted = { x: base.x + dx, y: base.y + dy };
    setLayerBase(
      selectedId,
      asset
        ? clampToFrame(
            wanted,
            boundsHalf(base, { width: asset.naturalW, height: asset.naturalH }),
            frame,
          )
        : wanted,
    );
  },

  toggleLayerLock: (layerId) => {
    set((s) => ({
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.map((tr) =>
          tr.layer.id === layerId
            ? { ...tr, layer: { ...tr.layer, lockAspect: !tr.layer.lockAspect } }
            : tr,
        ),
      },
    }));
  },

  deleteSelected: () => {
    const { selectedId } = get();
    if (!selectedId) return;
    set((s) => ({
      selectedId: null,
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.filter((tr) => tr.layer.id !== selectedId),
      },
    }));
  },
}));
