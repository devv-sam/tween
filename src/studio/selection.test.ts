import { describe, it, expect } from "vitest";
import type { Scene, Transform } from "../core/types";
import {
  LOCK_OFFSET,
  LOCK_PAD,
  LOCK_SIZE,
  MIN_SCALE,
  ROTATE_REACH,
  ROTATE_SNAP,
  angleTo,
  boundsHalf,
  boxSize,
  clampToFrame,
  containsPoint,
  cornerPoints,
  gripAtScreen,
  handleAtScreen,
  handlePositions,
  hitTest,
  isCorner,
  normalizeAngle,
  regionAngle,
  resizeFrom,
  rotateCursor,
  rotateFrom,
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

describe("gripAtScreen", () => {
  const screenOf = (p: { x: number; y: number }) =>
    compositionToScreen(p, viewport, frame, view);
  const grip = (p: { x: number; y: number }) =>
    gripAtScreen(state, size, screenOf(p), viewport, frame, view);

  it("resizes on the bounds", () => {
    expect(grip({ x: 400, y: 250 })).toEqual({ kind: "resize", handle: "nw" });
    expect(grip({ x: 500, y: 250 })).toEqual({ kind: "resize", handle: "n" });
  });

  it("rotates just outside a corner, past the handle's reach", () => {
    expect(grip({ x: 380, y: 230 })).toEqual({ kind: "rotate", near: "nw" });
    expect(grip({ x: 620, y: 370 })).toEqual({ kind: "rotate", near: "se" });
  });

  it("grabs nothing past the middle of an edge", () => {
    // The whole point: sliding along an edge must never flash a rotate cursor.
    expect(grip({ x: 500, y: 230 })).toBeNull();
    expect(grip({ x: 500, y: 370 })).toBeNull();
    expect(grip({ x: 620, y: 300 })).toBeNull();
    expect(grip({ x: 380, y: 300 })).toBeNull();
  });

  it("gives the corner priority over the band where they overlap", () => {
    expect(grip({ x: 396, y: 246 })).toEqual({ kind: "resize", handle: "nw" });
  });

  it("is inert inside the element", () => {
    expect(grip({ x: 500, y: 300 })).toBeNull();
  });

  it("is inert far outside a corner", () => {
    const nw = screenOf({ x: 400, y: 250 });
    const past = ROTATE_REACH + 6;
    expect(
      gripAtScreen(
        state,
        size,
        { x: nw.x - past, y: nw.y - past },
        viewport,
        frame,
        view,
      ),
    ).toBeNull();
  });

  it("keeps the corner's reach constant on screen as depth zoom changes", () => {
    const zoomed: View = { ...view, zoom: 4 };
    const nw = compositionToScreen({ x: 400, y: 250 }, viewport, frame, zoomed);
    const justOutside = { x: nw.x - 14, y: nw.y - 14 };
    expect(gripAtScreen(state, size, justOutside, viewport, frame, zoomed)).toEqual({
      kind: "rotate",
      near: "nw",
    });
  });
});

describe("regionAngle", () => {
  it("points out through the handle, not at the pointer", () => {
    expect(regionAngle(state, size, "e")).toBeCloseTo(0);
    expect(regionAngle(state, size, "s")).toBeCloseTo(90);
    expect(Math.abs(regionAngle(state, size, "w"))).toBeCloseTo(180);
    expect(regionAngle(state, size, "n")).toBeCloseTo(-90);
  });

  it("gives one steady orientation per corner", () => {
    // Keyed to the corner, not the pointer, so it cannot drift while hovering there.
    const centre = { x: state.x, y: state.y };
    expect(regionAngle(state, size, "se")).toBeCloseTo(angleTo(centre, { x: 600, y: 350 }));
    expect(regionAngle(state, size, "nw")).toBeCloseTo(angleTo(centre, { x: 400, y: 250 }));
  });

  it("turns with the element", () => {
    expect(regionAngle({ ...state, rotation: 90 }, size, "e")).toBeCloseTo(90);
    expect(regionAngle({ ...state, rotation: 30 }, size, "s")).toBeCloseTo(120);
  });
});

describe("rotateFrom", () => {
  const centre = { x: state.x, y: state.y };

  it("turns the element by how far the pointer swings, not where it starts", () => {
    // Grab due east, drag to due south: a quarter turn, wherever the grab began.
    const start = angleTo(centre, { x: 700, y: 300 });
    expect(rotateFrom(state, { x: 500, y: 500 }, start, false)).toBeCloseTo(90);
  });

  it("adds the swing to an already-rotated element", () => {
    const turned = { ...state, rotation: 30 };
    const start = angleTo(centre, { x: 700, y: 300 });
    expect(rotateFrom(turned, { x: 500, y: 500 }, start, false)).toBeCloseTo(120);
  });

  it("does not move when the pointer has not swung", () => {
    const start = angleTo(centre, { x: 700, y: 300 });
    expect(rotateFrom(state, { x: 900, y: 300 }, start, false)).toBeCloseTo(0);
  });

  it("snaps the resulting angle, not the swing", () => {
    const start = angleTo(centre, { x: 700, y: 300 });
    // A swing of ~50deg snaps to 45, the nearest multiple of the step.
    const pointer = {
      x: centre.x + 200 * Math.cos((50 * Math.PI) / 180),
      y: centre.y + 200 * Math.sin((50 * Math.PI) / 180),
    };
    expect(rotateFrom(state, pointer, start, true)).toBeCloseTo(45);
    expect(rotateFrom(state, pointer, start, false)).toBeCloseTo(50);
    expect(ROTATE_SNAP).toBe(15);
  });
});

describe("normalizeAngle", () => {
  it("folds into (-180, 180]", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
  });
});

