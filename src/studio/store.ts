import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { clamp } from "../core/math";
import { sampleStops, type Stop } from "../core/curve";
import type { Blend } from "../core/types";
import type { StopEase } from "../core/easing";
import type {
  Composition,
  Distributor,
  Driver,
  ElementModule,
  KeyframeSet,
  Layer,
  LinkedModule,
  ModuleAsset,
  ModuleData,
  Track,
  Transform,
} from "../core/types";
import { isLinked, resolveModule } from "../core/library";
import { ensureImage, forgetImage } from "../render/images";
import { SHAPE_SIZE } from "../render/canvas2d";
import { MSG_TYPE, MSG_UNDISSECTED, imageError } from "./files";
import {
  cropFor,
  docToWorld,
  isSvgFile,
  nodeAt,
  readSvg,
  wrapNodes,
  worldToDoc,
  type Rect,
  type SvgNode,
} from "./svg";
import type { LayerContent } from "../export/code";
import { renderState } from "../core/renderState";
import { boundsHalf, clampToFrame } from "./selection";
import {
  hasKeyframes,
  newKeyframes,
  newPosition,
  positionDrivers,
  secondsToT,
  shiftStops,
  newModule,
  slideTrackEdits,
  stopAtTime,
  stretchTrackEdits,
  type DesignSize,
  type KeyProp,
  type KeyTarget,
  type TrackProp,
  type PositionDriver,
  type BlockView,
  type Range,
  type ModuleType,
  type SelectedPart,
  type TimeEdit,
} from "./modules";
import { scaledAbout, turnedAbout } from "./group";
import { clampFps, contentEnd, retimed } from "./composition";
import {
  emptyHistory,
  record,
  redo as redoHistory,
  seal,
  undo as undoHistory,
  type History,
} from "./history";
import { clampDuration } from "./ruler";
import { parseSegment, retimedStops, type SegmentRef } from "./segments";
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

/** Where the work is kept between visits. */
const STORE_KEY = "tween:store";

/** Bumped when what is kept there changes shape. */
const STORE_VERSION = 1;

/** A move's starting point, captured before the first pointer move. */
export type MoveAnchor = {
  base: { x: number; y: number };
  driven: PositionDriver[];
  /** Where the playhead was when the drag began, in seconds. Held here rather than
   *  read live so every move in one drag writes the same keyframe, and dropping in
   *  the same place twice lands the same value. */
  seconds: number;
};

/**
 * The element's pixel size before any transform — the asset as it came in. Only an
 * image has one; a width in the panel is a factor against it.
 */
export const designSizeOf = (
  assets: StudioAsset[],
  layer: Layer,
): DesignSize | undefined => {
  if (layer.source.kind !== "image") return undefined;
  const asset = assets.find((a) => a.id === layer.source.value);
  return asset ? { width: asset.naturalW, height: asset.naturalH } : undefined;
};

/**
 * A picture the studio holds: a raster file, a whole SVG it could not take apart, or
 * one node lifted out of an SVG that it could.
 *
 * All three answer the same questions — how big am I, where is my source — because
 * everything downstream of here draws them the same way. What an SVG node adds is the
 * markup it was made from, which is what lets an export ship real vector nodes rather
 * than a picture of them.
 */
/**
 * What each layer ships as in an exported page, for the layers that ship as
 * something. An SVG carries its own markup out; a raster has none to carry, and the
 * exporter draws its standing box.
 */
export function exportContent(
  composition: Composition,
  assets: StudioAsset[],
): Record<string, LayerContent> {
  const out: Record<string, LayerContent> = {};
  for (const track of composition.tracks) {
    const { source, id } = track.layer;
    if (source.kind !== "image") continue;
    const asset = assets.find((a) => a.id === source.value);
    if (!asset || !isSvg(asset) || !asset.svgSource) continue;
    out[id] = {
      svgSource: asset.svgSource,
      width: asset.naturalW,
      height: asset.naturalH,
    };
  }
  return out;
}

export type ImageAsset = {
  id: string;
  kind: "image";
  src: string;
  name: string;
  naturalW: number;
  naturalH: number;
};

/**
 * A drawing the studio holds: a whole SVG file, or a part taken off one.
 *
 * Both are the same thing — some nodes, seen through a window onto the document they
 * came from. A whole file's window is the document's own frame, so it behaves exactly
 * like a raster image and nobody need know it has parts. A part's window is just far
 * enough to hold that part, which is what makes it its own drawing rather than a
 * small shape adrift in a document-sized field of nothing.
 */
export type SvgAsset = {
  id: string;
  kind: "svg";
  src: string;
  name: string;
  naturalW: number;
  naturalH: number;
  /** The nodes this asset draws, wrapped at `crop`. Empty for a file that would not
   *  parse, which stands in as one flat picture and cannot be taken apart. */
  nodes: SvgNode[];
  /** The window onto the document, in the document's own units. */
  crop: Rect;
  /** The document's own frame — what a part is measured against as it moves. */
  doc: Rect;
  defs: string;
  svgSource: string;
  /** The shelf card this was taken off. Absent when it *is* the card: only whole
   *  files are offered for placing, so parts stay out of the drawer. */
  takenFrom?: string;
  /** Said quietly on the card when the file would not come apart. */
  notice?: string;
};

export type StudioAsset = ImageAsset | SvgAsset;

/** One element at the moment a group gesture began: where its position is held, and
 *  what it read on the frame. */
export type SelectionStart = { id: string; anchor: MoveAnchor; from: Transform };

/** What a group gesture is doing, worked out on the box and shared out per element. */
export type SelectionOp =
  | { kind: "scale"; about: Point; fx: number; fy: number }
  | { kind: "rotate"; about: Point; deg: number };

export const isSvg = (a: StudioAsset): a is SvgAsset => a.kind === "svg";

/** What the drawer offers: whole files, never the parts pulled off them. */
export const shelfAssets = (assets: StudioAsset[]): StudioAsset[] =>
  assets.filter((a) => !(isSvg(a) && a.takenFrom !== undefined));

const emptyComposition = (): Composition => ({
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  background: "#ffffff",
  tracks: [],
});

const centerOf = (frame: Size): Point => ({ x: frame.width / 2, y: frame.height / 2 });

