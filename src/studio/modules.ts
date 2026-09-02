import { clamp, lerp } from "../core/math";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import type { KeyframeSet, Layer, ModuleData, Track, Transform } from "../core/types";

/**
 * What the inspector is currently focused on inside an element. A standalone
 * keyframed property and a module are both "a thing with a block on the track", so
 * one selection covers both rather than two fields that could disagree.
 */
export type SelectedPart =
  | { kind: "keyframes"; property: KeyProp }
  | { kind: "module"; index: number };

export const samePart = (a: SelectedPart | null, b: SelectedPart): boolean =>
  a?.kind !== b.kind
    ? false
    : a.kind === "keyframes" && b.kind === "keyframes"
      ? a.property === b.property
      : a.kind === "module" && b.kind === "module"
        ? a.index === b.index
        : false;

/** A module's window on the timeline, normalized over the composition. */
export type Range = [number, number];

/**
 * Properties a keyframe module can drive. `scale` is the uniform one — it writes both
 * axes at once, so the studio never asks for scaleX and scaleY separately.
 */
export const PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;
export type KeyProp = (typeof PROPS)[number];

export const isKeyProp = (v: string): v is KeyProp =>
  (PROPS as readonly string[]).includes(v);

export const EASINGS: { value: Easing; label: string }[] = [
  { value: "linear", label: "linear" },
  { value: "in", label: "ease in" },
  { value: "out", label: "ease out" },
  { value: "inout", label: "ease in-out" },
];

/**
 * One muted colour per property, so two blocks in the same lane are told apart at a
 * glance without competing with the frame.
 */
export const PROP_COLOR: Record<KeyProp, string> = {
  x: "border-sky-300 bg-sky-100 text-sky-900",
  y: "border-teal-300 bg-teal-100 text-teal-900",
  scale: "border-violet-300 bg-violet-100 text-violet-900",
  rotation: "border-amber-300 bg-amber-100 text-amber-900",
  opacity: "border-rose-300 bg-rose-100 text-rose-900",
};

/**
 * The same hues, unfilled. A standalone set is raw material — it reads as an outline
 * until it is bundled into a module, which reads as a solid.
 */
export const PROP_OUTLINE: Record<KeyProp, string> = {
  x: "border-sky-400 bg-white text-sky-700",
  y: "border-teal-400 bg-white text-teal-700",
  scale: "border-violet-400 bg-white text-violet-700",
  rotation: "border-amber-400 bg-white text-amber-700",
  opacity: "border-rose-400 bg-white text-rose-700",
};

/** The same hues as the blocks, solid — a filled dot means this property carries motion. */
export const PROP_DOT: Record<KeyProp, string> = {
  x: "bg-sky-500",
  y: "bg-teal-500",
  scale: "bg-violet-500",
  rotation: "bg-amber-500",
  opacity: "bg-rose-500",
};

/** Sensible input steps per property — degrees move faster than opacity. */
export const PROP_STEP: Record<KeyProp, number> = {
  x: 1,
  y: 1,
  scale: 0.05,
  rotation: 1,
  opacity: 0.05,
};

/** The base transform's current reading for a property. */
export function baseValue(base: Transform, prop: KeyProp): number {
  return prop === "scale" ? base.scaleX : base[prop];
}

/** Two stops, both sitting on the element's current value — a module that changes
 *  nothing until the user says what should change. */
export function defaultStops(v: number): Stop[] {
  return [
    { t: 0, v, ease: "linear" },
    { t: 1, v, ease: "linear" },
  ];
}

/** A fresh standalone set: flat on the element's current value, spanning the whole
 *  composition until its block is trimmed. */
export function newKeyframes(prop: KeyProp, base: Transform): KeyframeSet {
  return { stops: defaultStops(baseValue(base, prop)), range: [0, 1] };
}

export const keyframesFor = (track: Track, prop: KeyProp): KeyframeSet | undefined =>
  track.keyframes?.[prop];

export const moduleProp = (md: ModuleData): KeyProp => {
  const p = md.params.property;
  return typeof p === "string" && isKeyProp(p) ? p : "x";
};

export const moduleStops = (md: ModuleData): Stop[] =>
  Array.isArray(md.params.stops) ? (md.params.stops as Stop[]) : [];

/**
 * Everything on a track that draws a block, in evaluation order: the element's own
 * keyframes first, then the modules layered over them. `standalone` is what the two
 * are drawn differently by — raw material reads as an outline, a packaged module as
 * a solid.
 */
export type BlockView = {
  part: SelectedPart;
  prop: KeyProp;
  label: string;
  range: Range;
  stops: Stop[];
  standalone: boolean;
};

export function trackBlocks(track: Track): BlockView[] {
  const out: BlockView[] = [];
  for (const [key, set] of Object.entries(track.keyframes ?? {})) {
    if (!isKeyProp(key)) continue;
    out.push({
      part: { kind: "keyframes", property: key },
      prop: key,
      label: key,
      range: set.range,
      stops: set.stops,
      standalone: true,
    });
  }
  track.modules.forEach((md, index) => {
    out.push({
      part: { kind: "module", index },
      prop: moduleProp(md),
      label: moduleLabel(md),
      range: md.range,
      stops: moduleStops(md),
      standalone: false,
    });
  });
  return out;
}