describe("rotateCursor", () => {
  it("is a cursor value with a hotspot and a fallback", () => {
    const css = rotateCursor(0);
    expect(css).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(css).toContain(") 12 12, crosshair");
  });

  it("reuses one string per quantised angle", () => {
    expect(rotateCursor(0)).toBe(rotateCursor(4));
    expect(rotateCursor(0)).not.toBe(rotateCursor(40));
  });

  it("wraps rather than running past a full turn", () => {
    expect(rotateCursor(0)).toBe(rotateCursor(360));
    expect(rotateCursor(-90)).toBe(rotateCursor(270));
  });
});

describe("frame bounds", () => {
  const frame: Size = { width: 1920, height: 1080 };
  const half = (state: Transform, s: Size = size) => boundsHalf(state, s);

  it("measures an unrotated box by its own half extents", () => {
    expect(half(at(0, 0))).toEqual({ x: 100, y: 50 });
    expect(half(at(0, 0, 2, 3))).toEqual({ x: 200, y: 150 });
  });

  it("grows the bounds as a box turns — a quarter turn swaps the axes", () => {
    const turned = half(at(0, 0, 1, 1, 90));
    expect(turned.x).toBeCloseTo(50);
    expect(turned.y).toBeCloseTo(100);
    // 45 degrees reaches furthest: both axes carry half of each side.
    const diagonal = half(at(0, 0, 1, 1, 45));
    expect(diagonal.x).toBeCloseTo((100 + 50) * Math.SQRT1_2);
  });

  it("leaves a centre alone when the element already fits", () => {
    expect(clampToFrame({ x: 960, y: 540 }, { x: 100, y: 50 }, frame)).toEqual({
      x: 960,
      y: 540,
    });
  });

  it("pulls an overhanging element back to the edge it crossed", () => {
    expect(clampToFrame({ x: -300, y: 20 }, { x: 100, y: 50 }, frame)).toEqual({
      x: 100,
      y: 50,
    });
    expect(clampToFrame({ x: 5000, y: 5000 }, { x: 100, y: 50 }, frame)).toEqual({
      x: 1820,
      y: 1030,
    });
  });

  it("bounds a rotated element by its turned corners, not its edges", () => {
    const state = at(0, 0, 1, 1, 90);
    const centre = clampToFrame({ x: 0, y: 0 }, half(state), frame);
    // Turned upright, the 100-tall box now reaches 100 sideways.
    expect(centre.x).toBeCloseTo(50);
    expect(centre.y).toBeCloseTo(100);
  });

  it("lets an element wider than the frame move only while it still covers it", () => {
    const wide = { x: 1200, y: 50 };
    expect(clampToFrame({ x: 960, y: 540 }, wide, frame).x).toBe(960);
    // Right edge of the frame is the furthest left it may sit, and vice versa.
    expect(clampToFrame({ x: -9999, y: 540 }, wide, frame).x).toBe(1920 - 1200);
    expect(clampToFrame({ x: 9999, y: 540 }, wide, frame).x).toBe(1200);
  });
});

