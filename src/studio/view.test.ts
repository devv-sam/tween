import { describe, it, expect } from "vitest";
import {
  FIT_PADDING,
  MAX_ZOOM,
  atFit,
  clampPan,
  clampZoom,
  compositionToScreen,
  fitZoom,
  frameOrigin,
  isPannable,
  panExtents,
  screenToComposition,
  zoomAround,
  type Size,
  type View,
} from "./view";

const frame: Size = { width: 1920, height: 1080 };
const viewport: Size = { width: 1200, height: 800 };

const expectedFit = Math.min(
  (viewport.width - FIT_PADDING * 2) / frame.width,
  (viewport.height - FIT_PADDING * 2) / frame.height,
);

function roundTrip(p: { x: number; y: number }, view: View) {
  const screen = compositionToScreen(p, viewport, frame, view);
  return screenToComposition(screen, viewport, frame, view);
}

describe("fitZoom", () => {
  it("fits the frame inside the viewport with padding", () => {
    expect(fitZoom(viewport, frame)).toBeCloseTo(expectedFit);
    expect(expectedFit).toBeLessThan(1);
  });

  it("is limited by the tighter axis", () => {
    const tall: Size = { width: 400, height: 2000 };
    expect(fitZoom(tall, frame)).toBeCloseTo((400 - FIT_PADDING * 2) / 1920);
  });

  it("returns 1 for an unmeasured viewport", () => {
    expect(fitZoom({ width: 0, height: 0 }, frame)).toBe(1);
  });
});

describe("pan extents", () => {
  it("are zero at fit — nowhere to pan", () => {
    const z = fitZoom(viewport, frame);
    expect(panExtents(z, viewport, frame)).toEqual({ x: 0, y: 0 });
    expect(isPannable(z, viewport, frame)).toBe(false);
    expect(clampPan({ x: 400, y: -200 }, z, viewport, frame)).toEqual({ x: 0, y: 0 });
  });

  it("stay zero until the scaled frame exceeds the viewport", () => {
    const z = fitZoom(viewport, frame) * 1.05;
    expect(frame.width * z).toBeLessThan(viewport.width);
    expect(isPannable(z, viewport, frame)).toBe(false);
  });

  it("allow pan only on overflowing axes, like a zoomed photo", () => {
    const z = 2;
    const e = panExtents(z, viewport, frame);
    expect(e.x).toBeCloseTo((frame.width * z - viewport.width) / 2);
    expect(e.y).toBeCloseTo((frame.height * z - viewport.height) / 2);
    expect(isPannable(z, viewport, frame)).toBe(true);
    expect(clampPan({ x: 1e6, y: -1e6 }, z, viewport, frame)).toEqual({ x: e.x, y: -e.y });
  });

  it("keeps the frame covering the viewport when zoomed in", () => {
    const z = 2;
    const e = panExtents(z, viewport, frame);
    for (const panX of [-e.x, 0, e.x]) {
      const origin = frameOrigin(viewport, frame, { zoom: z, panX, panY: 0 });
      expect(origin.x).toBeLessThanOrEqual(1e-6);
      expect(origin.x + frame.width * z).toBeGreaterThanOrEqual(viewport.width - 1e-6);
    }
  });
});

describe("screen ↔ composition", () => {
  it("inverts at fit, 100%, and zoomed+panned", () => {
    const views: View[] = [
      { zoom: expectedFit, panX: 0, panY: 0 },
      { zoom: 1, panX: 0, panY: 0 },
      { zoom: 2, panX: 80, panY: -40 },
    ];
    const points = [
      { x: 0, y: 0 },
      { x: 960, y: 540 },
      { x: 1920, y: 1080 },
      { x: -80, y: 1200 },
    ];
    for (const view of views) {
      for (const p of points) {
        const back = roundTrip(p, view);
        expect(back.x).toBeCloseTo(p.x, 8);
        expect(back.y).toBeCloseTo(p.y, 8);
      }
    }
  });

  it("maps the frame origin to composition (0, 0)", () => {
    const view: View = { zoom: 1.4, panX: 50, panY: -20 };
    const origin = frameOrigin(viewport, frame, view);
    const comp = screenToComposition(origin, viewport, frame, view);
    expect(comp.x).toBeCloseTo(0);
    expect(comp.y).toBeCloseTo(0);
  });
});

describe("zoomAround", () => {
  it("keeps the composition point under the cursor stable", () => {
    const view: View = { zoom: 1, panX: 0, panY: 0 };
    const cursor = { x: 400, y: 250 };
    const before = screenToComposition(cursor, viewport, frame, view);
    const next = zoomAround(cursor, 2.2, viewport, frame, view);
    const after = compositionToScreen(before, viewport, frame, next);
    expect(after.x).toBeCloseTo(cursor.x, 6);
    expect(after.y).toBeCloseTo(cursor.y, 6);
  });

  it("cannot zoom out past fit", () => {
    const view: View = { zoom: 1, panX: 0, panY: 0 };
    const next = zoomAround({ x: 600, y: 400 }, 0.01, viewport, frame, view);
    expect(next.zoom).toBeCloseTo(expectedFit);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
  });

  it("cannot zoom past MAX_ZOOM", () => {
    const view: View = { zoom: 1, panX: 0, panY: 0 };
    expect(zoomAround({ x: 600, y: 400 }, 99, viewport, frame, view).zoom).toBe(MAX_ZOOM);
  });

  it("reports atFit only when zoomed to fit with no pan", () => {
    const fit = { zoom: expectedFit, panX: 0, panY: 0 };
    expect(atFit(fit, viewport, frame)).toBe(true);
    expect(atFit({ ...fit, zoom: 1 }, viewport, frame)).toBe(false);
  });
});

describe("clampZoom", () => {
  it("clamps to [fit, MAX_ZOOM]", () => {
    expect(clampZoom(0, expectedFit)).toBeCloseTo(expectedFit);
    expect(clampZoom(99, expectedFit)).toBe(MAX_ZOOM);
    expect(clampZoom(1, expectedFit)).toBe(1);
  });
});