/** Label on the track block and in the module stack: the property, lowercase. */
export const moduleLabel = (md: ModuleData): string => moduleProp(md);

export function layerName(
  layer: Layer,
  assetName: string | undefined,
  index: number,
): string {
  return layer.name?.trim() || assetName || `Element ${index + 1}`;
}

/**
 * Lane geometry. Each module gets its own band inside its element's row, so two
 * modules covering the same span are read apart at a glance — they overlap in time
 * without overlapping on screen. The row grows to fit them and the gutter label
 * follows, which is why this is one function both columns call.
 */
export const BLOCK_HEIGHT = 18;
export const BLOCK_GAP = 4;
const ROW_PAD = 4;

export function rowHeight(moduleCount: number, min: number): number {
  const stack =
    moduleCount < 1
      ? 0
      : moduleCount * BLOCK_HEIGHT + (moduleCount - 1) * BLOCK_GAP + ROW_PAD * 2;
  return Math.max(min, stack);
}

/** Top of a module's band, centred in whatever height the row settled on. */
export function blockTop(index: number, moduleCount: number, min: number): number {
  const stack = moduleCount * BLOCK_HEIGHT + (moduleCount - 1) * BLOCK_GAP;
  const top = (rowHeight(moduleCount, min) - stack) / 2;
  return top + index * (BLOCK_HEIGHT + BLOCK_GAP);
}

/**
 * Which axes a track's modules own outright.
 *
 * A `set` blend replaces the property rather than adding to it, so while such a
 * module is on the stack the base value has nothing to show — dragging the element
 * would write to `base.x` and change nothing on screen. Moving the element has to
 * move these instead, which slides the whole curve and leaves its shape alone.
 */
export type PositionDriver = { axis: "x" | "y"; part: SelectedPart; stops: Stop[] };

export function positionDrivers(track: Track): PositionDriver[] {
  const out: PositionDriver[] = [];
  for (const axis of ["x", "y"] as const) {
    const set = track.keyframes?.[axis];
    // Standalone keyframes always `set`, so they always own their axis.
    if (set) out.push({ axis, part: { kind: "keyframes", property: axis }, stops: set.stops });
  }
  track.modules.forEach((md, index) => {
    const axis = moduleProp(md);
    if (md.type !== "keyframes" || (axis !== "x" && axis !== "y")) return;
    if ((md.params.blend ?? "set") !== "set") return;
    out.push({ axis, part: { kind: "module", index }, stops: moduleStops(md) });
  });
  return out;
}

/** Every stop moved by the same amount: the curve travels, its shape does not. */
export const shiftStops = (stops: Stop[], delta: number): Stop[] =>
  stops.map((s) => ({ ...s, v: s.v + delta }));

/** Narrower than this and a block has no body left to grab between its two edges. */
export const MIN_RANGE = 0.02;

/** Slide a range without changing its width, kept inside the composition. */
export function slideRange([s, e]: Range, delta: number): Range {
  const width = e - s;
  const start = clamp(s + delta, 0, Math.max(0, 1 - width));
  return [start, start + width];
}

/** Move one edge of a range, leaving the other where it is. */
export function trimRange([s, e]: Range, edge: "start" | "end", t: number): Range {
  return edge === "start"
    ? [clamp(t, 0, Math.max(0, e - MIN_RANGE)), e]
    : [s, clamp(t, Math.min(1, s + MIN_RANGE), 1)];
}

/** Stops in time order, which is what `sampleStops` walks. */
export const sortStops = (stops: Stop[]): Stop[] =>
  [...stops].sort((a, b) => a.t - b.t);

export function patchStop(stops: Stop[], i: number, patch: Partial<Stop>): Stop[] {
  const next = stops.map((s, k) => (k === i ? { ...s, ...patch } : s));
  return patch.t === undefined ? next : sortStops(next);
}

/**
 * A new stop in the widest gap, valued where the curve already passes through — the
 * added stop changes the shape only once it is edited.
 */
export function addStop(stops: Stop[]): Stop[] {
  if (stops.length < 2) return [...stops, { t: 1, v: stops[0]?.v ?? 0, ease: "linear" }];
  let at = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    if (stops[i + 1].t - stops[i].t > stops[at + 1].t - stops[at].t) at = i;
  }
  const a = stops[at];
  const b = stops[at + 1];
  const mid: Stop = { t: (a.t + b.t) / 2, v: lerp(a.v, b.v, 0.5), ease: b.ease ?? "linear" };
  return [...stops.slice(0, at + 1), mid, ...stops.slice(at + 1)];
}

/** Remove a stop, never below the two a curve needs. */
export function removeStop(stops: Stop[], i: number): Stop[] {
  return stops.length <= 2 ? stops : stops.filter((_, k) => k !== i);
}
