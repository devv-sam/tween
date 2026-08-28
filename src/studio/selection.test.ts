import { describe, it, expect } from "vitest";
import type { Scene, Transform } from "../core/types";
import {
  LOCK_OFFSET,
  LOCK_PAD,
  LOCK_SIZE,
  MIN_SCALE,
  boxSize,
  containsPoint,
  cornerPoints,
  handleAtScreen,
  handlePositions,
  hitTest,
  isCorner,
  resizeFrom,
  withinLock,
} from "./selection";
import { DEFAULT_VIEW_SCALE, compositionToScreen, type Size, type View } from "./view";

const size: Size = { width: 200, height: 100 };
const at = (x: number, y: number, scaleX = 1, scaleY = 1, rotation = 0): Transform => ({
  x,
  y,
  scaleX,
  scaleY,
  rotation,
  opacity: 1,
});

const frame: Size = { width: 1920, height: 1080 };
const viewport: Size = { width: 1200, height: 800 };
const view: View = { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 };

const item = (id: string, state: Transform) => ({
  id,
  source: { kind: "image" as const, value: "asset" },
  state,
});
const sizeOf = () => size;

// The box for `at(500, 300)`: x 400..600, y 250..350.
const state = at(500, 300);

describe("element bounds", () => {
  it("puts corners around the centre, clockwise from top-left", () => {
    expect(cornerPoints(state, size)).toEqual([
      { x: 400, y: 250 },
      { x: 600, y: 250 },
      { x: 600, y: 350 },
      { x: 400, y: 350 },
    ]);
  });

  it("puts side handles at edge midpoints", () => {
    const h = handlePositions(state, size);
    expect(h.n).toEqual({ x: 500, y: 250 });
    expect(h.e).toEqual({ x: 600, y: 300 });
    expect(h.s).toEqual({ x: 500, y: 350 });
    expect(h.w).toEqual({ x: 400, y: 300 });
  });

  it("scales the axes independently", () => {
    expect(boxSize(at(0, 0, 2, 3), size)).toEqual({ width: 400, height: 300 });
    expect(handlePositions(at(0, 0, 2, 3), size).se).toEqual({ x: 200, y: 150 });
  });

  it("knows corners from sides", () => {
    expect(isCorner("nw")).toBe(true);
    expect(isCorner("e")).toBe(false);
  });

  it("rotates handles about the centre", () => {
    const nw = cornerPoints(at(0, 0, 1, 1, 90), size)[0];
    expect(nw.x).toBeCloseTo(50);
    expect(nw.y).toBeCloseTo(-100);
  });
});

describe("containsPoint", () => {
  it("accepts the centre and edges, rejects points outside", () => {
    expect(containsPoint(state, size, { x: 500, y: 300 })).toBe(true);
    expect(containsPoint(state, size, { x: 400, y: 250 })).toBe(true);
    expect(containsPoint(state, size, { x: 601, y: 300 })).toBe(false);
    expect(containsPoint(state, size, { x: 500, y: 351 })).toBe(false);
  });

  it("respects a stretched axis", () => {
    // scaleY 2 makes the box 200 tall: y 200..400.
    expect(containsPoint(at(500, 300, 1, 2), size, { x: 500, y: 390 })).toBe(true);
    expect(containsPoint(state, size, { x: 500, y: 390 })).toBe(false);
  });

  it("follows the element's rotation", () => {
    const turned = at(0, 0, 1, 1, 90);
    expect(containsPoint(turned, size, { x: 0, y: 90 })).toBe(true);
    expect(containsPoint(turned, size, { x: 90, y: 0 })).toBe(false);
  });

  it("rejects a collapsed box", () => {
    expect(containsPoint(at(0, 0, 0, 1), size, { x: 0, y: 0 })).toBe(false);
  });
});

describe("hitTest", () => {
  const scene: Scene = [item("under", at(500, 300)), item("over", at(520, 300))];

  it("returns the topmost element under the point", () => {
    expect(hitTest(scene, sizeOf, { x: 500, y: 300 })).toBe("over");
  });

  it("falls through to what is below where the top element is absent", () => {
    expect(hitTest(scene, sizeOf, { x: 410, y: 300 })).toBe("under");
  });

  it("returns null on empty canvas", () => {
    expect(hitTest(scene, sizeOf, { x: 50, y: 50 })).toBeNull();
    expect(hitTest([], sizeOf, { x: 500, y: 300 })).toBeNull();
  });

  it("ignores sources with no known size", () => {
    expect(hitTest(scene, () => undefined, { x: 500, y: 300 })).toBeNull();
  });
});

