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
 * axes at once, so a module can resize an element without naming an axis.
 */
export const PROPS = ["x", "y", "scale", "rotation", "opacity"] as const;
export type KeyProp = (typeof PROPS)[number];

export const isKeyProp = (v: string): v is KeyProp =>
  (PROPS as readonly string[]).includes(v);

/**
 * What an element can carry keyframes of its own on, in the order the inspector
 * stacks them.
 *
 * The two axes are here rather than the uniform `scale` a module uses: width and
 * height are separate in the panel, so stretching one without the other is something
 * an author can actually key. A module still drives `scale` — it is describing a
 * resize in the abstract, with no element in front of it to measure.
 */
export const TRACK_PROPS = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
] as const;
export type TrackProp = (typeof TRACK_PROPS)[number];

/**
 * What a keyframe button, a block, or a stop editor can be pointed at. `position` is
 * the pair: x and y authored as one property, which is how an element is animated
 * until someone asks for the axes apart.
 */
export type KeyTarget = KeyProp | TrackProp | "position";

/**
 * The element's own pixel size at scale 1 — the asset as it came in. A width is a
 * scale factor against this, which is the only thing the engine stores; everything
 * the author reads or types is the product.
 */
export type DesignSize = { width: number; height: number };

/** The axis of the design size each scale property is measured against. */
const SIZE_AXIS = { scaleX: "width", scaleY: "height" } as const;

export const isSizeProp = (t: KeyTarget): t is "scaleX" | "scaleY" =>
  t === "scaleX" || t === "scaleY";

/**
 * What a property is called where an author reads it. The engine thinks in scale
 * factors because that is what a transform multiplies by; a panel saying `scaleX`
 * when the canvas badge says `240 × 180` would be two names for one number.
 */
export const propLabel = (t: KeyTarget): string =>
  t === "scaleX" ? "width" : t === "scaleY" ? "height" : t;

/** A stored value as the panel shows it: pixels for a size, the value itself for
 *  everything else. Without a size to measure against there is nothing to convert
 *  to, so the factor stands. */
export const toDisplay = (t: KeyTarget, v: number, size?: DesignSize): number =>
  isSizeProp(t) && size ? v * size[SIZE_AXIS[t]] : v;

/** The inverse, for a value typed into a field. A design size of zero has no scale
 *  that reaches any width, so the factor is left alone rather than made infinite. */
export const fromDisplay = (t: KeyTarget, v: number, size?: DesignSize): number => {
  if (!isSizeProp(t) || !size) return v;
  const against = size[SIZE_AXIS[t]];
  return against > 0 ? v / against : v;
};

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
  scaleX: "border-violet-300 bg-violet-100 text-violet-900",
  scaleY: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900",
  rotation: "border-amber-300 bg-amber-100 text-amber-900",
  opacity: "border-rose-300 bg-rose-100 text-rose-900",
};

/** The same hues as the blocks, as text — a filled diamond means this property
 *  carries motion. */
export const PROP_TEXT: Record<KeyTarget, string> = {
  position: "text-indigo-500",
  x: "text-sky-500",
  y: "text-teal-500",
  scale: "text-violet-500",
  scaleX: "text-violet-500",
  scaleY: "text-fuchsia-500",
  rotation: "text-amber-500",
  opacity: "text-rose-500",
};

/** Sensible input steps per property — degrees move faster than opacity, and a width
 *  reads in pixels, so it steps by one of them rather than by a scale factor. */
export const PROP_STEP: Record<KeyTarget, number> = {
  position: 1,
  x: 1,
  y: 1,
  scale: 0.05,
  scaleX: 1,
  scaleY: 1,
  rotation: 1,
  opacity: 0.05,
};

