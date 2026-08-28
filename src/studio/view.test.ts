import { describe, it, expect } from "vitest";
import {
  DEFAULT_VIEW_SCALE,
  MAX_ZOOM,
  MIN_ZOOM,
  clampPan,
  clampZoom,
  compositionToScreen,
  contentScale,
  frameOrigin,
  frameSize,
  isPannable,
  panExtents,
  screenToComposition,
  zoomAround,
  type Size,
  type View,
} from "./view";

const frame: Size = { width: 1920, height: 1080 };
const viewport: Size = { width: 1200, height: 800 };
const base: View = { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 };

function roundTrip(p: { x: number; y: number }, view: View) {
  const screen = compositionToScreen(p, viewport, frame, view);
  return screenToComposition(screen, viewport, frame, view);
}

describe("viewport scale", () => {
  it("defaults to 50% — the frame's screen width is half the composition", () => {
    expect(DEFAULT_VIEW_SCALE).toBe(0.5);
    expect(frameSize(frame, DEFAULT_VIEW_SCALE)).toEqual({ width: 960, height: 540 });
    expect(contentScale(base)).toBe(0.5);
  });

  it("centers the frame without using depth zoom", () => {
    const origin = frameOrigin(viewport, frame, { ...base, zoom: 4, panX: -100, panY: -40 });
    expect(origin.x).toBeCloseTo((1200 - 960) / 2);
    expect(origin.y).toBeCloseTo((800 - 540) / 2);
  });
});

describe("depth zoom", () => {
  it("does not change the frame's screen size", () => {
    const before = frameOrigin(viewport, frame, base);
    const after = zoomAround({ x: 600, y: 400 }, 3, viewport, frame, base);
    expect(after.scale).toBe(base.scale);
    expect(after.zoom).toBe(3);
    expect(frameOrigin(viewport, frame, after)).toEqual(before);
    expect(frameSize(frame, after.scale)).toEqual(frameSize(frame, base.scale));
  });

  it("cannot zoom out past 1 — the whole composition stays in the frame", () => {
    const next = zoomAround({ x: 600, y: 400 }, 0.01, viewport, frame, { ...base, zoom: 2 });
    expect(next.zoom).toBe(MIN_ZOOM);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
  });

  it("cannot zoom past MAX_ZOOM", () => {
    expect(zoomAround({ x: 600, y: 400 }, 99, viewport, frame, base).zoom).toBe(MAX_ZOOM);
  });

  it("keeps the composition point under the cursor stable", () => {
    const cursor = { x: 500, y: 300 };
    const before = screenToComposition(cursor, viewport, frame, base);
    const next = zoomAround(cursor, 2.5, viewport, frame, base);
    const after = compositionToScreen(before, viewport, frame, next);
    expect(after.x).toBeCloseTo(cursor.x, 6);
    expect(after.y).toBeCloseTo(cursor.y, 6);
  });
});

describe("pan inside the frame", () => {
  it("is locked at depth 1", () => {
    expect(panExtents(base, frame)).toEqual({ x: 0, y: 0 });
    expect(isPannable(base, frame)).toBe(false);
    expect(clampPan({ x: 400, y: -200 }, base, frame)).toEqual({ x: 0, y: 0 });
  });

  it("allows pan only to keep the frame filled when zoomed in", () => {
    const view: View = { ...base, zoom: 2 };
    const e = panExtents(view, frame);
    expect(e.x).toBeCloseTo(960);
    expect(e.y).toBeCloseTo(540);
    expect(isPannable(view, frame)).toBe(true);
    expect(clampPan({ x: 1e6, y: 1e6 }, view, frame)).toEqual({ x: 0, y: 0 });
    expect(clampPan({ x: -1e6, y: -1e6 }, view, frame)).toEqual({ x: -e.x, y: -e.y });
  });
});

describe("screen ↔ composition", () => {
  it("inverts at 50%, zoomed, and zoomed+panned", () => {
    const views: View[] = [
      base,
      { scale: 0.5, zoom: 2, panX: 0, panY: 0 },
      { scale: 0.5, zoom: 2, panX: -80, panY: -40 },
    ];
    const points = [
      { x: 0, y: 0 },
      { x: 960, y: 540 },
      { x: 1920, y: 1080 },
    ];
    for (const view of views) {
      for (const p of points) {
        const back = roundTrip(p, view);
        expect(back.x).toBeCloseTo(p.x, 8);
        expect(back.y).toBeCloseTo(p.y, 8);
      }
    }
  });

  it("maps the frame origin to composition (0, 0) at depth 1", () => {
    const origin = frameOrigin(viewport, frame, base);
    const comp = screenToComposition(origin, viewport, frame, base);
    expect(comp.x).toBeCloseTo(0);
    expect(comp.y).toBeCloseTo(0);
  });
});

describe("clampZoom", () => {
  it("clamps depth to [1, MAX_ZOOM]", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(2)).toBe(2);
  });
});