describe("handleAtScreen", () => {
  const screenOf = (p: { x: number; y: number }, v = view) =>
    compositionToScreen(p, viewport, frame, v);

  it("finds corners and sides from their on-screen positions", () => {
    expect(handleAtScreen(state, size, screenOf({ x: 400, y: 250 }), viewport, frame, view)).toBe("nw");
    expect(handleAtScreen(state, size, screenOf({ x: 600, y: 350 }), viewport, frame, view)).toBe("se");
    expect(handleAtScreen(state, size, screenOf({ x: 600, y: 300 }), viewport, frame, view)).toBe("e");
    expect(handleAtScreen(state, size, screenOf({ x: 500, y: 250 }), viewport, frame, view)).toBe("n");
  });

  it("misses when the pointer is past the grab radius", () => {
    const nw = screenOf({ x: 400, y: 250 });
    expect(
      handleAtScreen(state, size, { x: nw.x - 40, y: nw.y - 40 }, viewport, frame, view),
    ).toBeNull();
  });

  it("keeps the grab radius in screen px as depth zoom changes", () => {
    const zoomed: View = { ...view, zoom: 4 };
    const nw = screenOf({ x: 400, y: 250 }, zoomed);
    expect(
      handleAtScreen(state, size, { x: nw.x + 5, y: nw.y }, viewport, frame, zoomed),
    ).toBe("nw");
  });

  it("grabs a side anywhere along its edge, not just the midpoint", () => {
    // Well away from the north edge's midpoint at x 500.
    expect(handleAtScreen(state, size, screenOf({ x: 450, y: 250 }), viewport, frame, view)).toBe("n");
    expect(handleAtScreen(state, size, screenOf({ x: 575, y: 250 }), viewport, frame, view)).toBe("n");
    expect(handleAtScreen(state, size, screenOf({ x: 600, y: 270 }), viewport, frame, view)).toBe("e");
    expect(handleAtScreen(state, size, screenOf({ x: 430, y: 350 }), viewport, frame, view)).toBe("s");
  });

  it("gives the ends of an edge to the corner", () => {
    expect(handleAtScreen(state, size, screenOf({ x: 404, y: 250 }), viewport, frame, view)).toBe("nw");
    expect(handleAtScreen(state, size, screenOf({ x: 596, y: 350 }), viewport, frame, view)).toBe("se");
  });

  it("still misses a point well clear of every edge", () => {
    expect(handleAtScreen(state, size, screenOf({ x: 500, y: 300 }), viewport, frame, view)).toBeNull();
    expect(handleAtScreen(state, size, screenOf({ x: 450, y: 290 }), viewport, frame, view)).toBeNull();
  });

  it("follows a rotated edge", () => {
    const turned = at(500, 300, 1, 1, 90);
    const h = handlePositions(turned, size);
    // A point partway along the rotated north edge, not at its midpoint.
    const along = { x: (h.nw.x + h.n.x) / 2, y: (h.nw.y + h.n.y) / 2 };
    expect(handleAtScreen(turned, size, screenOf(along), viewport, frame, view)).toBe("n");
  });

  it("prefers a corner where a tiny box makes handles overlap", () => {
    const tiny = at(500, 300, 0.05, 0.05);
    const at_ = handlePositions(tiny, size);
    expect(handleAtScreen(tiny, size, screenOf(at_.se), viewport, frame, view)).toBe("se");
  });
});

describe("resizeFrom — unlocked", () => {
  it("side handle drives one axis and leaves the other alone", () => {
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, false);
    expect(next).toEqual({ x: 550, y: 300, scaleX: 1.5, scaleY: 1 });
  });

  it("side handle holds the opposite edge", () => {
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, false);
    expect(handlePositions({ ...state, ...next }, size).w.x).toBeCloseTo(400);
  });

  it("vertical side handle drives height only", () => {
    const next = resizeFrom(state, size, "s", { x: 500, y: 450 }, false);
    expect(next).toEqual({ x: 500, y: 350, scaleX: 1, scaleY: 2 });
    expect(handlePositions({ ...state, ...next }, size).n.y).toBeCloseTo(250);
  });

  it("corner stretches both axes freely", () => {
    const next = resizeFrom(state, size, "se", { x: 700, y: 450 }, false);
    expect(next.scaleX).toBeCloseTo(1.5);
    expect(next.scaleY).toBeCloseTo(2);
    const nw = cornerPoints({ ...state, ...next }, size)[0];
    expect(nw.x).toBeCloseTo(400);
    expect(nw.y).toBeCloseTo(250);
  });

  it("never collapses an axis past the floor", () => {
    const next = resizeFrom(state, size, "e", { x: 100, y: 300 }, false);
    expect(next.scaleX).toBeCloseTo(MIN_SCALE);
    expect(next.scaleY).toBe(1);
  });
});

