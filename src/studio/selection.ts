import { clamp } from "../core/math";
import type { Scene, SceneItem, Transform } from "../core/types";
import {
  compositionToScreen,
  screenToComposition,
  type Point,
  type Size,
  type View,
} from "./view";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** All eight handles, in the order they are drawn. */
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The four corners, clockwise from top-left — the order the outline polygon draws. */
export const CORNERS: readonly Handle[] = ["nw", "ne", "se", "sw"];

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

/** Each side's edge, as the two corners it runs between. */
const SIDE_EDGE: Record<"n" | "e" | "s" | "w", [Handle, Handle]> = {
  n: ["nw", "ne"],
  e: ["ne", "se"],
  s: ["se", "sw"],
  w: ["sw", "nw"],
};

export const isCorner = (handle: Handle): boolean =>
  EDGE[handle].x !== 0 && EDGE[handle].y !== 0;

export const HANDLE_CURSOR: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

/** Intrinsic (unscaled) size of a layer's source, or undefined when it isn't selectable. */
export type SizeLookup = (item: SceneItem) => Size | undefined;

/** Elements never scale below this on either axis — a collapsed box has nothing to grab. */
export const MIN_SCALE = 0.02;

/** Grab radius around a handle, in screen px. Constant regardless of zoom. */
export const HANDLE_HIT = 9;

/** Drawn edge of a corner handle, in screen px. Sides are draggable but undrawn. */
export const HANDLE_SIZE = 8;

/** How far outside a corner still grabs rotation, in screen px. */
export const ROTATE_REACH = 26;

/** Rotation snaps to this many degrees while Shift is held. */
export const ROTATE_SNAP = 15;

/**
 * Aspect-lock button centre, offset from the box's top-right corner in screen px.
 * Sits just outside the right edge, top-aligned with the box. Fixed rather than
 * proportional so it hugs the corner the same way at any element size.
 */
export const LOCK_OFFSET = { x: 21, y: 11 };

/** Drawn edge of the aspect-lock button, in screen px. Matches `.studio-lock` in CSS. */
export const LOCK_SIZE = 22;

/**
 * Slack around the lock button that still counts as hovering the element. Without it
 * the button sits in a gap outside the bounds, so reaching for it would clear the
 * hover and unmount it mid-approach.
 */
export const LOCK_PAD = 12;

/** Is a screen point on the lock button, or close enough to be heading for it? */
export function withinLock(screen: Point, lockCentre: Point): boolean {
  const half = LOCK_SIZE / 2 + LOCK_PAD;
  return (
    Math.abs(screen.x - lockCentre.x) <= half && Math.abs(screen.y - lockCentre.y) <= half
  );
}

const halfExtents = (state: Transform, size: Size): Point => ({
  x: (size.width * state.scaleX) / 2,
  y: (size.height * state.scaleY) / 2,
});

