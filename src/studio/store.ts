import { create } from "zustand";
import { clamp } from "../core/math";
import type {
  Composition,
  Driver,
  KeyframeSet,
  ModuleData,
  Track,
  Transform,
} from "../core/types";
import { ensureImage, forgetImage } from "../render/images";
import { imageError } from "./files";
import { renderState } from "../core/renderState";
import { boundsHalf, clampToFrame } from "./selection";
import {
  newKeyframes,
  positionDrivers,
  shiftStops,
  type KeyProp,
  type PositionDriver,
  type Range,
  type SelectedPart,
} from "./modules";
import { clampFps } from "./composition";
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

/** A move's starting point, captured before the first pointer move. */
export type MoveAnchor = {
  base: { x: number; y: number };
  driven: PositionDriver[];
};

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
  background: "#ffffff",
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

const patchKeyframes = (
  track: Track,
  prop: string,
  patch: Partial<KeyframeSet>,
): Track => {
  const current = track.keyframes?.[prop];
  if (!current) return track;
  return { ...track, keyframes: { ...track.keyframes, [prop]: { ...current, ...patch } } };
};

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
  /** Which part of the selected element the inspector is focused on: one of its
   *  standalone keyframed properties, or one of its modules. */
  selectedPart: SelectedPart | null;
  viewport: Size;
  view: View;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleLoop: () => void;
  setDuration: (seconds: number) => void;
  setFps: (fps: number) => void;
  setResolution: (size: Size) => void;
  setBackground: (hex: string) => void;
  setDriver: (kind: Driver["kind"]) => void;
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
  importImages: (files: Iterable<File>) => Promise<void>;
  placeElement: (assetId: string, at?: Point) => void;
  removeAsset: (id: string) => void;
  select: (layerId: string | null) => void;
  selectPart: (layerId: string, part: SelectedPart | null) => void;
  renameLayer: (layerId: string, name: string) => void;
  addKeyframes: (layerId: string, prop: KeyProp) => void;
  removeKeyframes: (layerId: string, prop: KeyProp) => void;
  setKeyframeStops: (layerId: string, prop: KeyProp, stops: KeyframeSet["stops"]) => void;
  setKeyframeRange: (layerId: string, prop: KeyProp, range: Range) => void;
  removeModule: (layerId: string, index: number) => void;
  setModuleParams: (layerId: string, index: number, patch: Record<string, unknown>) => void;
  setModuleRange: (layerId: string, index: number, range: Range) => void;
  setLayerBase: (layerId: string, patch: Partial<Transform>) => void;
  moveAnchor: (layerId: string) => MoveAnchor | null;
  moveLayer: (layerId: string, anchor: MoveAnchor, dx: number, dy: number) => void;
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
  selectedPart: null,
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
    set((s) => ({ composition: { ...s.composition, fps: clampFps(fps) } }));
  },

  /**
   * A resolution change is a reframe: the new frame has to be refitted to the room
   * the viewport has, the same way a resize does it.
   */
  setResolution: (size) => {
    const { viewport, view } = get();
    const next = { ...view, scale: fitScale(viewport, size) };
    const pan = clampPan({ x: next.panX, y: next.panY }, next, size);
    set({ frame: size, view: { ...next, panX: pan.x, panY: pan.y } });
  },

  setBackground: (hex) => {
    set((s) => ({ composition: { ...s.composition, background: hex } }));
  },

  setDriver: (kind) => {
    set((s) => ({ composition: { ...s.composition, driver: { kind } } }));
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
      selectedPart: null,
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
        selectedPart: kept ? s.selectedPart : null,
      };
    });
  },

  select: (layerId) => set({ selectedId: layerId, selectedPart: null }),

  selectPart: (layerId, part) => set({ selectedId: layerId, selectedPart: part }),

  renameLayer: (layerId, name) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => ({
      ...tr,
      layer: { ...tr.layer, name },
    })));
  },

  /** Author motion directly on the element: two flat stops on its current value, so
   *  nothing moves until a value is edited. One set per property — asking again just
   *  opens the one that is already there. */
  addKeyframes: (layerId, prop) => {
    const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
    if (!track) return;
    const part: SelectedPart = { kind: "keyframes", property: prop };
    if (track.keyframes?.[prop]) {
      set({ selectedId: layerId, selectedPart: part });
      return;
    }
    const set_ = newKeyframes(prop, track.layer.base);
    set((s) => ({
      selectedId: layerId,
      selectedPart: part,
      ...patchTrack(s.composition, layerId, (tr) => ({
        ...tr,
        keyframes: { ...tr.keyframes, [prop]: set_ },
      })),
    }));
  },

  removeKeyframes: (layerId, prop) => {
    set((s) => ({
      selectedPart:
        s.selectedPart?.kind === "keyframes" && s.selectedPart.property === prop
          ? null
          : s.selectedPart,
      ...patchTrack(s.composition, layerId, (tr) => {
        const { [prop]: gone, ...rest } = tr.keyframes ?? {};
        void gone;
        return { ...tr, keyframes: rest };
      }),
    }));
  },

  setKeyframeStops: (layerId, prop, stops) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => patchKeyframes(tr, prop, { stops })));
  },

  /** The one writer for a standalone set's window — the block's edges are its only
   *  editor, the same way a module's range works. */
  setKeyframeRange: (layerId, prop, range) => {
    set((s) => patchTrack(s.composition, layerId, (tr) => patchKeyframes(tr, prop, { range })));
  },

  removeModule: (layerId, index) => {
    set((s) => ({
      // The stack shifts under the selection, so drop it rather than point it elsewhere.
      selectedPart:
        s.selectedPart?.kind === "module" && s.selectedPart.index === index
          ? null
          : s.selectedPart,
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

  /** Where an element's position is held right now — the snapshot a move is measured
   *  from, so applying the same drag twice lands in the same place. */
  moveAnchor: (layerId) => {
    const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
    if (!track) return null;
    return {
      base: { x: track.layer.base.x, y: track.layer.base.y },
      driven: positionDrivers(track),
    };
  },

  /**
   * Move an element by (dx, dy) from `anchor`, writing to whichever holder owns each
   * axis: a driving module's stops when there is one, `base` otherwise. One `set`, so
   * a drag that moves both axes still costs a single render.
   */
  moveLayer: (layerId, anchor, dx, dy) => {
    const by = { x: dx, y: dy };
    const driven = new Set(anchor.driven.map((d) => d.axis));
    set((s) =>
      patchTrack(s.composition, layerId, (tr) => {
        const base = { ...tr.layer.base };
        if (!driven.has("x")) base.x = anchor.base.x + dx;
        if (!driven.has("y")) base.y = anchor.base.y + dy;
        const modules = tr.modules.map((md, i) => {
          const drive = anchor.driven.find(
            (d) => d.part.kind === "module" && d.part.index === i,
          );
          if (!drive) return md;
          return {
            ...md,
            params: { ...md.params, stops: shiftStops(drive.stops, by[drive.axis]) },
          };
        });
        const keyframes = { ...tr.keyframes };
        for (const drive of anchor.driven) {
          if (drive.part.kind !== "keyframes") continue;
          const current = keyframes[drive.part.property];
          if (!current) continue;
          keyframes[drive.part.property] = {
            ...current,
            stops: shiftStops(drive.stops, by[drive.axis]),
          };
        }
        return { ...tr, layer: { ...tr.layer, base }, keyframes, modules };
      }),
    );
  },

  nudgeSelected: (dx, dy) => {
    const { selectedId, composition, assets, frame, moveAnchor, moveLayer } = get();
    const track = composition.tracks.find((tr) => tr.layer.id === selectedId);
    if (!track || !selectedId) return;
    const anchor = moveAnchor(selectedId);
    if (!anchor) return;
    const { base, source } = track.layer;
    const asset = source.kind === "image" ? assets.find((a) => a.id === source.value) : undefined;
    // Clamp the element's rendered box, then move by whatever the clamp allowed —
    // a driven axis still has to stay inside the frame.
    const rendered = renderState(composition, get().t).find((it) => it.id === selectedId);
    const at = rendered ?? { state: base };
    const wanted = { x: at.state.x + dx, y: at.state.y + dy };
    const bounded = asset
      ? clampToFrame(
          wanted,
          boundsHalf(at.state, { width: asset.naturalW, height: asset.naturalH }),
          frame,
        )
      : wanted;
    moveLayer(selectedId, anchor, bounded.x - at.state.x, bounded.y - at.state.y);
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
      selectedPart: null,
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.filter((tr) => tr.layer.id !== selectedId),
      },
    }));
  },
}));
