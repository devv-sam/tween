import { clamp } from "../core/math";
import { sampleStops, type Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import type { KeyframeSet, Layer, ModuleData, Track, Transform } from "../core/types";

/**
 * What the inspector is currently focused on inside an element. A standalone
 * keyframed property and a module are both "a thing with a block on the track", so
 * one selection covers both rather than two fields that could disagree.
 */
export type SelectedPart =
  | { kind: "keyframes"; property: KeyTarget }
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

/**
 * What a keyframe button, a block, or a stop editor can be pointed at. `position` is
 * the pair: x and y authored as one property, which is how an element is animated
 * until someone asks for the axes apart.
 */
export type KeyTarget = KeyProp | "position";

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
export const PROP_COLOR: Record<KeyTarget, string> = {
  position: "border-indigo-300 bg-indigo-100 text-indigo-900",
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
export const PROP_OUTLINE: Record<KeyTarget, string> = {
  position: "border-indigo-400 bg-white text-indigo-700",
  x: "border-sky-400 bg-white text-sky-700",
  y: "border-teal-400 bg-white text-teal-700",
  scale: "border-violet-400 bg-white text-violet-700",
  rotation: "border-amber-400 bg-white text-amber-700",
  opacity: "border-rose-400 bg-white text-rose-700",
};

/** The same hues as the blocks, as text — a filled diamond means this property
 *  carries motion. */
export const PROP_TEXT: Record<KeyTarget, string> = {
  position: "text-indigo-500",
  x: "text-sky-500",
  y: "text-teal-500",
  scale: "text-violet-500",
  rotation: "text-amber-500",
  opacity: "text-rose-500",
};

/** The same hues as the blocks, solid — a filled dot means this property carries motion. */
export const PROP_DOT: Record<KeyTarget, string> = {
  position: "bg-indigo-500",
  x: "bg-sky-500",
  y: "bg-teal-500",
  scale: "bg-violet-500",
  rotation: "bg-amber-500",
  opacity: "bg-rose-500",
};

/** Sensible input steps per property — degrees move faster than opacity. */
export const PROP_STEP: Record<KeyTarget, number> = {
  position: 1,
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

/** One stop, on the element's current value. Only the keyframe the author asked for:
 *  a second one at the end would be motion nobody wrote, and a cap on where the
 *  motion they do write is allowed to go. */
export function defaultStops(v: number): Stop[] {
  return [{ t: 0, v, ease: "linear" }];
}

/** A fresh standalone set: flat on the element's current value, spanning the whole
 *  composition until its block is trimmed. */
export function newKeyframes(prop: KeyProp, base: Transform): KeyframeSet {
  return { stops: defaultStops(baseValue(base, prop)), range: [0, 1] };
}

export const keyframesFor = (track: Track, prop: KeyProp): KeyframeSet | undefined =>
  track.keyframes?.[prop];

/** Whether a target already carries motion — for position, both axes have to. */
export const hasKeyframes = (track: Track, target: KeyTarget): boolean =>
  target === "position"
    ? Boolean(positionSets(track))
    : Boolean(track.keyframes?.[target]);

export const moduleProp = (md: ModuleData): KeyProp => {
  const p = md.params.property;
  return typeof p === "string" && isKeyProp(p) ? p : "x";
};

export const moduleStops = (md: ModuleData): Stop[] =>
  Array.isArray(md.params.stops) ? (md.params.stops as Stop[]) : [];

/** The two axes of a combined position, kept in lockstep: same range, same stop
 *  times, same easings. Only the values differ. */
export type PositionSets = { x: KeyframeSet; y: KeyframeSet };

/**
 * The pair to treat as one property, or null when the axes stand alone — because the
 * element was separated, or because only one of them carries motion.
 */
export function positionSets(track: Track): PositionSets | null {
  if (track.layer.separatePosition) return null;
  const x = track.keyframes?.x;
  const y = track.keyframes?.y;
  return x && y ? { x, y } : null;
}

/** Where a stop sits over the whole composition, rather than inside its block. */
const absoluteT = (set: KeyframeSet, stop: Stop): number =>
  set.range[0] + stop.t * (set.range[1] - set.range[0]);

/** One axis timed like another but holding still — the shape of nothing happening,
 *  so an axis with no motion of its own can join one that has some. */
export const flatLike = (set: KeyframeSet, v: number): KeyframeSet => ({
  range: set.range,
  stops: set.stops.map((s) => ({ ...s, v })),
});

/**
 * Two independently authored axes brought back into lockstep. Every stop time from
 * either one survives; the axis that was missing a time is sampled at it, so the
 * element traces the same path it did before. Easing comes from whichever axis
 * actually had a keyframe there — the merged curve can only carry one.
 */
export function mergePosition(x: KeyframeSet, y: KeyframeSet): PositionSets {
  const range: Range = [
    Math.min(x.range[0], y.range[0]),
    Math.max(x.range[1], y.range[1]),
  ];
  const span = range[1] - range[0];

  const times: number[] = [];
  for (const set of [x, y]) {
    for (const stop of set.stops) {
      const at = absoluteT(set, stop);
      if (!times.some((t) => Math.abs(t - at) < SAME_STOP)) times.push(at);
    }
  }
  times.sort((a, b) => a - b);

  /** The easing an axis carries at an absolute time: its own stop's when it has one
   *  there, otherwise the one governing the segment that time falls inside. */
  const easeAt = (set: KeyframeSet, at: number): Easing | undefined => {
    const own = set.stops.find((s) => Math.abs(absoluteT(set, s) - at) < SAME_STOP);
    if (own) return own.ease;
    return set.stops.find((s) => absoluteT(set, s) > at)?.ease;
  };
  // Undefined where neither axis had an opinion, which is what a stop written
  // without one carries — the sampler reads that as linear.
  const eases = times.map((at) => easeAt(x, at) ?? easeAt(y, at));

  const axis = (set: KeyframeSet): KeyframeSet => {
    const width = set.range[1] - set.range[0];
    return {
      range,
      stops: times.map((at, i) => ({
        t: span <= 0 ? 0 : (at - range[0]) / span,
        // Outside its own block a curve holds its end value, which is what
        // `sampleStops` returns for a time past either edge.
        v: sampleStops(set.stops, width <= 0 ? 0 : (at - set.range[0]) / width),
        ease: eases[i],
      })),
    };
  };
  return { x: axis(x), y: axis(y) };
}

/**
 * The pair to write when position is asked for as one property: whatever the element
 * already carries, merged into lockstep, with a missing axis timed to match the one
 * that is there and held at the element's current value.
 */
export function newPosition(track: Track): PositionSets {
  const { x, y } = track.keyframes ?? {};
  const base = track.layer.base;
  if (x && y) return mergePosition(x, y);
  if (x) return { x, y: flatLike(x, base.y) };
  if (y) return { x: flatLike(y, base.x), y };
  return { x: newKeyframes("x", base), y: newKeyframes("y", base) };
}

/**
 * Everything on a track that draws a block, in evaluation order: the element's own
 * keyframes first, then the modules layered over them. `standalone` is what the two
 * are drawn differently by — raw material reads as an outline, a packaged module as
 * a solid.
 */
export type BlockView = {
  part: SelectedPart;
  prop: KeyTarget;
  label: string;
  range: Range;
  stops: Stop[];
  standalone: boolean;
};

export function trackBlocks(track: Track): BlockView[] {
  const out: BlockView[] = [];
  const block = (target: KeyTarget, set: KeyframeSet): BlockView => ({
    part: { kind: "keyframes", property: target },
    prop: target,
    label: target,
    range: set.range,
    stops: set.stops,
    standalone: true,
  });
  // A fixed order rather than whatever order the sets were authored in, so a block
  // stays in the lane the eye last found it in. Position leads, as it does in the
  // inspector; its two axes draw one block until they are separated.
  const position = positionSets(track);
  if (position) out.push(block("position", position.x));
  for (const prop of PROPS) {
    if (position && (prop === "x" || prop === "y")) continue;
    const set = track.keyframes?.[prop];
    if (set) out.push(block(prop, set));
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
 * Where a stop sits on the ruler, in seconds. Stops are stored normalized inside
 * their block so they ride it as it is trimmed; the editor talks in the same
 * seconds the ruler is labelled with, so a stop reading 1.5 lines up with 1.50.
 */
export const stopSeconds = (t: number, range: Range, duration: number): number =>
  (range[0] + t * (range[1] - range[0])) * duration;

/** The inverse. A time outside the block pins to the nearest edge. */
export function secondsToT(seconds: number, range: Range, duration: number): number {
  const span = range[1] - range[0];
  if (span <= 0 || duration <= 0) return 0;
  return clamp(seconds / duration - range[0], 0, span) / span;
}

/** Close enough on the ruler to be the same keyframe rather than a second one. */
export const SAME_STOP = 1e-4;

/**
 * A stop at the playhead, holding whatever the property evaluates to right there —
 * so adding one changes nothing until it is moved, and lands where you are looking
 * rather than at some midpoint. Landing on an existing stop revalues it.
 */
export function stopAtTime(stops: Stop[], t: number, v: number): Stop[] {
  const at = stops.findIndex((s) => Math.abs(s.t - t) < SAME_STOP);
  if (at >= 0) return stops.map((s, i) => (i === at ? { ...s, v } : s));
  const before = stops.filter((s) => s.t < t).pop();
  return sortStops([...stops, { t, v, ease: before?.ease ?? "linear" }]);
}

/** Remove a stop, never below the one a curve needs to hold a value at all. Emptying
 *  a set is removing the property's keyframes, which is its own command. */
export function removeStop(stops: Stop[], i: number): Stop[] {
  return stops.length <= 1 ? stops : stops.filter((_, k) => k !== i);
}
