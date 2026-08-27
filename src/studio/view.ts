import { clamp } from "../core/math";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };

/** Screen-space view of the composition frame. */
export type View = {
  zoom: number;
  panX: number;
  panY: number;
};

/** Padding around the frame when fitted in the viewport, in screen pixels. */
export const FIT_PADDING = 64;
export const MAX_ZOOM = 8;
export const FIT_EPS = 1e-4;

export const DEFAULT_FRAME: Size = { width: 1920, height: 1080 };

export function fitZoom(viewport: Size, frame: Size, padding = FIT_PADDING): number {
  if (viewport.width <= 0 || viewport.height <= 0 || frame.width <= 0 || frame.height <= 0) return 1;
  const availW = Math.max(1, viewport.width - padding * 2);
  const availH = Math.max(1, viewport.height - padding * 2);
  return Math.min(availW / frame.width, availH / frame.height);
}

export function clampZoom(zoom: number, fit: number): number {
  return clamp(zoom, fit, MAX_ZOOM);
}

/** Overflow on each axis: how far the scaled frame exceeds the viewport. */
export function panExtents(zoom: number, viewport: Size, frame: Size): Point {
  return {
    x: Math.max(0, (frame.width * zoom - viewport.width) / 2),
    y: Math.max(0, (frame.height * zoom - viewport.height) / 2),
  };
}

export function isPannable(zoom: number, viewport: Size, frame: Size): boolean {
  const e = panExtents(zoom, viewport, frame);
  return e.x > FIT_EPS || e.y > FIT_EPS;
}

export function clampPan(pan: Point, zoom: number, viewport: Size, frame: Size): Point {
  const e = panExtents(zoom, viewport, frame);
  return { x: clamp(pan.x, -e.x, e.x) + 0, y: clamp(pan.y, -e.y, e.y) + 0 };
}

export function atFit(view: View, viewport: Size, frame: Size): boolean {
  return Math.abs(view.zoom - fitZoom(viewport, frame)) <= FIT_EPS && Math.abs(view.panX) <= FIT_EPS && Math.abs(view.panY) <= FIT_EPS;
}

/**
 * Screen-space top-left of the composition frame.
 * Composition (0,0) maps here; (frame.width, frame.height) maps to origin + frame * zoom.
 */
export function frameOrigin(viewport: Size, frame: Size, view: View): Point {
  return {
    x: (viewport.width - frame.width * view.zoom) / 2 + view.panX,
    y: (viewport.height - frame.height * view.zoom) / 2 + view.panY,
  };
}

export function compositionToScreen(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  return { x: o.x + p.x * view.zoom, y: o.y + p.y * view.zoom };
}

export function screenToComposition(p: Point, viewport: Size, frame: Size, view: View): Point {
  const o = frameOrigin(viewport, frame, view);
  const z = view.zoom === 0 ? 1 : view.zoom;
  return { x: (p.x - o.x) / z, y: (p.y - o.y) / z };
}

/** Zoom so `screen` stays over the same composition point, then clamp pan. */
export function zoomAround(
  screen: Point,
  nextZoom: number,
  viewport: Size,
  frame: Size,
  view: View,
): View {
  const zoom = clampZoom(nextZoom, fitZoom(viewport, frame));
  const comp = screenToComposition(screen, viewport, frame, view);
  const pan = clampPan(
    {
      x: screen.x - (viewport.width - frame.width * zoom) / 2 - comp.x * zoom,
      y: screen.y - (viewport.height - frame.height * zoom) / 2 - comp.y * zoom,
    },
    zoom,
    viewport,
    frame,
  );
  return { zoom, panX: pan.x, panY: pan.y };
}
