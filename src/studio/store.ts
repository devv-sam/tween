import { create } from "zustand";
import { clamp } from "../core/math";
import type { Composition, ModuleData, Track, Transform } from "../core/types";
import { ensureImage, forgetImage } from "../render/images";
import { imageError } from "./files";
import { boundsHalf, clampToFrame } from "./selection";
import { newKeyframeModule, type KeyProp, type Range } from "./modules";
import { clampDuration } from "./ruler";
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

const patchTrack = (
  composition: Composition,
  layerId: string,
  fn: (track: Track) => Track,
): { composition: Composition } => ({
  composition: {
    ...composition,
    tracks: composition.tracks.map((tr) => (tr.layer.id === layerId ? fn(tr) : tr)),
  },
});

const patchModule = (
  modules: ModuleData[],
  index: number,
  fn: (md: ModuleData) => ModuleData,
): ModuleData[] => modules.map((md, i) => (i === index ? fn(md) : md));

type StudioState = {
  composition: Composition;
  assets: ImageAsset[];
  importError: string | null;
  frame: Size;
  t: number;
  playing: boolean;
  loop: boolean;
  selectedId: string | null;
  /** Index into the selected layer's module stack. The inspector layers its context
   *  on one panel, so the module selection hangs off the element selection. */
  selectedModule: number | null;
  viewport: Size;
  view: View;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleLoop: () => void;
  setDuration: (seconds: number) => void;
  setFps: (fps: number) => void;
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
  importImages: (files: Iterable<File>) => Promise<void>;
  placeElement: (assetId: string, at?: Point) => void;
  removeAsset: (id: string) => void;
  select: (layerId: string | null) => void;
  selectModule: (layerId: string, index: number | null) => void;
  renameLayer: (layerId: string, name: string) => void;
  addKeyframeModule: (layerId: string, prop: KeyProp) => void;
  removeModule: (layerId: string, index: number) => void;
  setModuleParams: (layerId: string, index: number, patch: Record<string, unknown>) => void;
  setModuleRange: (layerId: string, index: number, range: Range) => void;
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
  playing: false,
  loop: true,
  selectedId: null,
  selectedModule: null,
  viewport: { width: 0, height: 0 },
  view: { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 },

  // `t` is normalized over the composition — the playhead and the rAF loop both
  // land here, so the renderer has one clock to read.
  setT: (t) => set({ t: clamp(t, 0, 1) }),

  setPlaying: (playing) => set({ playing }),

  toggleLoop: () => set((s) => ({ loop: !s.loop })),

  setDuration: (seconds) => {
    set((s) => ({
      composition: { ...s.composition, duration: clampDuration(seconds) },
    }));
  },

  setFps: (fps) => {
    set((s) => ({
      composition: { ...s.composition, fps: clamp(Math.round(fps), 1, 120) },
    }));
  },

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
      selectedModule: null,
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
      const kept = tracks.some((tr) => tr.layer.id === s.selectedId);
      return {
        assets: s.assets.filter((a) => a.id !== id),
        composition: { ...s.composition, tracks },
        selectedId: kept ? s.selectedId : null,
        selectedModule: kept ? s.selectedModule : null,
      };
    });
  },

  select: (layerId) => set({ selectedId: layerId, selectedModule: null }),

  selectModule: (layerId, index) => set({ selectedId: layerId, selectedModule: index }),

  renameLayer: (layerId, name) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => ({
      ...tr,
      layer: { ...tr.layer, name },
    })));
  },

  addKeyframeModule: (layerId, prop) => {
    const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
    if (!track) return;
    const md = newKeyframeModule(prop, track.layer.base);
    set((s) => ({
      selectedModule: track.modules.length,
      ...patchTrack(s.composition, layerId, (tr) => ({
        ...tr,
        modules: [...tr.modules, md],
      })),
    }));
  },

  removeModule: (layerId, index) => {
    set((s) => ({
      // The stack shifts under the selection, so drop it rather than point it elsewhere.
      selectedModule: s.selectedModule === index ? null : s.selectedModule,
      ...patchTrack(s.composition, layerId, (tr) => ({
        ...tr,
        modules: tr.modules.filter((_, i) => i !== index),
      })),
    }));
  },

  setModuleParams: (layerId, index, patch) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => ({
      ...tr,
      modules: patchModule(tr.modules, index, (md) => ({
        ...md,
        params: { ...md.params, ...patch },
      })),
    })));
  },

  /** The one writer for a module's window. Both the inspector's start / end fields
   *  and the timeline block's drags land here. */
  setModuleRange: (layerId, index, range) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => ({
      ...tr,
      modules: patchModule(tr.modules, index, (md) => ({ ...md, range })),
    })));
  },

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
      selectedModule: null,
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.filter((tr) => tr.layer.id !== selectedId),
      },
    }));
  },
}));
