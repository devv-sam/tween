import { create } from "zustand";
import { clamp } from "../core/math";
import { sampleStops } from "../core/curve";
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
  newPosition,
  positionDrivers,
  secondsToT,
  shiftStops,
  stopAtTime,
  type KeyProp,
  type KeyTarget,
  type PositionDriver,
  type Range,
  type SelectedPart,
} from "./modules";
import { clampFps } from "./composition";
import {
  emptyHistory,
  record,
  redo as redoHistory,
  seal,
  undo as undoHistory,
  type History,
} from "./history";
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
  /** Where the playhead was when the drag began, in seconds. Held here rather than
   *  read live so every move in one drag writes the same keyframe, and dropping in
   *  the same place twice lands the same value. */
  seconds: number;
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

/**
 * Everything undo puts back: the document, and the selection that was pointing into
 * it. The playhead, the zoom, and what is playing are not edits — Figma leaves them
 * alone across an undo, and so does this.
 */
type Snapshot = {
  composition: Composition;
  assets: ImageAsset[];
  frame: Size;
  selectedId: string | null;
  selectedPart: SelectedPart | null;
};

const snapshot = (s: StudioState): Snapshot => ({
  composition: s.composition,
  assets: s.assets,
  frame: s.frame,
  selectedId: s.selectedId,
  selectedPart: s.selectedPart,
});

/** A selection pointing at position, or at one of its axes, moved to whichever of
 *  the two the element now has. Anything else is left alone. */
const retargetPosition = (
  part: SelectedPart | null,
  separate: boolean,
): SelectedPart | null => {
  if (part?.kind !== "keyframes") return part;
  if (separate && part.property === "position")
    return { kind: "keyframes", property: "x" };
  if (!separate && (part.property === "x" || part.property === "y"))
    return { kind: "keyframes", property: "position" };
  return part;
};

/** The frame refitted to the room the viewport has — a reframe, wherever one comes
 *  from: a resolution change, a resize, or an undo of either. */
const refit = (viewport: Size, frame: Size, view: View): View => {
  const next = { ...view, scale: fitScale(viewport, frame) };
  const pan = clampPan({ x: next.panX, y: next.panY }, next, frame);
  return { ...next, panX: pan.x, panY: pan.y };
};

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
  /**
   * Which elements have their property rows open on the timeline, and which of that
   * element's keyframes are picked out on them.
   *
   * Both describe what is on screen rather than what the document holds, so neither
   * is snapshotted, undone, or saved. The picked keyframes are `property:index` ids,
   * read against whichever element `selectedId` names — the timeline puts them there
   * and the inspector edits whatever they point at.
   */
  expandedTracks: string[];
  selectedKeys: string[];
  viewport: Size;
  view: View;
  history: History<Snapshot>;
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
  toggleTrackExpanded: (layerId: string) => void;
  /** Pick a keyframe out on the timeline. `additive` adds to the picked set rather
   *  than replacing it, which is how a bundle is gathered. */
  selectKey: (layerId: string, id: string, additive?: boolean) => void;
  setSelectedKeys: (ids: string[]) => void;
  renameLayer: (layerId: string, name: string) => void;
  addKeyframes: (layerId: string, target: KeyTarget) => void;
  removeKeyframes: (layerId: string, target: KeyTarget) => void;
  setKeyframeStops: (layerId: string, prop: KeyProp, stops: KeyframeSet["stops"]) => void;
  /** Both axes of a combined position at once — they only ever move together. */
  setPositionStops: (
    layerId: string,
    stops: { x: KeyframeSet["stops"]; y: KeyframeSet["stops"] },
  ) => void;
  setKeyframeRange: (layerId: string, target: KeyTarget, range: Range) => void;
  setSeparatePosition: (layerId: string, separate: boolean) => void;
  removeModule: (layerId: string, index: number) => void;
  setModuleParams: (layerId: string, index: number, patch: Record<string, unknown>) => void;
  setModuleRange: (layerId: string, index: number, range: Range) => void;
  setLayerBase: (layerId: string, patch: Partial<Transform>) => void;
  /** The same patch, but landing in the keyframe under the playhead wherever the
   *  property carries its own motion. What a canvas gesture writes through. */
  captureTransform: (layerId: string, patch: Partial<Transform>) => void;
  moveAnchor: (layerId: string) => MoveAnchor | null;
  moveLayer: (layerId: string, anchor: MoveAnchor, dx: number, dy: number) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  deleteSelected: () => void;
  /** The picked keyframes, gone. A property whose last keyframe goes stops carrying
   *  motion — there is no curve left to be the one keyframe of. */
  removeSelectedKeys: () => void;
  toggleLayerLock: (layerId: string) => void;
  undo: () => void;
  redo: () => void;
  /** End the interaction the last edits belonged to, so the next one is its own step. */
  sealHistory: () => void;
};