function imageTrack(
  id: string,
  assetId: string,
  at: Point,
  /** Vectors arrive locked: keeping its proportions under a resize is most of what
   *  makes a drawing a drawing rather than a picture of one. The lock is the same one
   *  as ever, and can be let go. */
  lockAspect = false,
): Track {
  return {
    layer: {
      id,
      source: { kind: "image", value: assetId },
      base: { x: at.x, y: at.y, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      ...(lockAspect ? { lockAspect: true } : {}),
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

/**
 * A drawing the studio can hold, made from some nodes of a document.
 *
 * The blob is built here and cached by the asset's own id, so the renderer needs to
 * know nothing about SVG: it asks for a picture by asset and gets one, exactly as it
 * does for a PNG.
 */
async function makeSvgAsset(
  name: string,
  doc: Rect,
  defs: string,
  nodes: SvgNode[],
  takenFrom?: string,
): Promise<SvgAsset> {
  const id = crypto.randomUUID();
  // A whole file is seen through its own frame — that is the size it says it is, the
  // way a raster's size is its pixels. A part is seen through just enough to hold it.
  const crop = takenFrom === undefined ? doc : cropFor(nodes, doc);
  const svgSource = wrapNodes(nodes, crop, defs);
  const src = URL.createObjectURL(new Blob([svgSource], { type: "image/svg+xml" }));
  try {
    await ensureImage(id, src);
  } catch {
    URL.revokeObjectURL(src);
    forgetImage(id);
    throw new Error("svg");
  }
  return {
    id,
    kind: "svg",
    src,
    name,
    naturalW: crop.width,
    naturalH: crop.height,
    nodes,
    crop,
    doc,
    defs,
    svgSource,
    takenFrom,
  };
}

/**
 * A file, as one drawing.
 *
 * Nothing is taken apart on the way in. An SVG is a picture until someone asks it to
 * be more than one, which is a thing they do on the canvas, to the element in front
 * of them — not a thing that happens to every file that arrives.
 */
async function readSvgAsset(file: File): Promise<StudioAsset> {
  const text = await file.text();
  const read = readSvg(text, file.name);
  if (!read || read.nodes.length === 0) return readFlatSvg(file, MSG_UNDISSECTED);
  try {
    return await makeSvgAsset(file.name, read.box, read.defs, read.nodes);
  } catch {
    return readFlatSvg(file, MSG_UNDISSECTED);
  }
}

/** The whole file as one flat picture, for one that would not come apart. It keeps
 *  no nodes, so there is nothing in it to reach for. */
async function readFlatSvg(file: File, notice?: string): Promise<SvgAsset> {
  const id = crypto.randomUUID();
  const src = URL.createObjectURL(file);
  try {
    const img = await ensureImage(id, src);
    // An SVG with no intrinsic size reports zero; it still has to be some size to be
    // placed, so it takes a square.
    const width = img.naturalWidth || 300;
    const height = img.naturalHeight || 300;
    const box = { x: 0, y: 0, width, height };
    return {
      id,
      kind: "svg",
      src,
      name: file.name,
      naturalW: width,
      naturalH: height,
      nodes: [],
      crop: box,
      doc: box,
      defs: "",
      svgSource: "",
      notice,
    };
  } catch (err) {
    URL.revokeObjectURL(src);
    forgetImage(id);
    throw err;
  }
}

/**
 * A selection, and the single-element view of it.
 *
 * `selectedId` is not a second piece of state to keep in step — it is this list when
 * it holds exactly one thing. Two elements picked means there is no *the* element,
 * so it reads null and every control built for one quietly steps aside.
 */
const pick = (ids: string[]): { selectedIds: string[]; selectedId: string | null } => ({
  selectedIds: ids,
  selectedId: ids.length === 1 ? ids[0] : null,
});

/**
 * The element selection let go of — what picking a segment does to it.
 *
 * Element-selected and segment-selected are exclusive states, so one arriving is
 * always the other leaving. Kept here rather than spelled out at each call so the
 * two can never half-swap.
 */
const clearElement = (): {
  selectedIds: string[];
  selectedId: string | null;
  selectedPart: SelectedPart | null;
  selectedKeys: string[];
} => ({ ...pick([]), selectedPart: null, selectedKeys: [] });

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
  modules: ElementModule[],
  index: number,
  fn: (md: ElementModule) => ElementModule,
): ElementModule[] => modules.map((md, i) => (i === index ? fn(md) : md));

/** The same, for an entry the caller only wants to touch if the element owns it
 *  outright. A borrowed one is written through its overrides instead. */
const patchRaw = (
  modules: ElementModule[],
  index: number,
  fn: (md: ModuleData) => ModuleData,
): ElementModule[] => patchModule(modules, index, (md) => (isLinked(md) ? md : fn(md)));

/**
 * Everything undo puts back: the document, and the selection that was pointing into
 * it. The playhead, the zoom, and what is playing are not edits — Figma leaves them
 * alone across an undo, and so does this.
 */
type Snapshot = {
  composition: Composition;
  /** Edited through the same door as the composition, so a module renamed or a stack
   *  saved is one more thing undo puts back. */
  moduleLibrary: ModuleAsset[];
  assets: StudioAsset[];
  frame: Size;
  selectedIds: string[];
  selectedPart: SelectedPart | null;
};

const snapshot = (s: StudioState): Snapshot => ({
  composition: s.composition,
  moduleLibrary: s.moduleLibrary,
  assets: s.assets,
  frame: s.frame,
  selectedIds: s.selectedIds,
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

/** The transform properties a selection can be read and set on as one. Size is left
 *  out: several elements resized to one number is what the canvas box already does,
 *  and does better. */
export type SharedProp = "x" | "y" | "rotation";

/**
 * The module bench: a place to write a behaviour with no element in front of you.
 *
 * Its proxy is a plain square the canvas draws while the bench is open, and it never
 * reaches the composition — closing without saving has to leave nothing behind, so
 * there is nothing here for the composition to have to forget.
 */
export type Bench = {
  /** The asset being edited, or null while this is a new one. */
  editing: string | null;
  name: string;
  distributor: Distributor | null;
  stack: ModuleData[];
  /** Set when save was pressed with no name, cleared on the next keystroke. */
  nameMissing: boolean;
};

/** Where the bench's proxy stands and how big it is. Fixed: the bench is about
 *  behaviour, and a proxy you can resize is one more thing that is not the point. */
export const PROXY_SIZE = 200;

const emptyBench = (): Bench => ({
  editing: null,
  name: "",
  distributor: null,
  stack: [],
  nameMissing: false,
});

/** The transform the bench's proxy sits at: centred, and scaled from the box a shape
 *  layer draws at to the square the bench advertises. */
export const proxyBase = (frame: Size): Transform => ({
  x: frame.width / 2,
  y: frame.height / 2,
  scaleX: PROXY_SIZE / SHAPE_SIZE,
  scaleY: PROXY_SIZE / SHAPE_SIZE,
  rotation: 0,
  opacity: 1,
});

/**
 * The bench as a composition of one, so the canvas can draw it with the renderer it
 * already has rather than a second path that could disagree with the first.
 */
export function benchComposition(bench: Bench, comp: Composition, frame: Size): Composition {
  return {
    ...comp,
    background: undefined,
    tracks: [
      {
        layer: {
          id: PROXY_ID,
          // Grey rather than the white the bench is nominally a square of: the frame
          // behind it is usually white too, and a proxy nobody can see is no proxy.
          source: { kind: "shape", value: "#c8c8c8" },
          base: proxyBase(frame),
          ...(bench.distributor ? { distributor: bench.distributor } : {}),
        },
        modules: bench.stack,
      },
    ],
  };
}

export const PROXY_ID = "__bench-proxy";

type StudioState = {
  composition: Composition;
  /**
   * Saved behaviours, kept beside the composition rather than inside it: a library is
   * the author's, and it should still be there behind whatever they open next.
   */
  moduleLibrary: ModuleAsset[];
  /** Open only while a module is being written. Never part of the composition. */
  bench: Bench | null;
  /** A module dropped on an element that already clones. Two cloners cannot both be
   *  the element's, so nothing is written until the author settles it. */
  pendingAttach: { assetId: string; layerId: string } | null;
  assets: StudioAsset[];
  importError: string | null;
  frame: Size;
  t: number;
  playing: boolean;
  loop: boolean;
  /**
   * Everything picked, in the order it was picked.
   *
   * The single source of truth for selection. `selectedId` beside it is this list
   * when it holds exactly one — which is what lets every control that only makes
   * sense for one element (the handles, the keyframe log, the element panel) keep
   * reading one field and fall quiet on its own once a second thing is picked.
   */
  selectedIds: string[];
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
  /** Folded, not expanded: rows show by default, so folding is what is remembered. */
  collapsedTracks: string[];
  selectedKeys: string[];
  /**
   * Which segments are picked out, as `layer|property|index` ids.
   *
   * Exclusive with the element selection: you are editing an element or you are
   * editing the motion between two of its keyframes, never both. Nothing is gained
   * by a panel trying to be about two things at once, and the two have different
   * things to say about the same track.
   */
  selectedSegments: string[];
  viewport: Size;
  view: View;
  history: History<Snapshot>;
  setT: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleLoop: () => void;
  setDuration: (seconds: number) => void;
  /** End the composition where its last keyframe does, without retiming the motion
   *  that gets there. Nothing animated leaves the duration alone. */
  trimDurationToContent: () => void;
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
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  selectPart: (layerId: string, part: SelectedPart | null) => void;
  toggleTrackExpanded: (layerId: string) => void;
  /** Pick a keyframe out on the timeline. `additive` adds to the picked set rather
   *  than replacing it, which is how a bundle is gathered. */
  selectKey: (layerId: string, id: string, additive?: boolean) => void;
  setSelectedKeys: (ids: string[]) => void;
  /** Pick the span between two keyframes. Additive adds it to what is already picked,
   *  or takes it back out — segments on different elements can be picked together. */
  selectSegment: (id: string, additive?: boolean) => void;
  setSelectedSegments: (ids: string[]) => void;
  /** One curve written to every segment named, in a single step. Applying an easing
   *  to five segments is one thing the author did, so it is one thing to undo. */
  setSegmentEasing: (segmentIds: string[], ease: StopEase) => void;
  setSegmentBlend: (segmentIds: string[], blend: Blend) => void;
  /** How long the segment takes, in seconds. Moves its destination stop; the source
   *  stays put. */
  setSegmentDuration: (segmentId: string, seconds: number) => void;
  /** Where the segment is heading. `axis` names which half of a position is written;
   *  every other property only has the one. */
  setSegmentValue: (segmentId: string, axis: "x" | "y", v: number) => void;
  renameLayer: (layerId: string, name: string) => void;
  addKeyframes: (layerId: string, target: KeyTarget) => void;
  removeKeyframes: (layerId: string, target: KeyTarget) => void;
  setKeyframeStops: (
    layerId: string,
    prop: KeyProp | TrackProp,
    stops: KeyframeSet["stops"],
  ) => void;
  /** Both axes of a combined position at once — they only ever move together. */
  setPositionStops: (
    layerId: string,
    stops: { x: KeyframeSet["stops"]; y: KeyframeSet["stops"] },
  ) => void;
  setKeyframeRange: (layerId: string, target: KeyTarget, range: Range) => void;
  setSeparatePosition: (layerId: string, separate: boolean) => void;
  addModule: (layerId: string, type: ModuleType) => void;
  removeModule: (layerId: string, index: number) => void;
  setModuleParams: (layerId: string, index: number, patch: Record<string, unknown>) => void;
  setModuleRange: (layerId: string, index: number, range: Range) => void;
  /** Turn a cloner on or off, and reconfigure the one that is on. */
  setDistributor: (layerId: string, distributor: Distributor | null) => void;
  /**
   * Put a saved module on an element as a linked instance. A module that carries a
   * distributor brings it along; `replaceDistributor` says what to do when the
   * element already has one, and the caller has asked before setting it.
   */
  attachModule: (layerId: string, assetId: string, replaceDistributor?: boolean) => void;
  /** Attach, unless both the module and the element bring a cloner — then ask. */
  dropModule: (layerId: string, assetId: string) => void;
  /** Answer the question `dropModule` raised. */
  resolveAttach: (replaceDistributor: boolean) => void;
  /** Write a param on one entry of a linked instance. Lands in the element's own
   *  overrides — the master is never touched from here. */
  setLinkedOverride: (
    layerId: string,
    index: number,
    entry: number,
    patch: Record<string, unknown>,
  ) => void;
  /** Cut an instance loose: its resolved entries become the element's own. */
  detachModule: (layerId: string, index: number) => void;
  /** Bundle the element's raw entries into a new asset and link them back. */
  saveStackAsModule: (layerId: string, name: string) => void;
  /** How many linked instances of an asset are out there, across every element. */
  moduleUses: (assetId: string) => number;
  /** Detaches every instance first, so nothing is left pointing at nothing. */
  deleteModuleAsset: (assetId: string) => void;
  renameModuleAsset: (assetId: string, name: string) => void;
  openBench: (assetId?: string) => void;
  closeBench: () => void;
  setBenchName: (name: string) => void;
  setBenchDistributor: (distributor: Distributor | null) => void;
  addBenchModule: (type: ModuleType) => void;
  setBenchModuleParams: (index: number, patch: Record<string, unknown>) => void;
  setBenchModuleRange: (index: number, range: Range) => void;
  removeBenchModule: (index: number) => void;
  moveBenchModule: (index: number, to: number) => void;
  /** Save and close. Refuses an unnamed module, and says so on the field. */
  saveBench: () => void;
  /**
   * Move everything the element animates through time as one set.
   *
   * `from` is the element's blocks as they were when the drag began, not as they are
   * now. A drag reports how far it has come from where it started, so measuring
   * against live state would apply that distance again on every frame and the curves
   * would run away from the pointer.
   */
  slideTrack: (layerId: string, from: BlockView[], delta: number) => void;
  /** Stretch everything about one end of its span. `from` is the baseline, for the
   *  same reason it is on `slideTrack`. */
  stretchTrack: (
    layerId: string,
    from: BlockView[],
    anchor: number,
    held: number,
    to: number,
  ) => void;
  setLayerBase: (layerId: string, patch: Partial<Transform>) => void;
  /** The same patch, but landing in the keyframe under the playhead wherever the
   *  property carries its own motion. What a canvas gesture writes through. */
  captureTransform: (layerId: string, patch: Partial<Transform>, key?: string) => void;
  moveAnchor: (layerId: string) => MoveAnchor | null;
  /** Everything picked, with where each one's position is held right now. */
  selectionAnchors: () => { id: string; anchor: MoveAnchor }[];
  /** Shift every named element's opacity by the same amount, each from its own. */
  nudgeOpacity: (ids: string[], by: number) => void;
  /** Settle every named element on the same opacity. */
  setOpacity: (ids: string[], v: number) => void;
  /** What several elements read at the playhead, when they agree. */
  sharedOpacity: (ids: string[]) => number | null;
  /** The same reading for a placed or turned property: the value every named element
   *  holds at the playhead, or null when they hold different ones. */
  sharedTransform: (ids: string[], prop: SharedProp) => number | null;
  /** Settle every named element on one x, y or angle. */
  setSelectionTransform: (ids: string[], prop: SharedProp, v: number) => void;
  /** Step the property on each of them by the same amount, from its own value. */
  nudgeSelectionTransform: (ids: string[], prop: SharedProp, by: number) => void;
  /** Key a property across a whole selection: every element that has no motion on it
   *  gets some, and every element that already has takes a stop at the playhead. */
  keySelection: (ids: string[], target: KeyTarget) => void;
  /** Every picked element's hold and the state it was in when a gesture began. */
  selectionStarts: () => SelectionStart[];
  /** Resize or turn the whole selection about a point. One step to undo. */
  transformSelection: (starts: SelectionStart[], op: SelectionOp) => void;
  /** Move the whole selection by one agreed amount. One step to undo. */
  moveSelection: (
    anchors: { id: string; anchor: MoveAnchor }[],
    dx: number,
    dy: number,
  ) => void;
  moveLayer: (
    layerId: string,
    anchor: MoveAnchor,
    dx: number,
    dy: number,
    /** What the edit is filed under, so several elements moved together coalesce into
     *  one step rather than one apiece. Defaults to this element alone. */
    key?: string,
  ) => void;
  nudgeSelected: (dx: number, dy: number) => void;
  /** Put the element on the composition's centre line, on one axis. */
  centreLayer: (layerId: string, axis: "x" | "y") => void;
  /**
   * Take one part off a drawing, at a point on the frame.
   *
   * Resolves to the part that was pulled out, or null when there was nothing at that
   * point to pull — an element that is not an SVG, the last part of one, or a gap
   * between the parts.
   */
  detachPart: (layerId: string, at: Point) => Promise<string | null>;
  removeSelectedPart: () => void;
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

const createStudio: StateCreator<StudioState, [["zustand/persist", unknown]]> = (
  set,
  get,
) => {
  /**
   * The one door every document edit goes through: it records the state being
   * replaced before applying the change. `key` names the interaction the edit belongs
   * to — edits sharing an open key are one undo step — and null means "its own step".
   */
  const edit = (
    key: string | null,
    fn: (s: StudioState) => Partial<StudioState>,
  ): void => {
    set((s) => ({
      ...fn(s),
      history: record(s.history, snapshot(s), key, Date.now()),
    }));
  };

  /** Put a snapshot back. A different frame is a reframe, so the view refits to it. */
  const restore = (s: StudioState, snap: Snapshot): Partial<StudioState> => ({
    ...snap,
    // The snapshot holds the selection; the single-element view of it is worked out
    // again rather than stored, so the two can never come back disagreeing.
    ...pick(snap.selectedIds),
    view: snap.frame === s.frame ? s.view : refit(s.viewport, snap.frame, s.view),
  });

  /** Every curve on one element retimed in a single step, so a drag that moves five
   *  properties is one thing to undo rather than five. */
  const applyTimeEdits = (layerId: string, edits: TimeEdit[], key: string): void => {
    if (edits.length === 0) return;
    edit(key, (s) =>
      patchTrack(s.composition, layerId, (tr) => {
        const keyframes: Record<string, KeyframeSet> = { ...(tr.keyframes ?? {}) };
        let modules = tr.modules;
        for (const e of edits) {
          if (e.kind === "module") {
            modules = patchRaw(modules, e.index, (md) => ({ ...md, range: e.range }));
            continue;
          }
          // Position is two sets on shared times: y takes x's times, keeps its values.
          const axes = e.property === "position" ? ["x", "y"] : [e.property];
          for (const axis of axes) {
            const set = keyframes[axis];
            if (!set) continue;
            keyframes[axis] = {
              ...set,
              stops: e.stops.map((st, i) => ({ ...st, v: set.stops[i]?.v ?? st.v })),
            };
          }
        }
        return { ...tr, keyframes, modules };
      }),
    );
  };

  /**
   * One write across every segment named, wherever on the composition they live.
   *
   * Grouped onto the tracks in a single pass so a curve applied to segments on three
   * different elements is still one edit — which is what makes it one thing to undo.
   */
  const patchSegments = (
    ids: string[],
    key: string | null,
    patch: (stop: Stop, ref: SegmentRef) => Partial<Stop>,
  ): void => {
    const refs = ids
      .map(parseSegment)
      .filter((r): r is SegmentRef => r !== null);
    if (refs.length === 0) return;
    edit(key, (s) => ({
      composition: {
        ...s.composition,
        tracks: s.composition.tracks.map((tr) => {
          const mine = refs.filter((r) => r.layerId === tr.layer.id);
          if (mine.length === 0) return tr;
          const keyframes: Record<string, KeyframeSet> = { ...(tr.keyframes ?? {}) };
          for (const ref of mine) {
            // Position is two sets on shared times, so both axes take the change.
            const axes = ref.property === "position" ? ["x", "y"] : [ref.property];
            for (const axis of axes) {
              const set = keyframes[axis];
              if (!set || ref.index < 1 || ref.index >= set.stops.length) continue;
              keyframes[axis] = {
                ...set,
                stops: set.stops.map((st, i) =>
                  i === ref.index ? { ...st, ...patch(st, ref) } : st,
                ),
              };
            }
          }
          return { ...tr, keyframes };
        }),
      },
    }));
  };

  return {
    composition: emptyComposition(),
    moduleLibrary: [],
    bench: null,
    pendingAttach: null,
    assets: [],
    importError: null,
    frame: DEFAULT_FRAME,
    t: 0,
    playing: false,
    loop: true,
    selectedIds: [],
    selectedId: null,
    selectedPart: null,
    collapsedTracks: [],
    selectedKeys: [],
    selectedSegments: [],
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

    trimDurationToContent: () => {
      const end = contentEnd(get().composition, get().moduleLibrary);
      if (end === null || end <= 0) return;
      edit("duration", (s) => {
        const next = clampDuration(end * s.composition.duration);
        if (next === s.composition.duration) return {};
        return {
          composition: retimed(s.composition, next),
          // The playhead keeps the second it was parked on, so the frame on screen
          // is the frame that was on screen.
          t: clamp((s.t * s.composition.duration) / next, 0, 1),
        };
      });
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
      const added: StudioAsset[] = [];
      for (const file of files) {
        const err = imageError(file);
        if (err) {
          importError = err;
          continue;
        }
        try {
          // An SVG comes in whole. What it is made of is reached on the canvas,
          // by the author, to the element in front of them.
          if (isSvgFile(file)) added.push(await readSvgAsset(file));
          else added.push(await readImageAsset(file));
        } catch {
          importError = imageError(file) ?? MSG_TYPE;
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
        ...pick([layerId]),
        selectedPart: null,
        composition: {
          ...s.composition,
          tracks: [
            ...s.composition.tracks,
            imageTrack(layerId, assetId, place, isSvg(asset)),
          ],
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
        const alive = new Set(tracks.map((tr) => tr.layer.id));
        const kept = s.selectedIds.filter((sid) => alive.has(sid));
        return {
          assets: s.assets.filter((a) => a.id !== id),
          composition: { ...s.composition, tracks },
          ...pick(kept),
          selectedPart: kept.length === s.selectedIds.length ? s.selectedPart : null,
        };
      });
    },

    select: (layerId) =>
      set((s) => ({
        ...pick(layerId === null ? [] : [layerId]),
        selectedPart: null,
        selectedSegments: [],
        // The picked keyframes are read against the selected element, so they mean
        // nothing once a different one is selected.
        selectedKeys: layerId === s.selectedId ? s.selectedKeys : [],
      })),

    /** The one writer for a whole selection. Order is the order things were picked. */
    setSelectedIds: (ids) =>
      set((s) => ({
        ...pick(ids),
        selectedSegments: [],
        selectedPart: ids.length === 1 && ids[0] === s.selectedId ? s.selectedPart : null,
        selectedKeys: ids.length === 1 && ids[0] === s.selectedId ? s.selectedKeys : [],
      })),

    /** Add it, or take it back out if it is already in. What shift-click does, from
     *  the canvas and from the timeline alike. */
    toggleSelectedId: (id) =>
      set((s) => {
        const next = s.selectedIds.includes(id)
          ? s.selectedIds.filter((sid) => sid !== id)
          : [...s.selectedIds, id];
        return {
          ...pick(next),
          selectedSegments: [],
          selectedPart: next.length === 1 && next[0] === s.selectedId ? s.selectedPart : null,
          selectedKeys: next.length === 1 && next[0] === s.selectedId ? s.selectedKeys : [],
        };
      }),

    selectPart: (layerId, part) =>
      set((s) => ({
        ...pick([layerId]),
        selectedPart: part,
        selectedSegments: [],
        selectedKeys: layerId === s.selectedId ? s.selectedKeys : [],
      })),

    toggleTrackExpanded: (layerId) =>
      set((s) => ({
        collapsedTracks: s.collapsedTracks.includes(layerId)
          ? s.collapsedTracks.filter((id) => id !== layerId)
          : [...s.collapsedTracks, layerId],
      })),

    selectKey: (layerId, id, additive = false) =>
      set((s) => {
        const same = layerId === s.selectedId;
        const held = same ? s.selectedKeys : [];
        return {
          ...pick([layerId]),
          selectedSegments: [],
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

    selectSegment: (id, additive = false) =>
      set((s) => {
        const held = s.selectedSegments;
        const next = additive
          ? held.includes(id)
            ? held.filter((k) => k !== id)
            : [...held, id]
          : [id];
        return { ...clearElement(), selectedSegments: next };
      }),

    setSelectedSegments: (ids) =>
      set(() =>
        ids.length === 0
          ? { selectedSegments: [] }
          : { ...clearElement(), selectedSegments: ids },
      ),

    setSegmentEasing: (segmentIds, ease) => {
      patchSegments(segmentIds, null, () => ({ ease }));
      get().sealHistory();
    },

    setSegmentBlend: (segmentIds, blend) => {
      patchSegments(segmentIds, null, () => ({ blend }));
      get().sealHistory();
    },

    setSegmentDuration: (segmentId, seconds) => {
      const ref = parseSegment(segmentId);
      if (!ref) return;
      const { composition } = get();
      const track = composition.tracks.find((tr) => tr.layer.id === ref.layerId);
      if (!track) return;
      const axes = ref.property === "position" ? ["x", "y"] : [ref.property];
      const lead = track.keyframes?.[axes[0]];
      if (!lead) return;
      // Both axes of a position share every stop time, so the time is worked out once
      // on the leading axis and the other is moved to match rather than re-clamped.
      const moved = retimedStops(lead.stops, ref.index, seconds, lead.range, composition.duration);
      const t = moved[ref.index]?.t;
      if (t === undefined) return;
      edit(`segment-time:${segmentId}`, (s) =>
        patchTrack(s.composition, ref.layerId, (tr) => {
          const keyframes: Record<string, KeyframeSet> = { ...(tr.keyframes ?? {}) };
          for (const axis of axes) {
            const set = keyframes[axis];
            if (!set) continue;
            keyframes[axis] = {
              ...set,
              stops: set.stops.map((st, i) => (i === ref.index ? { ...st, t } : st)),
            };
          }
          return { ...tr, keyframes };
        }),
      );
    },

    setSegmentValue: (segmentId, axis, v) => {
      const ref = parseSegment(segmentId);
      if (!ref) return;
      const target = ref.property === "position" ? axis : ref.property;
      edit(`segment-value:${segmentId}:${axis}`, (s) =>
        patchTrack(s.composition, ref.layerId, (tr) => {
          const set = tr.keyframes?.[target];
          if (!set || ref.index >= set.stops.length) return tr;
          return {
            ...tr,
            keyframes: {
              ...tr.keyframes,
              [target]: {
                ...set,
                stops: set.stops.map((st, i) => (i === ref.index ? { ...st, v } : st)),
              },
            },
          };
        }),
      );
    },

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
        set({ ...pick([layerId]), selectedPart: part, selectedSegments: [] });
        return;
      }
      // Position writes both axes, in lockstep from the start.
      const added =
        target === "position"
          ? newPosition(track)
          : { [target]: newKeyframes(target, track.layer.base) };
      edit(null, (s) => ({
        ...pick([layerId]),
        selectedPart: part,
        selectedSegments: [],
        // The new row has to be visible, so a folded element unfolds.
        collapsedTracks: s.collapsedTracks.filter((id) => id !== layerId),
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

    addModule: (layerId, type) => {
      edit(null, (s) => {
        const track = s.composition.tracks.find((tr) => tr.layer.id === layerId);
        if (!track) return {};
        return {
          // The new one is what you came to configure, so it opens picked.
          selectedPart: { kind: "module", index: track.modules.length },
          ...patchTrack(s.composition, layerId, (tr) => ({
            ...tr,
            modules: [...tr.modules, newModule(type, tr.layer.base)],
          })),
        };
      });
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
        modules: patchRaw(tr.modules, index, (md) => ({
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
        modules: patchRaw(tr.modules, index, (md) => ({ ...md, range })),
      })));
    },

    setDistributor: (layerId, distributor) => {
      edit(`distributor:${layerId}`, (s) =>
        patchTrack(s.composition, layerId, (tr) => {
          const layer = { ...tr.layer };
          if (distributor) layer.distributor = distributor;
          else delete layer.distributor;
          return { ...tr, layer };
        }),
      );
    },

    attachModule: (layerId, assetId, replaceDistributor = false) => {
      const asset = get().moduleLibrary.find((a) => a.id === assetId);
      if (!asset) return;
      edit(null, (s) =>
        patchTrack(s.composition, layerId, (tr) => {
          // A module's distributor is the shape it was written for, so it lands on
          // the element rather than on the stack — a cloner is not a behaviour.
          const takes = asset.distributor && (replaceDistributor || !tr.layer.distributor);
          const link: LinkedModule = { kind: "linked", ref: assetId, overrides: {} };
          return {
            ...tr,
            layer: takes ? { ...tr.layer, distributor: asset.distributor } : tr.layer,
            modules: [...tr.modules, link],
          };
        }),
      );
    },

    dropModule: (layerId, assetId) => {
      const { moduleLibrary, composition, attachModule, select } = get();
      const asset = moduleLibrary.find((a) => a.id === assetId);
      if (!asset) return;
      const track = composition.tracks.find((tr) => tr.layer.id === layerId);
      if (asset.distributor && track?.layer.distributor) {
        set({ pendingAttach: { assetId, layerId } });
        return;
      }
      attachModule(layerId, assetId);
      select(layerId);
    },

    resolveAttach: (replaceDistributor) => {
      const pending = get().pendingAttach;
      if (!pending) return;
      set({ pendingAttach: null });
      get().attachModule(pending.layerId, pending.assetId, replaceDistributor);
      get().select(pending.layerId);
    },

    setLinkedOverride: (layerId, index, entry, patch) => {
      edit(`override:${layerId}:${index}:${entry}`, (s) =>
        patchTrack(s.composition, layerId, (tr) => ({
          ...tr,
          modules: patchModule(tr.modules, index, (md) =>
            isLinked(md)
              ? {
                  ...md,
                  overrides: {
                    ...md.overrides,
                    [entry]: { ...md.overrides[entry], ...patch },
                  },
                }
              : md,
          ),
        })),
      );
    },

    detachModule: (layerId, index) => {
      edit(null, (s) => {
        const library = s.moduleLibrary;
        return patchTrack(s.composition, layerId, (tr) => {
          const em = tr.modules[index];
          if (!em || !isLinked(em)) return tr;
          // What it was running becomes what it holds, so the element carries on
          // looking exactly as it did a moment ago.
          const raw = resolveModule(em, library);
          return {
            ...tr,
            modules: [...tr.modules.slice(0, index), ...raw, ...tr.modules.slice(index + 1)],
          };
        });
      });
    },

    saveStackAsModule: (layerId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      edit(null, (s) => {
        const track = s.composition.tracks.find((tr) => tr.layer.id === layerId);
        if (!track) return {};
        const stack = track.modules.filter((em): em is ModuleData => !isLinked(em));
        if (stack.length === 0) return {};
        const asset: ModuleAsset = {
          id: crypto.randomUUID(),
          name: trimmed,
          stack,
          createdAt: Date.now(),
          ...(track.layer.distributor ? { distributor: track.layer.distributor } : {}),
        };
        const link: LinkedModule = { kind: "linked", ref: asset.id, overrides: {} };
        return {
          moduleLibrary: [...s.moduleLibrary, asset],
          // The raw entries are gone; a selection pointing into them has nothing left.
          selectedPart: null,
          ...patchTrack(s.composition, layerId, (tr) => ({
            ...tr,
            modules: [...tr.modules.filter(isLinked), link],
          })),
        };
      });
    },

    moduleUses: (assetId) =>
      get().composition.tracks.filter((tr) =>
        tr.modules.some((em) => isLinked(em) && em.ref === assetId),
      ).length,

    deleteModuleAsset: (assetId) => {
      edit(null, (s) => {
        const library = s.moduleLibrary;
        return {
          moduleLibrary: library.filter((a) => a.id !== assetId),
          selectedPart: null,
          composition: {
            ...s.composition,
            // Every use is cut loose first: an element should lose the link, not
            // the motion it was running.
            tracks: s.composition.tracks.map((tr) => ({
              ...tr,
              modules: tr.modules.flatMap((em) =>
                isLinked(em) && em.ref === assetId ? resolveModule(em, library) : [em],
              ),
            })),
          },
        };
      });
    },

    renameModuleAsset: (assetId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      edit(`rename-module:${assetId}`, (s) => ({
        moduleLibrary: s.moduleLibrary.map((a) =>
          a.id === assetId ? { ...a, name: trimmed } : a,
        ),
      }));
    },

    openBench: (assetId) => {
      const asset = assetId ? get().moduleLibrary.find((a) => a.id === assetId) : undefined;
      set({
        bench: asset
          ? {
              editing: asset.id,
              name: asset.name,
              distributor: asset.distributor ?? null,
              stack: asset.stack,
              nameMissing: false,
            }
          : emptyBench(),
      });
    },

    closeBench: () => set({ bench: null }),

    setBenchName: (name) =>
      set((s) => (s.bench ? { bench: { ...s.bench, name, nameMissing: false } } : {})),

    setBenchDistributor: (distributor) =>
      set((s) => (s.bench ? { bench: { ...s.bench, distributor } } : {})),

    addBenchModule: (type) =>
      set((s) =>
        s.bench
          ? {
              bench: {
                ...s.bench,
                stack: [...s.bench.stack, newModule(type, proxyBase(s.frame))],
              },
            }
          : {},
      ),

    setBenchModuleParams: (index, patch) =>
      set((s) =>
        s.bench
          ? {
              bench: {
                ...s.bench,
                stack: s.bench.stack.map((md, i) =>
                  i === index ? { ...md, params: { ...md.params, ...patch } } : md,
                ),
              },
            }
          : {},
      ),

    setBenchModuleRange: (index, range) =>
      set((s) =>
        s.bench
          ? {
              bench: {
                ...s.bench,
                stack: s.bench.stack.map((md, i) => (i === index ? { ...md, range } : md)),
              },
            }
          : {},
      ),

    removeBenchModule: (index) =>
      set((s) =>
        s.bench
          ? { bench: { ...s.bench, stack: s.bench.stack.filter((_, i) => i !== index) } }
          : {},
      ),

    moveBenchModule: (index, to) =>
      set((s) => {
        if (!s.bench) return {};
        const at = clamp(to, 0, s.bench.stack.length - 1);
        if (at === index) return {};
        const stack = [...s.bench.stack];
        const [held] = stack.splice(index, 1);
        stack.splice(at, 0, held);
        return { bench: { ...s.bench, stack } };
      }),

    saveBench: () => {
      const bench = get().bench;
      if (!bench) return;
      const name = bench.name.trim();
      // Nothing is saved without a name: the shelf lists modules by it, and an
      // unnamed row is a module nobody will find again.
      if (!name) {
        set({ bench: { ...bench, nameMissing: true } });
        return;
      }
      edit(null, (s) => {
        const distributor = bench.distributor ?? undefined;
        if (bench.editing) {
          return {
            moduleLibrary: s.moduleLibrary.map((a) =>
              a.id === bench.editing ? { ...a, name, distributor, stack: bench.stack } : a,
            ),
            bench: null,
          };
        }
        const asset: ModuleAsset = {
          id: crypto.randomUUID(),
          name,
          stack: bench.stack,
          createdAt: Date.now(),
          ...(distributor ? { distributor } : {}),
        };
        return { moduleLibrary: [...s.moduleLibrary, asset], bench: null };
      });
    },

    slideTrack: (layerId, from, delta) => {
      applyTimeEdits(layerId, slideTrackEdits(from, delta), `slide:${layerId}`);
    },

    stretchTrack: (layerId, from, anchor, held, to) => {
      applyTimeEdits(layerId, stretchTrackEdits(from, anchor, held, to), `stretch:${layerId}`);
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
    captureTransform: (layerId, patch, key = `capture:${layerId}`) => {
      edit(key, (s) => {
        const span = s.composition.duration;
        const seconds = s.t * span;
        return patchTrack(s.composition, layerId, (tr) => {
          const base = { ...tr.layer.base };
          const keyframes = { ...(tr.keyframes ?? {}) };
          /** True once the value is in a keyframe, so the caller knows to leave the
           *  base alone. */
          const capture = (prop: KeyProp | TrackProp, v: number): boolean => {
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
            // An axis keyed on its own takes the value; failing that, a uniform
            // `scale` set speaks for both axes, and scaleY has nowhere of its own to
            // land while it does.
            if (prop === "scaleX") {
              if (!capture("scaleX", v) && !capture("scale", v)) base.scaleX = v;
            } else if (prop === "scaleY") {
              if (!capture("scaleY", v) && !keyframes.scale) base.scaleY = v;
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
    moveLayer: (layerId, anchor, dx, dy, key = `move:${layerId}`) => {
      const by = { x: dx, y: dy };
      const driven = new Set(anchor.driven.map((d) => d.axis));
      edit(key, (s) =>
        patchTrack(s.composition, layerId, (tr) => {
          const base = { ...tr.layer.base };
          if (!driven.has("x")) base.x = anchor.base.x + dx;
          if (!driven.has("y")) base.y = anchor.base.y + dy;
          // `driven` never names a borrowed module, so every index here owns its curve.
          const modules = tr.modules.map((md, i) => {
            const drive = anchor.driven.find(
              (d) => d.part.kind === "module" && d.part.index === i,
            );
            if (!drive || isLinked(md)) return md;
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

    /**
     * Where each picked element's position is held right now — one anchor apiece, so
     * a drag that moves several of them measures every one from where it started
     * rather than from wherever it has got to.
     */
    selectionAnchors: () => {
      const { selectedIds, moveAnchor } = get();
      const out: { id: string; anchor: MoveAnchor }[] = [];
      for (const id of selectedIds) {
        const anchor = moveAnchor(id);
        if (anchor) out.push({ id, anchor });
      }
      return out;
    },

    /**
     * Everything picked, with its hold and the state it is in right now.
     *
     * Taken once when a gesture starts and read from for the whole of it, so every
     * move is measured from where things began rather than from where the last move
     * left them. Without that a resize would compound itself frame by frame.
     */
    selectionStarts: () => {
      const { selectedIds, composition, moduleLibrary, moveAnchor, t } = get();
      const scene = renderState(composition, t, moduleLibrary);
      const out: SelectionStart[] = [];
      for (const id of selectedIds) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        const anchor = moveAnchor(id);
        if (!track || !anchor) continue;
        out.push({
          id,
          anchor,
          from: { ...(scene.find((it) => it.id === id)?.state ?? track.layer.base) },
        });
      }
      return out;
    },

    /**
     * Resize or turn the whole selection about a point.
     *
     * There is no group in the composition to transform, so the gesture is worked out
     * once on the box and then handed to each element as its own share: a new place,
     * and a new size or a new angle. Position goes through `moveLayer` so a keyframed
     * or module-driven axis is written where it actually lives; size and angle go
     * through `captureTransform` for the same reason. Everything files under one key,
     * so a drag is one step to undo however many elements it reshaped.
     */
    transformSelection: (starts, op) => {
      const { moveLayer, captureTransform } = get();
      const key = `group:${op.kind}`;
      for (const { id, anchor, from } of starts) {
        if (op.kind === "scale") {
          const next = scaledAbout(from, op.about, op.fx, op.fy);
          moveLayer(id, anchor, next.x - from.x, next.y - from.y, key);
          captureTransform(id, { scaleX: next.scaleX, scaleY: next.scaleY }, key);
        } else {
          const next = turnedAbout(from, op.about, op.deg);
          moveLayer(id, anchor, next.x - from.x, next.y - from.y, key);
          captureTransform(id, { rotation: next.rotation }, key);
        }
      }
    },

    /**
     * Move everything picked by the same amount.
     *
     * The amount is agreed first and then applied: the frame bounds every element,
     * and whichever one is closest to an edge decides how far the whole selection
     * gets to go. A selection that deformed as it met the edge would not be a
     * selection, it would be several drags that happened to start together.
     *
     * Each element's share is written through `moveLayer`, so it lands wherever that
     * element's position actually lives — the keyframe under the playhead, a driving
     * module's stops, or the base. One `edit` key for the whole gesture, so a drag is
     * one step to undo however many elements it moved.
     */
    moveSelection: (anchors, dx, dy) => {
      const { composition, moduleLibrary, assets, frame, moveLayer, t } = get();
      const scene = renderState(composition, t, moduleLibrary);
      const held: { id: string; anchor: MoveAnchor; from: Point; half: Point | null }[] = [];
      for (const { id, anchor } of anchors) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        const source = track.layer.source;
        const asset =
          source.kind === "image" ? assets.find((a) => a.id === source.value) : undefined;
        held.push({
          id,
          anchor,
          from: { x: at.x, y: at.y },
          half: asset
            ? boundsHalf(at, { width: asset.naturalW, height: asset.naturalH })
            : null,
        });
      }
      if (held.length === 0) return;

      // The most either axis can move before someone leaves the frame.
      let allowX = dx;
      let allowY = dy;
      for (const it of held) {
        if (!it.half) continue;
        const bounded = clampToFrame(
          { x: it.from.x + dx, y: it.from.y + dy },
          it.half,
          frame,
        );
        if (Math.abs(bounded.x - it.from.x) < Math.abs(allowX)) allowX = bounded.x - it.from.x;
        if (Math.abs(bounded.y - it.from.y) < Math.abs(allowY)) allowY = bounded.y - it.from.y;
      }
      // One key for every element and every move in the gesture: a drag is one thing
      // that happened, whatever it happened to.
      for (const it of held) moveLayer(it.id, it.anchor, allowX, allowY, "move:selection");
    },

    /**
     * Lift or drop the opacity of several elements together.
     *
     * Relative, not absolute: each one moves by the same amount from wherever it
     * already was, so a selection of a solid thing and a faint thing stays a solid
     * thing and a faint thing. Clamped per element, which means one of them hitting
     * an end does not hold the others back — nothing about opacity is rigid the way
     * a group's position is.
     *
     * Lands wherever the element's opacity actually lives, so a keyed element takes
     * it in the keyframe under the playhead.
     */
    nudgeOpacity: (ids, by) => {
      if (by === 0) return;
      const { composition, moduleLibrary, t, captureTransform } = get();
      const scene = renderState(composition, t, moduleLibrary);
      // One key for the run, so dragging the dial is one step to undo.
      for (const id of ids) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        captureTransform(id, { opacity: clamp(at.opacity + by, 0, 1) }, "opacity:selection");
      }
    },

    /**
     * Put every named element on one opacity.
     *
     * What typing a number into a field that several things answer to means: they now
     * all say that. The relative nudge beside this is what the arrow keys do, which is
     * the gesture that has a spread to preserve.
     */
    setOpacity: (ids, v) => {
      const opacity = clamp(v, 0, 1);
      for (const id of ids) {
        get().captureTransform(id, { opacity }, "opacity:selection");
      }
    },

    /**
     * The opacity several elements share, or null when they do not share one.
     *
     * Read at the playhead rather than off the base, so what the field says is what
     * is actually on the frame — an element part-way through fading is reported where
     * it has got to. Compared at the precision the field displays: two values that
     * round to the same shown number are the same number as far as anyone reading it
     * is concerned.
     */
    sharedOpacity: (ids) => {
      if (ids.length === 0) return null;
      const { composition, moduleLibrary, t } = get();
      const scene = renderState(composition, t, moduleLibrary);
      let shared: number | null = null;
      for (const id of ids) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        const v = Number(at.opacity.toFixed(2));
        if (shared === null) shared = v;
        else if (shared !== v) return null;
      }
      return shared;
    },

    /**
     * What several elements share for one transform property, or null when they do
     * not share it. Read at the playhead and rounded the way the field shows it, for
     * the same reasons `sharedOpacity` is.
     */
    sharedTransform: (ids, prop) => {
      if (ids.length === 0) return null;
      const { composition, moduleLibrary, t } = get();
      const scene = renderState(composition, t, moduleLibrary);
      let shared: number | null = null;
      for (const id of ids) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        const v = Number(at[prop].toFixed(2));
        if (shared === null) shared = v;
        else if (shared !== v) return null;
      }
      return shared;
    },

    /**
     * Put every named element on one x, one y or one angle.
     *
     * Absolute, the way typing a number into a field that several things answer to
     * reads: they all now say that, whatever they said before. Each one is written
     * where that property actually lives — an axis goes through `moveLayer` so a
     * module driving it is shifted rather than overruled, and an angle goes through
     * `captureTransform` so a keyed element takes it in the stop under the playhead.
     */
    setSelectionTransform: (ids, prop, v) => {
      const { composition, moduleLibrary, t, moveAnchor, moveLayer, captureTransform } = get();
      const scene = renderState(composition, t, moduleLibrary);
      const key = `${prop}:selection`;
      for (const id of ids) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        if (prop === "rotation") {
          captureTransform(id, { rotation: v }, key);
          continue;
        }
        const anchor = moveAnchor(id);
        if (!anchor) continue;
        const by = v - at[prop];
        moveLayer(id, anchor, prop === "x" ? by : 0, prop === "y" ? by : 0, key);
      }
    },

    /**
     * The relative version, which is what the arrows do: each element moves by the
     * same amount from wherever it already was, so a spread the author built survives
     * being stepped.
     */
    nudgeSelectionTransform: (ids, prop, by) => {
      if (by === 0) return;
      const { composition, moduleLibrary, t, moveAnchor, moveLayer, captureTransform } = get();
      const scene = renderState(composition, t, moduleLibrary);
      const key = `${prop}:selection`;
      for (const id of ids) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        if (prop === "rotation") {
          const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
          captureTransform(id, { rotation: at.rotation + by }, key);
          continue;
        }
        const anchor = moveAnchor(id);
        if (!anchor) continue;
        moveLayer(id, anchor, prop === "x" ? by : 0, prop === "y" ? by : 0, key);
      }
    },

    /**
     * Key one property across everything picked.
     *
     * An element with no motion on that property gets a curve of its own, holding
     * what it holds now; an element that already has one takes a stop at the playhead
     * at the value it reads there, which is what a second press of the diamond means
     * once the motion exists. Either way each element keeps its own curve — there is
     * no shared one, and a selection is a way of authoring several at once rather
     * than a thing with keyframes of its own.
     *
     * One step to undo, however many elements it reached.
     */
    keySelection: (ids, target) => {
      const key = `key:selection:${target}`;
      const props: (KeyProp | TrackProp)[] =
        target === "position" ? ["x", "y"] : [target as KeyProp | TrackProp];
      // Worked out before anything is written: an element that gains a curve here
      // arrives holding one stop at what it reads now, and does not want a second one
      // stamped on top of it.
      const keyed = ids.filter((id) => {
        const track = get().composition.tracks.find((tr) => tr.layer.id === id);
        return track ? hasKeyframes(track, target) : false;
      });

      edit(key, (s) => {
        const scene = renderState(s.composition, s.t, s.moduleLibrary);
        let composition = s.composition;
        const opened: string[] = [];
        for (const id of ids) {
          if (keyed.includes(id)) continue;
          const track = composition.tracks.find((tr) => tr.layer.id === id);
          if (!track) continue;
          const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
          const added =
            target === "position"
              ? newPosition({ ...track, layer: { ...track.layer, base: at } })
              : { [target]: newKeyframes(target as KeyProp | TrackProp, at) };
          composition = patchTrack(composition, id, (tr) => ({
            ...tr,
            keyframes: { ...tr.keyframes, ...added },
          })).composition;
          opened.push(id);
        }
        return {
          composition,
          // The rows that just gained motion open, the same way one element's does.
          collapsedTracks: s.collapsedTracks.filter((id) => !opened.includes(id)),
        };
      });

      // Everything that already had motion takes a stop where the playhead is, at the
      // value it reads there. Filed under the same key, so the press is one step.
      const { composition, moduleLibrary, t, captureTransform } = get();
      const scene = renderState(composition, t, moduleLibrary);
      for (const id of keyed) {
        const track = composition.tracks.find((tr) => tr.layer.id === id);
        if (!track) continue;
        const at = scene.find((it) => it.id === id)?.state ?? track.layer.base;
        const patch: Partial<Transform> = {};
        for (const prop of props) patch[prop as keyof Transform] = at[prop as keyof Transform];
        captureTransform(id, patch, key);
      }
    },

    nudgeSelected: (dx, dy) => {
      const { selectionAnchors, moveSelection } = get();
      moveSelection(selectionAnchors(), dx, dy);
    },

    /**
     * Sit the element on the frame's centre line, across one axis.
     *
     * Measured and written the same way a drag is: from where the element reads at the
     * playhead, through `moveLayer`, so an axis a keyframe or a module owns is moved in
     * its own holder rather than being overwritten in a base nothing is reading. An
     * element part-way through its animation centres the frame you can see.
     */
    centreLayer: (layerId, axis) => {
      const { composition, moduleLibrary, frame, moveAnchor, moveLayer, t, sealHistory } = get();
      const track = composition.tracks.find((tr) => tr.layer.id === layerId);
      if (!track) return;
      const anchor = moveAnchor(layerId);
      if (!anchor) return;
      const at =
        renderState(composition, t, moduleLibrary).find((it) => it.id === layerId)?.state ??
        track.layer.base;
      const middle = axis === "x" ? frame.width / 2 : frame.height / 2;
      const by = middle - at[axis];
      if (by === 0) return;
      moveLayer(layerId, anchor, axis === "x" ? by : 0, axis === "y" ? by : 0);
      // One click is one undo step — there is no gesture still in flight to keep open.
      sealHistory();
    },

    /**
     * Take one part off a drawing.
     *
     * Both sides come out as their own drawing, each cropped to what it actually
     * holds: the part that was taken, and the element it came off, which is now
     * shorter by whatever it lost. Neither moves — each one's new window is measured
     * back through the element's own transform, so the picture on the frame is
     * identical the instant after the cut, and only then is there something to drag.
     *
     * Everything the studio already does to an element works on both halves, because
     * both halves are elements. Nothing here is a group.
     */
    detachPart: async (layerId, at) => {
      const { composition, moduleLibrary, assets, t } = get();
      const track = composition.tracks.find((tr) => tr.layer.id === layerId);
      if (!track || track.layer.source.kind !== "image") return null;
      const asset = assets.find((a) => a.id === track.layer.source.value);
      // One part is not a thing to take apart: there would be nothing left behind.
      if (!asset || !isSvg(asset) || asset.nodes.length < 2) return null;

      const state =
        renderState(composition, t, moduleLibrary).find((it) => it.id === layerId)?.state ??
        track.layer.base;
      const part = nodeAt(asset.nodes, worldToDoc(at, asset.crop, state));
      if (!part) return null;

      const rest = asset.nodes.filter((n) => n !== part);
      let taken: SvgAsset;
      let remainder: SvgAsset;
      try {
        const from = asset.takenFrom ?? asset.id;
        taken = await makeSvgAsset(part.label, asset.doc, asset.defs, [part], from);
        remainder = await makeSvgAsset(asset.name, asset.doc, asset.defs, rest, from);
      } catch {
        return null;
      }

      /** Where a window's middle sits on the frame, seen through the element it is
       *  being cut out of — which is what keeps both halves where they were. */
      const centreOfCrop = (a: SvgAsset) =>
        docToWorld(
          { x: a.crop.x + a.crop.width / 2, y: a.crop.y + a.crop.height / 2 },
          asset.crop,
          state,
        );
      const restAt = centreOfCrop(remainder);
      const takenAt = centreOfCrop(taken);
      const partId = crypto.randomUUID();

      edit(null, (s) => {
        const tracks: Track[] = [];
        for (const tr of s.composition.tracks) {
          if (tr.layer.id !== layerId) {
            tracks.push(tr);
            continue;
          }
          // The element keeps its own motion and its own name; all that changed is
          // that it draws less, through a smaller window, from a moved centre.
          tracks.push({
            ...tr,
            layer: {
              ...tr.layer,
              source: { kind: "image", value: remainder.id },
              base: {
                ...tr.layer.base,
                x: tr.layer.base.x + (restAt.x - state.x),
                y: tr.layer.base.y + (restAt.y - state.y),
              },
            },
          });
          // Straight on top of what it came off, which is where it was already.
          tracks.push({
            layer: {
              id: partId,
              name: part.label,
              source: { kind: "image", value: taken.id },
              lockAspect: tr.layer.lockAspect,
              base: {
                ...tr.layer.base,
                x: tr.layer.base.x + (takenAt.x - state.x),
                y: tr.layer.base.y + (takenAt.y - state.y),
              },
            },
            modules: [],
          });
        }
        return {
          assets: [...s.assets, taken, remainder],
          composition: { ...s.composition, tracks },
          ...pick([partId]),
          selectedPart: null,
          selectedKeys: [],
        };
      });
      get().sealHistory();
      return partId;
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

    removeSelectedPart: () => {
      const { selectedId, selectedPart } = get();
      if (!selectedId || !selectedPart) return;
      if (selectedPart.kind === "module") {
        get().removeModule(selectedId, selectedPart.index);
      } else {
        get().removeKeyframes(selectedId, selectedPart.property);
      }
      get().sealHistory();
    },

    deleteSelected: () => {
      const gone = new Set(get().selectedIds);
      if (gone.size === 0) return;
      edit(null, (s) => ({
        ...pick([]),
        selectedPart: null,
        selectedKeys: [],
        selectedSegments: [],
        composition: {
          ...s.composition,
          tracks: s.composition.tracks.filter((tr) => !gone.has(tr.layer.id)),
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
};

export const useStudio = create<StudioState>()(
  persist(createStudio, {
    name: STORE_KEY,
    version: STORE_VERSION,
    /**
     * The library, and only the library.
     *
     * A saved module is worth keeping because it is about no element in particular —
     * it survives the composition it was written against, which is the whole point
     * of having saved it. What it was *used on* does not survive, because the
     * pictures underneath cannot: an imported image is held as an object URL, which
     * dies with the page. A restored composition would be elements that know how
     * they move and have nothing left to draw, and a timeline full of rows for
     * motion nobody can see is worse than an empty frame.
     */
    partialize: (s) => ({ moduleLibrary: s.moduleLibrary }),
    /** Version 0 kept the composition too. Whatever it saved is dropped rather than
     *  restored onto assets that are already gone. */
    migrate: (persisted) => ({
      moduleLibrary:
        (persisted as { moduleLibrary?: ModuleAsset[] } | null)?.moduleLibrary ?? [],
    }),
  }),
);
