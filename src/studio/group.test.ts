import { describe, expect, it } from "vitest";
import {
  MIN_FACTOR,
  angleAt,
  boxCentre,
  mustStayUniform,
  resizeFactors,
  scaledAbout,
  snapSwing,
  turnedAbout,
  unionBox,
} from "./group";

const flat = (x: number, y: number, rotation = 0) => ({
  x,
  y,
  scaleX: 1,
  scaleY: 1,
  rotation,
  opacity: 1,
});

/** A 200 wide, 100 tall box with its top-left at (100, 100). */
const BOX = { minX: 100, minY: 100, maxX: 300, maxY: 200 };

describe("the box around a selection", () => {
  it("reaches around everything in it", () => {
    expect(
      unionBox([
        { minX: 10, minY: 40, maxX: 60, maxY: 90 },
        { minX: 30, minY: 10, maxX: 100, maxY: 50 },
      ]),
    ).toEqual({ minX: 10, minY: 10, maxX: 100, maxY: 90 });
  });

  it("is nothing around nothing", () => {
    expect(unionBox([])).toBeNull();
  });

  it("has a middle", () => {
    expect(boxCentre(BOX)).toEqual({ x: 200, y: 150 });
  });
});

describe("stretching the box", () => {
  it("leaves the opposite corner where it is", () => {
    const out = resizeFactors(BOX, "se", { x: 500, y: 300 }, false);
    expect(out.about).toEqual({ x: 100, y: 100 });
    // Was 200 wide and 100 tall from that corner; now 400 and 200.
    expect(out.fx).toBeCloseTo(2);
    expect(out.fy).toBeCloseTo(2);
  });

  it("anchors on whichever corner is opposite the one being dragged", () => {
    expect(resizeFactors(BOX, "nw", { x: 0, y: 0 }, false).about).toEqual({
      x: 300,
      y: 200,
    });
    expect(resizeFactors(BOX, "ne", { x: 0, y: 0 }, false).about).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("drives one axis from a side handle and leaves the other alone", () => {
    const out = resizeFactors(BOX, "e", { x: 500, y: 9999 }, false);
    expect(out.fx).toBeCloseTo(2);
    expect(out.fy).toBe(1);
  });

  it("anchors a side drag on the opposite edge, centred across it", () => {
    expect(resizeFactors(BOX, "e", { x: 500, y: 0 }, false).about).toEqual({
      x: 100,
      y: 150,
    });
  });

  it("takes one factor for both axes when it must stay square", () => {
    // Straight out along the diagonal: both axes double.
    const out = resizeFactors(BOX, "se", { x: 500, y: 300 }, true);
    expect(out.fx).toBeCloseTo(2);
    expect(out.fy).toBeCloseTo(2);
  });

  it("projects an off-diagonal drag rather than following either axis", () => {
    // Pulled far on x only: the diagonal answer is less than the x answer alone.
    const free = resizeFactors(BOX, "se", { x: 500, y: 200 }, false);
    const held = resizeFactors(BOX, "se", { x: 500, y: 200 }, true);
    expect(free.fx).toBeCloseTo(2);
    expect(free.fy).toBeCloseTo(1);
    expect(held.fx).toBeGreaterThan(1);
    expect(held.fx).toBeLessThan(2);
    expect(held.fy).toBe(held.fx);
  });

  it("holds a side drag square by driving both axes from the one it has", () => {
    const out = resizeFactors(BOX, "e", { x: 500, y: 0 }, true);
    expect(out.fx).toBeCloseTo(2);
    expect(out.fy).toBeCloseTo(2);
  });

  it("will not collapse the selection to nothing, or turn it inside out", () => {
    // Dragged back past the anchor, which would otherwise be a negative factor.
    const out = resizeFactors(BOX, "se", { x: 0, y: 0 }, false);
    expect(out.fx).toBe(MIN_FACTOR);
    expect(out.fy).toBe(MIN_FACTOR);
  });
});

describe("what a stretch does to each element", () => {
  it("moves it away from the anchor as well as growing it", () => {
    // Growing it in place would keep the gaps between elements the same, which is
    // not what stretching a selection looks like.
    expect(scaledAbout(flat(300, 200), { x: 100, y: 100 }, 2, 2)).toEqual({
      x: 500,
      y: 300,
      scaleX: 2,
      scaleY: 2,
    });
  });

  it("leaves an element sitting on the anchor exactly where it is", () => {
    const out = scaledAbout(flat(100, 100), { x: 100, y: 100 }, 3, 3);
    expect([out.x, out.y]).toEqual([100, 100]);
    expect([out.scaleX, out.scaleY]).toEqual([3, 3]);
  });

  it("takes each axis on its own when the stretch is not square", () => {
    const out = scaledAbout(flat(200, 200), { x: 100, y: 100 }, 2, 0.5);
    expect(out).toEqual({ x: 300, y: 150, scaleX: 2, scaleY: 0.5 });
  });

  it("multiplies whatever scale the element already had", () => {
    const from = { ...flat(100, 100), scaleX: 1.5, scaleY: 0.5 };
    const out = scaledAbout(from, { x: 100, y: 100 }, 2, 2);
    expect([out.scaleX, out.scaleY]).toEqual([3, 1]);
  });
});

describe("what a turn does to each element", () => {
  it("spins it and orbits it by the same angle", () => {
    const out = turnedAbout(flat(200, 100), { x: 100, y: 100 }, 90);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(200);
    expect(out.rotation).toBe(90);
  });

  it("adds to the turn the element already had", () => {
    expect(turnedAbout(flat(100, 100, 30), { x: 100, y: 100 }, 45).rotation).toBe(75);
  });

  it("leaves an element on the pivot turning in place", () => {
    const out = turnedAbout(flat(100, 100), { x: 100, y: 100 }, 45);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(100);
  });
});

describe("when a selection is not allowed out of square", () => {
  it("is free while everything in it is upright", () => {
    expect(mustStayUniform([flat(0, 0), flat(1, 1)])).toBe(false);
  });

  it("is held square the moment anything in it is turned", () => {
    // A rotated element stretched along someone else's axis is a parallelogram, and
    // `Transform` has no shear to hold one.
    expect(mustStayUniform([flat(0, 0), flat(1, 1, 30)])).toBe(true);
  });

  it("counts a whole turn as upright, because it is", () => {
    expect(mustStayUniform([flat(0, 0, 360)])).toBe(false);
  });
});

describe("the angle a turn is read from", () => {
  it("measures out from the middle", () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it("steps in whole notches only while asked", () => {
    expect(snapSwing(37, 15, true)).toBe(30);
    expect(snapSwing(37, 15, false)).toBe(37);
    expect(snapSwing(-37, 15, true)).toBe(-30);
  });
});