/** The base transform's current reading for a property. */
export function baseValue(base: Transform, prop: KeyProp | TrackProp): number {
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
export function newKeyframes(prop: KeyProp | TrackProp, base: Transform): KeyframeSet {
  return { stops: defaultStops(baseValue(base, prop)), range: [0, 1] };
}

export const keyframesFor = (
  track: Track,
  prop: KeyProp | TrackProp,
): KeyframeSet | undefined =>
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
    label: propLabel(target),
    range: set.range,
    stops: set.stops,
    standalone: true,
  });
  // A fixed order rather than whatever order the sets were authored in, so a block
  // stays in the lane the eye last found it in. Position leads, as it does in the
  // inspector; its two axes draw one block until they are separated.
  const position = positionSets(track);
  if (position) out.push(block("position", position.x));
  for (const prop of TRACK_PROPS) {
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
 * The whole set moved in time, keeping its shape — `shiftStops` is the same idea one
 * axis over, on the values. Clamped as one piece rather than stop by stop: a curve
 * pushed against the start of the composition should stop moving, not pile its
 * keyframes up on the edge.
 */
export function slideStops(stops: Stop[], by: number): Stop[] {
  if (stops.length === 0) return stops;
  const first = stops[0].t;
  const last = stops[stops.length - 1].t;
  const moved = clamp(by, -first, 1 - last);
  return stops.map((s) => ({ ...s, t: s.t + moved }));
}

/**
 * The set stretched from one end, the other held still. Every keyframe's time scales
 * with the drag, so the motion keeps its shape and only plays faster or slower —
 * dragging the end of a curve asks for the same animation over a different span, not
 * for the last leg of it to grow while the rest stands where it was.
 *
 * The moved end cannot cross the anchor: a curve turned inside out is not a shorter
 * curve, and there is nothing sensible on the other side.
 */
export function stretchFactor(anchor: number, from: number, to: number): number | null {
  const span = from - anchor;
  if (Math.abs(span) < SAME_STOP) return null;
  // Toward the anchor stops at a hair's width; away stops at the composition's edge.
  const limit = span > 0 ? [anchor + SAME_STOP, 1] : [0, anchor - SAME_STOP];
  return (clamp(to, limit[0], limit[1]) - anchor) / span;
}

export function stretchStops(
  stops: Stop[],
  anchor: number,
  from: number,
  to: number,
): Stop[] {
  const k = stretchFactor(anchor, from, to);
  if (k === null) return stops;
  return stops.map((s) => ({ ...s, t: anchor + (s.t - anchor) * k }));
}

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


/**
 * What an element's curves are moved by as a set.
 *
 * The rows under an element are one performance, and the bar on the element's own
 * row is the handle for all of it: sliding it should move every property by the same
 * amount and leave the spread between them exactly as it was. That is the whole
 * reason these are worked out here rather than per row — a per-curve clamp would let
 * one property stop at the edge while the rest kept going, which is the one thing
 * moving them together must not do.
 */
export type TimeEdit =
  | { kind: "keyframes"; property: KeyTarget; stops: Stop[] }
  | { kind: "module"; index: number; range: Range };

/** A block's reach on the ruler. A standalone set's stops live inside its own range,
 *  so its extent is the first and last of them mapped back out. */
export function blockSpan(block: BlockView): Range {
  const [from, to] = block.range;
  if (!block.standalone || block.stops.length === 0) return block.range;
  const width = to - from;
  return [
    from + block.stops[0].t * width,
    from + block.stops[block.stops.length - 1].t * width,
  ];
}

/**
 * Whether anything under the element stretches across time.
 *
 * A lone keyframe is a value, not a span — nothing moves, so there is nothing to
 * retime and no handle to offer. The same rule the property rows already draw by:
 * one keyframe is a diamond, two are what make a line.
 */
export const hasSpan = (blocks: BlockView[]): boolean =>
  blocks.some((b) => (b.standalone ? b.stops.length > 1 : b.range[1] > b.range[0]));

/** Everything the element reaches across, or null when it has nothing to reach. */
export function trackSpan(blocks: BlockView[]): Range | null {
  if (blocks.length === 0) return null;
  const spans = blocks.map(blockSpan);
  return [
    Math.min(...spans.map((s) => s[0])),
    Math.max(...spans.map((s) => s[1])),
  ];
}

const localOf = (block: BlockView, by: number): number => {
  const width = block.range[1] - block.range[0];
  return width < SAME_STOP ? 0 : by / width;
};

export function slideTrackEdits(blocks: BlockView[], delta: number): TimeEdit[] {
  const span = trackSpan(blocks);
  if (span === null) return [];
  // One clamp for the element, not one per curve.
  const by = clamp(delta, -span[0], 1 - span[1]);
  if (Math.abs(by) < 1e-9) return [];
  return blocks.map((block): TimeEdit => {
    if (block.part.kind === "module") {
      return { kind: "module", index: block.part.index, range: slideRange(block.range, by) };
    }
    const local = localOf(block, by);
    return {
      kind: "keyframes",
      property: block.part.property,
      stops: block.stops.map((s) => ({ ...s, t: s.t + local })),
    };
  });
}

export function stretchTrackEdits(
  blocks: BlockView[],
  anchor: number,
  from: number,
  to: number,
): TimeEdit[] {
  const k = stretchFactor(anchor, from, to);
  if (k === null) return [];
  const scale = (c: number) => anchor + (c - anchor) * k;
  return blocks.map((block): TimeEdit => {
    if (block.part.kind === "module") {
      const [s, e] = block.range;
      const lo = clamp(scale(s), 0, 1);
      const hi = clamp(scale(e), 0, 1);
      return { kind: "module", index: block.part.index, range: [Math.min(lo, hi), Math.max(lo, hi)] };
    }
    return {
      kind: "keyframes",
      property: block.part.property,
      stops: stretchStops(block.stops, anchor, from, to),
    };
  });
}