describe("resizeFrom — locked", () => {
  it("keeps the ratio when a corner is dragged", () => {
    const next = resizeFrom(state, size, "se", { x: 700, y: 450 }, true);
    expect(next.scaleY).toBeCloseTo(next.scaleX);
    const box = boxSize({ ...state, ...next }, size);
    expect(box.width / box.height).toBeCloseTo(size.width / size.height);
  });

  it("still anchors the opposite corner", () => {
    const next = resizeFrom(state, size, "se", { x: 700, y: 450 }, true);
    const nw = cornerPoints({ ...state, ...next }, size)[0];
    expect(nw.x).toBeCloseTo(400);
    expect(nw.y).toBeCloseTo(250);
  });

  it("moves both axes in tandem from a side handle", () => {
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, true);
    expect(next.scaleX).toBeCloseTo(1.5);
    expect(next.scaleY).toBeCloseTo(1.5);
  });

  it("holds the driven edge and grows the other axis about the centre line", () => {
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, true);
    const h = handlePositions({ ...state, ...next }, size);
    expect(h.w.x).toBeCloseTo(400);
    expect(next.y).toBeCloseTo(300);
    expect(h.n.y).toBeCloseTo(300 - 75);
    expect(h.s.y).toBeCloseTo(300 + 75);
  });

  it("preserves an already-stretched ratio rather than the source ratio", () => {
    const stretched = at(500, 300, 1, 2);
    const next = resizeFrom(stretched, size, "se", { x: 700, y: 500 }, true);
    expect(next.scaleY / next.scaleX).toBeCloseTo(2);
  });

  it("never collapses past the floor", () => {
    const next = resizeFrom(state, size, "se", { x: 100, y: 100 }, true);
    expect(next.scaleX).toBeCloseTo(MIN_SCALE);
    expect(next.scaleY).toBeCloseTo(MIN_SCALE);
  });
});

describe("resizeFrom — rotation", () => {
  it("carries rotation through and still anchors the opposite corner", () => {
    const turned = at(500, 300, 1, 1, 30);
    const before = cornerPoints(turned, size)[0];
    const next = resizeFrom(turned, size, "se", { x: 700, y: 450 }, true);
    const after = cornerPoints({ ...turned, ...next }, size)[0];
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("resizes along the element's own axes, not the screen's", () => {
    // Turned 90deg the local +X axis points down the screen, so a vertical drag is
    // what grows width. The same local displacement gives the same result as unrotated.
    const turned = at(0, 0, 1, 1, 90);
    const next = resizeFrom(turned, size, "e", { x: 0, y: 200 }, false);
    expect(next.scaleX).toBeCloseTo(1.5);
    expect(next.scaleY).toBeCloseTo(1);
    expect(resizeFrom(at(0, 0), size, "e", { x: 200, y: 0 }, false).scaleX).toBeCloseTo(1.5);
  });

  it("leaves a degenerate element alone", () => {
    expect(resizeFrom(at(10, 10, 0, 1), size, "se", { x: 99, y: 99 }, false)).toEqual({
      x: 10,
      y: 10,
      scaleX: 0,
      scaleY: 1,
    });
  });
});

describe("lock hover region", () => {
  // The lock hangs off the box's top-right, so the pointer must be able to leave the
  // bounds and reach it without the hover clearing on the way.
  const ne = { x: 600, y: 250 };
  const centre = { x: ne.x + LOCK_OFFSET.x, y: ne.y + LOCK_OFFSET.y };

  it("covers the button itself", () => {
    expect(withinLock(centre, centre)).toBe(true);
    const corner = { x: centre.x + LOCK_SIZE / 2 - 1, y: centre.y + LOCK_SIZE / 2 - 1 };
    expect(withinLock(corner, centre)).toBe(true);
  });

  it("bridges the gap back to the box edge", () => {
    // Walk from the box's right edge across to the button; no step may fall outside.
    for (let x = ne.x; x <= centre.x; x++) {
      expect(withinLock({ x, y: ne.y + LOCK_OFFSET.y }, centre)).toBe(true);
    }
  });

  it("does not extend indefinitely", () => {
    const far = LOCK_SIZE / 2 + LOCK_PAD + 1;
    expect(withinLock({ x: centre.x + far, y: centre.y }, centre)).toBe(false);
    expect(withinLock({ x: centre.x, y: centre.y + far }, centre)).toBe(false);
  });
});