export const useStudio = create<StudioState>((set, get) => {
  /**
   * The one door every document edit goes through: it records the state being
   * replaced before applying the change. `key` names the interaction the edit belongs
   * to — edits sharing an open key are one undo step — and null means "its own step".
   */
  const edit = (
    key: string | null,
    fn: (s: StudioState) => Partial<StudioState>,
  ): void =>
    set((s) => ({
      ...fn(s),
      history: record(s.history, snapshot(s), key, Date.now()),
    }));

  /** Put a snapshot back. A different frame is a reframe, so the view refits to it. */
  const restore = (s: StudioState, snap: Snapshot): Partial<StudioState> => ({
    ...snap,
    view: snap.frame === s.frame ? s.view : refit(s.viewport, snap.frame, s.view),
  });

  return {
    composition: emptyComposition(),
    assets: [],
    importError: null,
    frame: DEFAULT_FRAME,
    t: 0,
    playing: false,
    loop: true,
    selectedId: null,
    selectedPart: null,
    expandedTracks: [],
    selectedKeys: [],
    viewport: { width: 0, height: 0 },
    view: { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 },
    history: emptyHistory<Snapshot>(),

    // `t` is normalized over the composition — the playhead and the rAF loop both
    // land here, so the renderer has one clock to read.
    setT: (t) => set({ t: clamp(t, 0, 1) }),

    setPlaying: (playing) => set({ playing }),

    toggleLoop: () => set((s) => ({ loop: !s.loop })),

    setDuration: (seconds) => {
      edit("duration", (s) => ({
        composition: { ...s.composition, duration: clampDuration(seconds) },
      }));
    },

    setFps: (fps) => {
      edit(null, (s) => ({ composition: { ...s.composition, fps: clampFps(fps) } }));
    },

    /**
     * A resolution change is a reframe: the new frame has to be refitted to the room
     * the viewport has, the same way a resize does it.
     */
    setResolution: (size) => {
      edit(null, (s) => ({
        frame: size,
        view: refit(s.viewport, size, s.view),
      }));
    },

    setBackground: (hex) => {
      edit("background", (s) => ({
        composition: { ...s.composition, background: hex },
      }));
    },

    setDriver: (kind) => {
      edit(null, (s) => ({ composition: { ...s.composition, driver: { kind } } }));
    },

    setViewport: (viewport) => {
      const { frame, view } = get();
      // Refit on every resize: the frame's screen size follows the room it has.
      set({ viewport, view: refit(viewport, frame, view) });
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
      edit(null, (s) => ({
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
      edit(null, (s) => ({
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
      // The object URL outlives the removal on purpose: undo puts the asset back, and a
      // revoked URL would come back as a broken image. It is released with the tab.
      forgetImage(id);
      edit(null, (s) => {
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

    select: (layerId) =>
      set((s) => ({
        selectedId: layerId,
        selectedPart: null,
        // The picked keyframes are read against the selected element, so they mean
        // nothing once a different one is selected.
        selectedKeys: layerId === s.selectedId ? s.selectedKeys : [],
      })),

    selectPart: (layerId, part) =>
      set((s) => ({
        selectedId: layerId,
        selectedPart: part,
        selectedKeys: layerId === s.selectedId ? s.selectedKeys : [],
      })),

    toggleTrackExpanded: (layerId) =>
      set((s) => ({
        expandedTracks: s.expandedTracks.includes(layerId)
          ? s.expandedTracks.filter((id) => id !== layerId)
          : [...s.expandedTracks, layerId],
      })),

    selectKey: (layerId, id, additive = false) =>
      set((s) => {
        const same = layerId === s.selectedId;
        const held = same ? s.selectedKeys : [];
        return {
          selectedId: layerId,
          selectedKeys: additive
            ? held.includes(id)
              ? held.filter((k) => k !== id)
              : [...held, id]
            : held.length === 1 && held[0] === id
              ? []
              : [id],
        };
      }),

    setSelectedKeys: (ids) => set({ selectedKeys: ids }),

    renameLayer: (layerId, name) => {
      edit(`rename:${layerId}`, (s) => patchTrack(s.composition, layerId, (tr) => ({
        ...tr,
        layer: { ...tr.layer, name },
      })));
    },

    /** Author motion directly on the element: two flat stops on its current value, so
     *  nothing moves until a value is edited. One set per property — asking again just
     *  opens the one that is already there. */
    addKeyframes: (layerId, target) => {
      const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
      if (!track) return;
      const part: SelectedPart = { kind: "keyframes", property: target };
      const held =
        target === "position"
          ? Boolean(track.keyframes?.x && track.keyframes?.y)
          : Boolean(track.keyframes?.[target]);
      if (held) {
        set({ selectedId: layerId, selectedPart: part });
        return;
      }
      // Position writes both axes, in lockstep from the start.
      const added =
        target === "position"
          ? newPosition(track)
          : { [target]: newKeyframes(target, track.layer.base) };
      edit(null, (s) => ({
        selectedId: layerId,
        selectedPart: part,
        ...patchTrack(s.composition, layerId, (tr) => ({
          ...tr,
          keyframes: { ...tr.keyframes, ...added },
        })),
      }));
    },

    removeKeyframes: (layerId, target) => {
      const gone = target === "position" ? ["x", "y"] : [target];
      edit(null, (s) => ({
        selectedPart:
          s.selectedPart?.kind === "keyframes" && s.selectedPart.property === target
            ? null
            : s.selectedPart,
        ...patchTrack(s.composition, layerId, (tr) => {
          const kept = Object.fromEntries(
            Object.entries(tr.keyframes ?? {}).filter(([k]) => !gone.includes(k)),
          );
          return { ...tr, keyframes: kept };
        }),
      }));
    },

    setKeyframeStops: (layerId, prop, stops) => {
      edit(`stops:${layerId}:${prop}`, (s) =>
        patchTrack(s.composition, layerId, (tr) => patchKeyframes(tr, prop, { stops })));
    },

    setPositionStops: (layerId, stops) => {
      edit(`stops:${layerId}:position`, (s) =>
        patchTrack(s.composition, layerId, (tr) =>
          patchKeyframes(patchKeyframes(tr, "x", { stops: stops.x }), "y", {
            stops: stops.y,
          }),
        ));
    },

    /** The one writer for a standalone set's window — the block's edges are its only
     *  editor, the same way a module's range works. A combined position moves both of
     *  its axes, which is what keeps them one block. */
    setKeyframeRange: (layerId, target, range) => {
      edit(`range:${layerId}:${target}`, (s) =>
        patchTrack(s.composition, layerId, (tr) =>
          target === "position"
            ? patchKeyframes(patchKeyframes(tr, "x", { range }), "y", { range })
            : patchKeyframes(tr, target, { range }),
        ));
    },

    /**
     * Split position into two properties, or put it back together. Separating leaves
     * the axes exactly as they were — they were already two sets kept in step, so the
     * split is free. Combining merges them, which is where a time one axis has and the
     * other does not gets sampled rather than dropped.
     */
    setSeparatePosition: (layerId, separate) => {
      const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
      if (!track) return;
      const authored = Boolean(track.keyframes?.x || track.keyframes?.y);
      const merged = !separate && authored ? newPosition(track) : null;
      edit(null, (s) => ({
        // The selection was pointing at a property that no longer exists under that
        // name, so it follows the split rather than going blank.
        selectedPart: retargetPosition(s.selectedPart, separate),
        ...patchTrack(s.composition, layerId, (tr) => ({
          ...tr,
          layer: { ...tr.layer, separatePosition: separate },
          keyframes: merged ? { ...tr.keyframes, ...merged } : tr.keyframes,
        })),
      }));
    },

    removeModule: (layerId, index) => {
      edit(null, (s) => ({
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
      edit(`params:${layerId}:${index}`, (s) => patchTrack(s.composition, layerId, (tr) => ({
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
      edit(`range:${layerId}:${index}`, (s) => patchTrack(s.composition, layerId, (tr) => ({
        ...tr,
        modules: patchModule(tr.modules, index, (md) => ({ ...md, range })),
      })));
    },

    setLayerBase: (layerId, patch) => {
      edit(`base:${layerId}`, (s) => ({
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

    /**
     * A transform edit that respects the motion already authored.
     *
     * On a property with keyframes there is no base value to change — the curve sets
     * it outright, so writing to `base` would move nothing on screen. The edit lands
     * in the keyframe under the playhead instead, making one if there is none there:
     * scaling an element at a moment is how that moment gets a keyframe, the same way
     * moving one already works. Properties with no motion of their own still write
     * straight to the base transform.
     */
    captureTransform: (layerId, patch) => {
      edit(`capture:${layerId}`, (s) => {
        const span = s.composition.duration;
        const seconds = s.t * span;
        return patchTrack(s.composition, layerId, (tr) => {
          const base = { ...tr.layer.base };
          const keyframes = { ...(tr.keyframes ?? {}) };
          /** True once the value is in a keyframe, so the caller knows to leave the
           *  base alone. */
          const capture = (prop: KeyProp, v: number): boolean => {
            const set = keyframes[prop];
            if (!set) return false;
            const at = clamp(secondsToT(seconds, set.range, span), 0, 1);
            keyframes[prop] = { ...set, stops: stopAtTime(set.stops, at, v) };
            return true;
          };
          for (const [prop, v] of Object.entries(patch) as [
            keyof Transform,
            number,
          ][]) {
            if (typeof v !== "number") continue;
            // `scale` is one keyframed property driving both axes, so scaleX speaks
            // for the pair and scaleY has nowhere of its own to land.
            if (prop === "scaleX") {
              if (!capture("scale", v)) base.scaleX = v;
            } else if (prop === "scaleY") {
              if (!keyframes.scale) base.scaleY = v;
            } else if (!capture(prop, v)) {
              base[prop] = v;
            }
          }
          return { ...tr, layer: { ...tr.layer, base }, keyframes };
        });
      });
    },

    /** Where an element's position is held right now — the snapshot a move is measured
     *  from, so applying the same drag twice lands in the same place. */
    moveAnchor: (layerId) => {
      const track = get().composition.tracks.find((tr) => tr.layer.id === layerId);
      if (!track) return null;
      return {
        base: { x: track.layer.base.x, y: track.layer.base.y },
        driven: positionDrivers(track),
        seconds: get().t * get().composition.duration,
      };
    },

    /**
     * Move an element by (dx, dy) from `anchor`, writing to whichever holder owns each
     * axis: the keyframe under the playhead when the element carries its own motion, a
     * driving module's stops when one is on the stack, `base` otherwise. One `set`, so
     * a drag that moves both axes still costs a single render.
     *
     * On a keyframed axis the drag captures rather than translates: it writes the value
     * it was dropped at into the keyframe at the playhead, leaving every other keyframe
     * where the author put it. With no keyframe at that time there is one afterwards —
     * moving an element at a moment is how a keyframe is made.
     *
     * A module is the exception, and stays a slide. Its stops are a packaged bundle
     * whose shape is the whole point of having bundled it; dragging the element it
     * drives asks for that motion somewhere else, not for a dent in the middle of it.
     */
    moveLayer: (layerId, anchor, dx, dy) => {
      const by = { x: dx, y: dy };
      const driven = new Set(anchor.driven.map((d) => d.axis));
      edit(`move:${layerId}`, (s) =>
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
            // Every move in the drag starts from the stops the drag began with, so a
            // pointer wandering back over its own path leaves one keyframe behind and
            // not a trail of them.
            const at = secondsToT(anchor.seconds, current.range, s.composition.duration);
            const held = sampleStops(drive.stops, at);
            keyframes[drive.part.property] = {
              ...current,
              stops: stopAtTime(drive.stops, at, held + by[drive.axis]),
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
      edit(null, (s) => ({
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

    removeSelectedKeys: () => {
      const { selectedId, selectedKeys } = get();
      if (!selectedId || selectedKeys.length === 0) return;

      // Ids are `property:index`. Gathered by property first, so a set loses all of
      // its picked keyframes in one pass and the indices stay the ones that were
      // picked rather than shifting under each other.
      const gone = new Map<string, Set<number>>();
      for (const id of selectedKeys) {
        const at = id.lastIndexOf(":");
        if (at < 0) continue;
        const index = Number(id.slice(at + 1));
        if (!Number.isInteger(index)) continue;
        const property = id.slice(0, at);
        const held = gone.get(property) ?? new Set<number>();
        held.add(index);
        gone.set(property, held);
      }

      edit(null, (s) => {
        let emptied = false;
        const patched = patchTrack(s.composition, selectedId, (tr) => {
          const keyframes = { ...(tr.keyframes ?? {}) };
          for (const [property, indices] of gone) {
            // Position is two sets sharing every stop time, so they lose the same
            // keyframes and stay in lockstep.
            const axes = property === "position" ? ["x", "y"] : [property];
            for (const axis of axes) {
              const set = keyframes[axis];
              if (!set) continue;
              const kept = set.stops.filter((_, i) => !indices.has(i));
              if (kept.length === 0) {
                delete keyframes[axis];
                emptied = true;
              } else {
                keyframes[axis] = { ...set, stops: kept };
              }
            }
          }
          return { ...tr, keyframes };
        });
        return {
          ...patched,
          selectedKeys: [],
          // A part pointing at a property that no longer animates points at nothing.
          selectedPart: emptied ? null : s.selectedPart,
        };
      });
    },

    deleteSelected: () => {
      const { selectedId } = get();
      if (!selectedId) return;
      edit(null, (s) => ({
        selectedId: null,
        selectedPart: null,
        composition: {
          ...s.composition,
          tracks: s.composition.tracks.filter((tr) => tr.layer.id !== selectedId),
        },
      }));
    },

    undo: () => {
      set((s) => {
        const step = undoHistory(s.history, snapshot(s));
        if (!step) return {};
        return { ...restore(s, step.state), history: step.history };
      });
    },

    redo: () => {
      set((s) => {
        const step = redoHistory(s.history, snapshot(s));
        if (!step) return {};
        return { ...restore(s, step.state), history: step.history };
      });
    },

    sealHistory: () => set((s) => ({ history: seal(s.history) })),
  };
});
