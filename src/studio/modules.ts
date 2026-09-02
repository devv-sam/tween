import { clamp, lerp } from "../core/math";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import type { Layer, ModuleData, Transform } from "../core/types";

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

export function newKeyframeModule(prop: KeyProp, base: Transform): ModuleData {
  return {
    type: "keyframes",
    range: [0, 1],
    params: { property: prop, stops: defaultStops(baseValue(base, prop)), blend: "set" },
  };
}

export const moduleProp = (md: ModuleData): KeyProp => {
  const p = md.params.property;
  return typeof p === "string" && isKeyProp(p) ? p : "x";
};

export const moduleStops = (md: ModuleData): Stop[] =>
  Array.isArray(md.params.stops) ? (md.params.stops as Stop[]) : [];

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
export type PositionDriver = { axis: "x" | "y"; index: number; stops: Stop[] };

export function positionDrivers(modules: ModuleData[]): PositionDriver[] {
  const out: PositionDriver[] = [];
  modules.forEach((md, index) => {
    const axis = moduleProp(md);
    if (md.type !== "keyframes" || (axis !== "x" && axis !== "y")) return;
    if ((md.params.blend ?? "set") !== "set") return;
    out.push({ axis, index, stops: moduleStops(md) });
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
