import { clamp } from "../core/math";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/**
 * `scale` is the frame's on-screen scale when it is fitted (the viewport selector).
 * `zoom` multiplies it: the frame grows with zoom, edges and all, and can run past the
 * viewport. `panX` and `panY` are how far the frame's centre sits from the viewport's.
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
export const MAX_ZOOM = 32;
export const ZOOM_EPS = 1e-4;
export const ZOOM_PRESETS = [1, 1.5, 2, 4, 8, 16, 32] as const;
/** How much of a zoomed frame stays in the viewport when panned as far as it goes. */
export const PAN_KEEP = 64;

/** Clear space kept between the frame and every edge of the viewport. */
export const FRAME_MARGIN = 44;
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

export const zoomPercent = (zoom: number): number => Math.round(zoom * 100);

/**
 * How far the frame's centre can sit from the viewport's. Zero at fit — the frame is
 * centred and whole — and past it, far enough to reach any edge but never to lose it.
 */
export function panExtents(view: View, frame: Size, viewport: Size): Point {
  if (view.zoom <= 1 + ZOOM_EPS) return { x: 0, y: 0 };
  const size = frameSize(frame, contentScale(view));
  return {
    x: Math.max(0, (size.width + viewport.width) / 2 - PAN_KEEP),
    y: Math.max(0, (size.height + viewport.height) / 2 - PAN_KEEP),
  };
}

export const isPannable = (view: View): boolean => view.zoom > 1 + ZOOM_EPS;

export function clampPan(pan: Point, view: View, frame: Size, viewport: Size): Point {
  const e = panExtents(view, frame, viewport);
  return { x: clamp(pan.x, -e.x, e.x) + 0, y: clamp(pan.y, -e.y, e.y) + 0 };
}

/** Screen-space top-left of the composition frame, wherever zoom and pan have put it. */
export function frameOrigin(viewport: Size, frame: Size, view: View): Point {
  const size = frameSize(frame, contentScale(view));
  return {
    x: (viewport.width - size.width) / 2 + view.panX,
    y: (viewport.height - size.height) / 2 + view.panY,
  };
}

export function compositionToScreen(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  const s = contentScale(view);
  return { x: o.x + p.x * s, y: o.y + p.y * s };
}

export function screenToComposition(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  const s = contentScale(view) || 1;
  return { x: (p.x - o.x) / s, y: (p.y - o.y) / s };
}

/** Zoom so `screen` stays over the same composition point. The frame grows around it. */
export function zoomAround(
  screen: Point,
  nextZoom: number,
  viewport: Size,
  frame: Size,
  view: View,
): View {
  const zoom = clampZoom(nextZoom);
  const comp = screenToComposition(screen, viewport, frame, view);
  const s = view.scale * zoom;
  const size = frameSize(frame, s);
  const next: View = {
    scale: view.scale,
    zoom,
    panX: screen.x - comp.x * s - (viewport.width - size.width) / 2,
    panY: screen.y - comp.y * s - (viewport.height - size.height) / 2,
  };
  const pan = clampPan({ x: next.panX, y: next.panY }, next, frame, viewport);
  return { ...next, panX: pan.x, panY: pan.y };
}