const axes = (rotation: number) => {
  const rad = (rotation * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
};

/** Local offset (along the element's own axes) to world space. */
const toWorld = (state: Transform, cos: number, sin: number, lx: number, ly: number): Point => ({
  x: state.x + lx * cos - ly * sin,
  y: state.y + lx * sin + ly * cos,
});

/** World point to a local offset from the element's centre. */
const toLocal = (state: Transform, cos: number, sin: number, p: Point): Point => {
  const dx = p.x - state.x;
  const dy = p.y - state.y;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
};

/** On-screen size of the element's box, in composition px. What the badge reports. */
export function boxSize(state: Transform, size: Size): Size {
  return { width: size.width * state.scaleX, height: size.height * state.scaleY };
}

/**
 * Half-width and half-height of the element's axis-aligned bounds, rotation included.
 * A turned box reaches further than its own edges, so this is what has to fit the frame.
 */
export function boundsHalf(state: Transform, size: Size): Point {
  const h = halfExtents(state, size);
  const { cos, sin } = axes(state.rotation);
  return {
    x: Math.abs(h.x * cos) + Math.abs(h.y * sin),
    y: Math.abs(h.x * sin) + Math.abs(h.y * cos),
  };
}

/** One axis of `clampToFrame`. Bounds cross over when the element outgrows the frame. */
function clampAxis(v: number, half: number, extent: number): number {
  return clamp(v, Math.min(half, extent - half), Math.max(half, extent - half));
}

/**
 * A centre moved the least distance that puts the element's bounds inside the frame.
 *
 * An element bigger than the frame on an axis cannot fit, so that axis inverts: it may
 * move only while it still covers the frame edge to edge. Without the inversion the
 * bounds would cross and pin an oversized element to a single point.
 */
export function clampToFrame(centre: Point, half: Point, frame: Size): Point {
  return {
    x: clampAxis(centre.x, half.x, frame.width),
    y: clampAxis(centre.y, half.y, frame.height),
  };
}

/** Every handle's position in composition space, rotation applied. */
export function handlePositions(state: Transform, size: Size): Record<Handle, Point> {
  const h = halfExtents(state, size);
  const { cos, sin } = axes(state.rotation);
  const out = {} as Record<Handle, Point>;
  for (const k of HANDLES) out[k] = toWorld(state, cos, sin, EDGE[k].x * h.x, EDGE[k].y * h.y);
  return out;
}

/** The four corners in composition space, clockwise from top-left. */
export function cornerPoints(state: Transform, size: Size): Point[] {
  const at = handlePositions(state, size);
  return CORNERS.map((k) => at[k]);
}

/** Is a composition-space point inside the element's rotated box? */
export function containsPoint(state: Transform, size: Size, p: Point): boolean {
  const h = halfExtents(state, size);
  if (!(h.x > 0) || !(h.y > 0)) return false;
  const { cos, sin } = axes(state.rotation);
  const l = toLocal(state, cos, sin, p);
  return Math.abs(l.x) <= h.x && Math.abs(l.y) <= h.y;
}

/** Topmost element under a composition-space point, or null. Later items paint on top. */
export function hitTest(scene: Scene, sizeOf: SizeLookup, p: Point): string | null {
  for (let i = scene.length - 1; i >= 0; i--) {
    const size = sizeOf(scene[i]);
    if (size && containsPoint(scene[i].state, size, p)) return scene[i].id;
  }
  return null;
}

/** Distance from `p` to the segment a-b. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/**
 * The handle under a screen point, or null.
 *
 * Corners are grabbed near their point; sides are grabbed anywhere along their edge,
 * so the whole perimeter resizes rather than just the midpoints. Corners are tested
 * first, so the ends of an edge belong to the corner.
 */
export function handleAtScreen(
  state: Transform,
  size: Size,
  screen: Point,
  viewport: Size,
  frame: Size,
  view: View,
): Handle | null {
  const at = handlePositions(state, size);
  const onScreen = {} as Record<Handle, Point>;
  for (const k of HANDLES) onScreen[k] = compositionToScreen(at[k], viewport, frame, view);

  let best: Handle | null = null;
  let bestDist = HANDLE_HIT;
  for (const k of CORNERS) {
    const p = onScreen[k];
    const d = Math.hypot(p.x - screen.x, p.y - screen.y);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  if (best) return best;

  for (const k of ["n", "e", "s", "w"] as const) {
    const [a, b] = SIDE_EDGE[k];
    const d = distanceToSegment(screen, onScreen[a], onScreen[b]);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

/**
 * Resize by dragging `handle` to `pointer`. The edges the handle does not touch stay
 * put, so the box grows away from the opposite corner or edge.
 *
 * Unlocked, each dragged edge follows the pointer on its own — corners stretch freely
 * and a side handle drives one axis alone. Locked, width and height hold their current
 * ratio: a corner drag projects onto the box diagonal, and a side drag scales the other
 * axis about the box's centre line.
 *
 * All of it runs in the element's local frame, so rotation is carried through untouched.
 */
export function resizeFrom(
  state: Transform,
  size: Size,
  handle: Handle,
  pointer: Point,
  lockAspect: boolean,
): { x: number; y: number; scaleX: number; scaleY: number } {
  const h = halfExtents(state, size);
  const unchanged = { x: state.x, y: state.y, scaleX: state.scaleX, scaleY: state.scaleY };
  if (!(h.x > 0) || !(h.y > 0) || !(size.width > 0) || !(size.height > 0)) return unchanged;

  const { cos, sin } = axes(state.rotation);
  const l = toLocal(state, cos, sin, pointer);
  const e = EDGE[handle];

  // The box in local space, centred on the element's current centre.
  let x0 = -h.x;
  let x1 = h.x;
  let y0 = -h.y;
  let y1 = h.y;

  if (lockAspect && isCorner(handle)) {
    // Project the drag onto the diagonal so one factor drives both axes.
    const vx = 2 * e.x * h.x;
    const vy = 2 * e.y * h.y;
    const raw =
      ((l.x + e.x * h.x) * vx + (l.y + e.y * h.y) * vy) / (vx * vx + vy * vy);
    const floor = MIN_SCALE / Math.min(state.scaleX, state.scaleY);
    const f = Math.max(Number.isFinite(raw) ? raw : 1, floor);
    if (e.x === 1) x1 = x0 + 2 * h.x * f;
    else x0 = x1 - 2 * h.x * f;
    if (e.y === 1) y1 = y0 + 2 * h.y * f;
    else y0 = y1 - 2 * h.y * f;
  } else {
    const minW = size.width * MIN_SCALE;
    const minH = size.height * MIN_SCALE;
    if (e.x === 1) x1 = Math.max(l.x, x0 + minW);
    else if (e.x === -1) x0 = Math.min(l.x, x1 - minW);
    if (e.y === 1) y1 = Math.max(l.y, y0 + minH);
    else if (e.y === -1) y0 = Math.min(l.y, y1 - minH);

    if (lockAspect) {
      // Side handle: the driven axis sets the factor, the other follows about the centre.
      if (e.x !== 0) {
        const half = h.y * ((x1 - x0) / (2 * h.x));
        y0 = -half;
        y1 = half;
      } else if (e.y !== 0) {
        const half = h.x * ((y1 - y0) / (2 * h.y));
        x0 = -half;
        x1 = half;
      }
    }
  }

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x: state.x + cx * cos - cy * sin,
    y: state.y + cx * sin + cy * cos,
    scaleX: (x1 - x0) / size.width,
    scaleY: (y1 - y0) / size.height,
  };
}

/**
 * What a pointer is over: a resize handle, the rotation band, or nothing.
 *
 * A rotate grip names the region it is nearest, so the cursor can be keyed to that
 * region rather than to the raw pointer angle.
 */
export type Grip =
  | { kind: "resize"; handle: Handle }
  | { kind: "rotate"; near: Handle };

/**
 * The grip under a screen point.
 *
 * Handles win: the bounds themselves resize. Rotation lives only just outside the four
 * corners — reaching past the middle of an edge grabs nothing, so sliding along an edge
 * never flashes a rotate cursor between one corner and the next.
 */
export function gripAtScreen(
  state: Transform,
  size: Size,
  screen: Point,
  viewport: Size,
  frame: Size,
  view: View,
): Grip | null {
  const handle = handleAtScreen(state, size, screen, viewport, frame, view);
  if (handle) return { kind: "resize", handle };

  if (containsPoint(state, size, screenToComposition(screen, viewport, frame, view))) {
    return null;
  }
  const at = handlePositions(state, size);
  let near: Handle | null = null;
  let bestDist = ROTATE_REACH;
  for (const k of CORNERS) {
    const p = compositionToScreen(at[k], viewport, frame, view);
    const d = Math.hypot(p.x - screen.x, p.y - screen.y);
    if (d < bestDist) {
      bestDist = d;
      near = k;
    }
  }
  return near ? { kind: "rotate", near } : null;
}

/**
 * Direction from the element's centre out through a handle, in degrees.
 *
 * The rotate cursor is keyed to this rather than to the pointer's own angle, so it is
 * one steady orientation per corner instead of swinging as the pointer moves. It still
 * turns with the element, since the handle does.
 */
export function regionAngle(state: Transform, size: Size, handle: Handle): number {
  return angleTo({ x: state.x, y: state.y }, handlePositions(state, size)[handle]);
}

/** Degrees from `centre` to `p`. The view has no rotation, so screen and composition
 *  space give the same angle. */
export function angleTo(centre: Point, p: Point): number {
  return (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI;
}

/** Fold an angle into (-180, 180] for display. */
export function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

/**
 * New absolute rotation from dragging to `pointer`. `startAngle` is the angle the
 * pointer sat at when the drag began, so the element tracks the pointer's swing
 * rather than jumping to it. Snapping applies to the resulting angle, not the delta.
 */
export function rotateFrom(
  state: Transform,
  pointer: Point,
  startAngle: number,
  snap: boolean,
): number {
  const swing = angleTo({ x: state.x, y: state.y }, pointer) - startAngle;
  const next = state.rotation + swing;
  return snap ? Math.round(next / ROTATE_SNAP) * ROTATE_SNAP : next;
}

const CURSOR_STEP = 15;
const cursorCache = new Map<number, string>();

/**
 * A curved-arrow cursor oriented to the pointer's angle around the element, so it
 * curves the way the element will turn. Quantised and cached — a drag reuses a
 * handful of strings rather than building one per pointer move.
 */
export function rotateCursor(pointerAngleDeg: number): string {
  const turn =
    (((Math.round((pointerAngleDeg + 135) / CURSOR_STEP) * CURSOR_STEP) % 360) + 360) % 360;
  const cached = cursorCache.get(turn);
  if (cached) return cached;
  const arc = "M4.5 12A7.5 7.5 0 0 1 12 4.5";
  const head = "M11.4 1.4 16.6 4.5 11.4 7.6Z";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g transform="rotate(${turn} 12 12)">` +
    // White underlay first, so the glyph stays legible on any backdrop.
    `<path d="${arc}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="${head}" fill="#fff" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="${arc}" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="${head}" fill="#111"/>` +
    `</g></svg>`;
  const css = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
  cursorCache.set(turn, css);
  return css;
}
