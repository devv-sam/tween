import type { Point, Size } from "./view";

/**
 * Alignment guides: the lines that appear while an element is dragged, saying what it
 * has just lined up with.
 *
 * Everything here works in composition space on axis-aligned boxes, and knows nothing
 * about the playhead. The caller hands it boxes measured from whatever the elements
 * read *now* — which during motion authoring is the interpolated frame, not the base
 * transform — so a guide means the same thing mid-animation as it does at rest.
 */

/** A box to align against, reduced to what alignment actually needs. */
export type Box = {
  id: string;
  centre: Point;
  /** Half-width and half-height of the axis-aligned bounds, rotation already folded in. */
  half: Point;
};

/** Which coordinate a guide holds constant. A vertical line on screen is `x`. */
export type Axis = "x" | "y";

/** The three places on a box an axis can line up at: its two edges and its middle. */
const FEATURES = [-1, 0, 1] as const;
type Feature = (typeof FEATURES)[number];

const featureAt = (box: Box, axis: Axis, f: Feature): number =>
  box.centre[axis] + f * box.half[axis];

const spanOf = (box: Box, axis: Axis): [number, number] => [
  box.centre[axis] - box.half[axis],
  box.centre[axis] + box.half[axis],
];

/** The other axis — the one a line of constant `axis` runs along. */
const across = (axis: Axis): Axis => (axis === "x" ? "y" : "x");

/**
 * One line to draw. `at` is the coordinate it holds; `from` and `to` are where it
 * starts and stops along the other axis, so an element-to-element guide reaches
 * between the two elements it concerns rather than across the whole frame.
 */
export type Guide = {
  axis: Axis;
  at: number;
  /** The composition's own centre line, or a line borrowed from another element. */
  kind: "frame" | "element";
  from: number;
  to: number;
};

/**
 * A gap worth reporting: the dragged element came close to lining up with another one
 * but not close enough to snap, so the distance between them is shown instead of a
 * line. That is the case where the spacing is deliberate — the author is placing the
 * element near the guide on purpose, and wants to know by how much.
 */
export type Measure = {
  /** The axis the two were nearly aligned on. The gap is measured across it. */
  axis: Axis;
  /** Composition px between the two elements' facing edges. */
  gap: number;
  /** Midpoint of the gap, where the label goes. */
  at: Point;
};

export type Alignment = {
  /** How far to move the element so it sits on the guides, per axis. Zero where
   *  nothing was close enough to snap to. */
  delta: Point;
  guides: Guide[];
  measures: Measure[];
};

const NONE: Alignment = { delta: { x: 0, y: 0 }, guides: [], measures: [] };

/** Lines within this of each other, once snapped, are the same line. */
const SAME_LINE = 0.5;

/** Guides overhang the elements they join by this much, so the line reads as reaching
 *  past both rather than stopping dead on an edge. */
const OVERHANG = 12;

/** One axis's answer, before the two are combined. */
type AxisResult = {
  delta: number;
  guides: Guide[];
  measure: Measure | null;
};

/**
 * The best line to snap to on one axis, and every line that coincides with it.
 *
 * Each of the dragged box's three features is tried against every candidate — the
 * frame's centre and all three features of every other element. The smallest move
 * wins, and then every candidate that would *also* be satisfied by that same move is
 * drawn too: an element whose left edge and centre both land at once should say so
 * with two lines, not pick one.
 */
function alignAxis(
  moving: Box,
  others: Box[],
  frame: Size,
  axis: Axis,
  snap: number,
  reach: number,
): AxisResult {
  const extent = axis === "x" ? frame.width : frame.height;
  /** Every line the dragged element could land on, with the box that owns it. */
  const targets: { at: number; kind: Guide["kind"]; box: Box | null }[] = [
    { at: extent / 2, kind: "frame", box: null },
  ];
  for (const other of others) {
    for (const f of FEATURES) {
      targets.push({ at: featureAt(other, axis, f), kind: "element", box: other });
    }
  }

  let best: { delta: number; target: (typeof targets)[number] } | null = null;
  for (const target of targets) {
    for (const f of FEATURES) {
      const delta = target.at - featureAt(moving, axis, f);
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target };
    }
  }
  if (!best) return { delta: 0, guides: [], measure: null };

  // Outside the snap band there is no line — but a near miss against another element
  // is the deliberate-spacing case, so the distance is reported instead.
  if (Math.abs(best.delta) > snap) {
    if (Math.abs(best.delta) > reach || !best.target.box) {
      return { delta: 0, guides: [], measure: null };
    }
    return { delta: 0, guides: [], measure: gapBetween(moving, best.target.box, axis) };
  }

  const delta = best.delta;
  const moved: Box = {
    ...moving,
    centre: { ...moving.centre, [axis]: moving.centre[axis] + delta },
  };

  const guides: Guide[] = [];
  for (const target of targets) {
    const lands = FEATURES.some(
      (f) => Math.abs(target.at - featureAt(moved, axis, f)) < SAME_LINE,
    );
    if (!lands) continue;
    if (guides.some((g) => Math.abs(g.at - target.at) < SAME_LINE)) continue;

    if (target.box) {
      // Between the two elements it joins, reaching a little past both.
      const a = spanOf(moved, across(axis));
      const b = spanOf(target.box, across(axis));
      guides.push({
        axis,
        at: target.at,
        kind: "element",
        from: Math.min(a[0], b[0]) - OVERHANG,
        to: Math.max(a[1], b[1]) + OVERHANG,
      });
    } else {
      // The composition's own centre line runs the whole way, because it is a fact
      // about the frame rather than about any element on it.
      guides.push({
        axis,
        at: target.at,
        kind: "frame",
        from: 0,
        to: axis === "x" ? frame.height : frame.width,
      });
    }
  }
  return { delta, guides, measure: null };
}

/**
 * The clear distance between two boxes, across the axis they are nearly aligned on.
 *
 * Boxes that overlap have no gap to report — the number would be a negative
 * penetration depth, which is not what anyone is spacing by.
 */
function gapBetween(moving: Box, other: Box, axis: Axis): Measure | null {
  const dir = across(axis);
  const a = spanOf(moving, dir);
  const b = spanOf(other, dir);
  const gap = a[0] > b[1] ? a[0] - b[1] : b[0] > a[1] ? b[0] - a[1] : -1;
  if (gap < 0) return null;
  const between = a[0] > b[1] ? (b[1] + a[0]) / 2 : (a[1] + b[0]) / 2;
  // Centred on the overlap the two share along the guide's own axis, so the label
  // sits between them rather than off the end of one.
  const oa = spanOf(moving, axis);
  const ob = spanOf(other, axis);
  const along = (Math.max(oa[0], ob[0]) + Math.min(oa[1], ob[1])) / 2;
  return {
    axis,
    gap,
    at: axis === "x" ? { x: along, y: between } : { x: between, y: along },
  };
}

/**
 * Where the dragged element wants to sit, and what to draw about it.
 *
 * `snap` and `reach` are in composition px — the caller converts them from screen px,
 * so the bands stay the same size under the pointer whatever the zoom is.
 */
export function alignmentFor(
  moving: Box,
  others: Box[],
  frame: Size,
  snap: number,
  reach: number,
): Alignment {
  if (snap <= 0) return NONE;
  const x = alignAxis(moving, others, frame, "x", snap, reach);
  const y = alignAxis(moving, others, frame, "y", snap, reach);
  return {
    delta: { x: x.delta, y: y.delta },
    guides: [...x.guides, ...y.guides],
    measures: [x.measure, y.measure].filter((m): m is Measure => m !== null),
  };
}
