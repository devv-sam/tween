import type { Transform } from "../core/types";
import type { Point } from "./view";
import type { Handle } from "./selection";

/**
 * Resizing and turning several elements as one.
 *
 * A selection is not a thing the composition holds — there is no group layer, no
 * shared transform to edit. What there is, for the length of a gesture, is a box
 * around what is picked and a rule for what happens to each element inside it. This
 * is that rule, and it knows nothing about pointers or React.
 */

/** A rectangle in composition space, as its own edges. */
export type Box = { minX: number; minY: number; maxX: number; maxY: number };

export const unionBox = (boxes: Box[]): Box | null =>
  boxes.length === 0
    ? null
    : {
        minX: Math.min(...boxes.map((b) => b.minX)),
        minY: Math.min(...boxes.map((b) => b.minY)),
        maxX: Math.max(...boxes.map((b) => b.maxX)),
        maxY: Math.max(...boxes.map((b) => b.maxY)),
      };

export const boxCentre = (b: Box): Point => ({
  x: (b.minX + b.maxX) / 2,
  y: (b.minY + b.maxY) / 2,
});

/** Which box edges a handle drags: -1 the min edge, +1 the max edge, 0 neither. */
const EDGE: Record<Handle, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/**
 * A group never collapses past this. Nothing useful is left of a selection squeezed
 * to nothing, and a factor that reached zero could not be dragged back out of it.
 */
export const MIN_FACTOR = 0.02;

export type Resize = { about: Point; fx: number; fy: number };

/**
 * How far the box stretches when `handle` is dragged to `pointer`.
 *
 * The edge opposite the handle stays where it is and the box grows away from it, so
 * the corner under the hand is the only one that moves. `uniform` projects the drag
 * onto the box's own diagonal, which is the one factor that satisfies both axes at
 * once — the same rule a locked single-element resize already follows.
 */
export function resizeFactors(
  box: Box,
  handle: Handle,
  pointer: Point,
  uniform: boolean,
): Resize {
  const e = EDGE[handle];
  const centre = boxCentre(box);

  // The edge left behind, and the edge being dragged.
  const about = {
    x: e.x === 1 ? box.minX : e.x === -1 ? box.maxX : centre.x,
    y: e.y === 1 ? box.minY : e.y === -1 ? box.maxY : centre.y,
  };
  const held = {
    x: e.x === 1 ? box.maxX : e.x === -1 ? box.minX : centre.x,
    y: e.y === 1 ? box.maxY : e.y === -1 ? box.minY : centre.y,
  };
  const armX = held.x - about.x;
  const armY = held.y - about.y;

  const floor = (f: number) => (Number.isFinite(f) ? Math.max(f, MIN_FACTOR) : 1);

  if (uniform) {
    // Along the diagonal for a corner; along whichever axis it drives for a side.
    const f =
      e.x !== 0 && e.y !== 0
        ? ((pointer.x - about.x) * armX + (pointer.y - about.y) * armY) /
          (armX * armX + armY * armY)
        : e.x !== 0
          ? (pointer.x - about.x) / armX
          : (pointer.y - about.y) / armY;
    const one = floor(f);
    return { about, fx: one, fy: one };
  }

  return {
    about,
    fx: e.x === 0 ? 1 : floor((pointer.x - about.x) / armX),
    fy: e.y === 0 ? 1 : floor((pointer.y - about.y) / armY),
  };
}

/**
 * Whether a selection can be stretched out of square at all.
 *
 * `Transform` carries a position, a scale per axis and a turn — and no shear. A
 * rotated element stretched along someone else's axis becomes a parallelogram, which
 * is a shape this model cannot hold and would therefore store as something else. So
 * a selection with any turn in it resizes uniformly: the limit is visible in the
 * handles rather than silently wrong in the result.
 */
export const mustStayUniform = (states: Transform[]): boolean =>
  states.some((s) => Math.abs(s.rotation % 360) > 0.001);

/**
 * One element, scaled with the box.
 *
 * Its own size takes the factor and so does its distance from the anchor — that
 * second part is what makes the selection hold its arrangement rather than each
 * element swelling in place.
 */
export function scaledAbout(
  from: Transform,
  about: Point,
  fx: number,
  fy: number,
): { x: number; y: number; scaleX: number; scaleY: number } {
  return {
    x: about.x + (from.x - about.x) * fx,
    y: about.y + (from.y - about.y) * fy,
    scaleX: from.scaleX * fx,
    scaleY: from.scaleY * fy,
  };
}

/**
 * One element, turned with the box: it spins on its own centre by the same angle and
 * orbits the pivot by it too. Turning only the elements would leave them facing a new
 * way in the old arrangement, which is not what turning a group looks like.
 */
export function turnedAbout(
  from: Transform,
  about: Point,
  deg: number,
): { x: number; y: number; rotation: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = from.x - about.x;
  const dy = from.y - about.y;
  return {
    x: about.x + dx * cos - dy * sin,
    y: about.y + dx * sin + dy * cos,
    rotation: from.rotation + deg,
  };
}

/** Degrees from `centre` out to `p`. */
export const angleAt = (centre: Point, p: Point): number =>
  (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI;

/** The turn a group takes, snapped to whole steps while asked. */
export const snapSwing = (deg: number, step: number, snap: boolean): number =>
  snap ? Math.round(deg / step) * step : deg;
