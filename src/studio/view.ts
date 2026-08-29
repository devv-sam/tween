import { clamp } from "../core/math";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/**
 * `scale` is the on-screen size of the composition frame (viewport selector).
 * `zoom` is depth inside that frame — it does not change the frame's screen width.
 */
export type View = {
  scale: number;
  zoom: number;
  panX: number;
  panY: number;
};

export const DEFAULT_FRAME: Size = { width: 1920, height: 1080 };
export const DEFAULT_VIEW_SCALE = 0.5;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_EPS = 1e-4;

/** Clear space kept between the frame and every edge of the viewport. */
export const FRAME_MARGIN = 24;
/** Floor for `fitScale`, so a sliver of a viewport still leaves a frame to draw. */
export const MIN_VIEW_SCALE = 0.02;

/**
 * The largest scale at or below `preferred` that leaves the whole frame, plus its
 * margin, inside the viewport. The frame is the composition's edge — it reads as an
 * edge only while it is wholly on screen, so it shrinks rather than run under the chrome.
 */
export function fitScale(
  viewport: Size,
  frame: Size,
  preferred: number = DEFAULT_VIEW_SCALE,
): number {
  if (viewport.width < 1 || viewport.height < 1) return preferred;
  const room = {
    width: viewport.width - FRAME_MARGIN * 2,
    height: viewport.height - FRAME_MARGIN * 2,
  };
  const fit = Math.min(room.width / frame.width, room.height / frame.height);
  return clamp(Math.min(preferred, fit), MIN_VIEW_SCALE, preferred);
}

export function contentScale(view: View): number {
  return view.scale * view.zoom;
}

export function frameSize(frame: Size, scale: number): Size {
  return { width: frame.width * scale, height: frame.height * scale };
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

/** How far content can pan inside the frame. Zero at depth 1 — the frame is filled exactly. */
export function panExtents(view: View, frame: Size): Point {
  return {
    x: Math.max(0, frame.width * view.scale * (view.zoom - 1)),
    y: Math.max(0, frame.height * view.scale * (view.zoom - 1)),
  };
}

export function isPannable(view: View, frame: Size): boolean {
  const e = panExtents(view, frame);
  return e.x > ZOOM_EPS || e.y > ZOOM_EPS;
}

export function clampPan(pan: Point, view: View, frame: Size): Point {
  const e = panExtents(view, frame);
  return { x: clamp(pan.x, -e.x, 0) + 0, y: clamp(pan.y, -e.y, 0) + 0 };
}

/** Screen-space top-left of the composition frame. Independent of depth zoom. */
export function frameOrigin(viewport: Size, frame: Size, view: View): Point {
  const size = frameSize(frame, view.scale);
  return {
    x: (viewport.width - size.width) / 2,
    y: (viewport.height - size.height) / 2,
  };
}

export function compositionToScreen(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  const s = contentScale(view);
  return { x: o.x + view.panX + p.x * s, y: o.y + view.panY + p.y * s };
}

export function screenToComposition(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  const s = contentScale(view) || 1;
  return { x: (p.x - o.x - view.panX) / s, y: (p.y - o.y - view.panY) / s };
}

/** Depth-zoom so `screen` stays over the same composition point. Frame size does not change. */
export function zoomAround(
  screen: Point,
  nextZoom: number,
  viewport: Size,
  frame: Size,
  view: View,
): View {
  const zoom = clampZoom(nextZoom);
  const comp = screenToComposition(screen, viewport, frame, view);
  const o = frameOrigin(viewport, frame, view);
  const s = view.scale * zoom;
  const next: View = {
    scale: view.scale,
    zoom,
    panX: screen.x - o.x - comp.x * s,
    panY: screen.y - o.y - comp.y * s,
  };
  const pan = clampPan({ x: next.panX, y: next.panY }, next, frame);
  return { ...next, panX: pan.x, panY: pan.y };
}
