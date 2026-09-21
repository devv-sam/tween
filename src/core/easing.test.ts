import { describe, it, expect } from "vitest";
import {
  PRESETS,
  bezierEase,
  easeKey,
  easeValue,
  isLinearEase,
  presetOf,
  springEase,
  type EasingDef,
} from "./easing";
import { blendAt, sampleStops } from "./curve";

const bezier = (name: keyof typeof PRESETS) => PRESETS[name] as EasingDef & { kind: "bezier" };

describe("bezier easing", () => {
  it("pins both ends and passes through the middle of a symmetric curve", () => {
    const { x1, y1, x2, y2 } = bezier("in-out");
    expect(bezierEase(0, x1, y1, x2, y2)).toBe(0);
    expect(bezierEase(1, x1, y1, x2, y2)).toBe(1);
    expect(bezierEase(0.5, x1, y1, x2, y2)).toBeCloseTo(0.5, 6);
  });

  it("matches the identity when the control points sit on the diagonal", () => {
    for (const t of [0.1, 0.33, 0.5, 0.87]) {
      expect(bezierEase(t, 0, 0, 1, 1)).toBeCloseTo(t, 6);
    }
  });

  it("solves a curve the Newton step alone would stall on", () => {
    // Flat at both ends: the derivative is near zero where the solver starts.
    const at = bezierEase(0.5, 1, 0, 0, 1);
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(1);
    expect(bezierEase(0.999, 1, 0, 0, 1)).toBeGreaterThan(at);
  });

  it("eases in — behind the line early, and never past its ends", () => {
    const { x1, y1, x2, y2 } = bezier("ease in");
    expect(bezierEase(0.25, x1, y1, x2, y2)).toBeLessThan(0.25);
    expect(bezierEase(0.9, x1, y1, x2, y2)).toBeLessThanOrEqual(1);
  });

  it("overshoots on a back curve, which is what the negative handle is for", () => {
    const { x1, y1, x2, y2 } = bezier("ease in back");
    const dip = Math.min(...[0.1, 0.2, 0.3].map((t) => bezierEase(t, x1, y1, x2, y2)));
    expect(dip).toBeLessThan(0);
  });
});

describe("spring easing", () => {
  it("starts at nothing and settles on its destination", () => {
    expect(springEase(0, 1, 100, 10)).toBe(0);
    expect(springEase(1, 1, 100, 10)).toBe(1);
  });

  it("swings past the destination when it is underdamped", () => {
    const peak = Math.max(
      ...Array.from({ length: 60 }, (_, i) => springEase((i + 1) / 80, 1, 180, 4)),
    );
    expect(peak).toBeGreaterThan(1);
  });

  it("never passes its destination when it is heavily damped", () => {
    for (let i = 0; i <= 60; i++) {
      expect(springEase(i / 60, 1, 100, 50)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("reads the same twice — the table is cached, not rebuilt", () => {
    expect(springEase(0.4, 1, 120, 8)).toBe(springEase(0.4, 1, 120, 8));
  });
});

describe("what a stop's easing can be", () => {
  it("keeps the named easings working, so old compositions read as they did", () => {
    expect(easeValue("linear", 0.4)).toBeCloseTo(0.4, 6);
    expect(easeValue("in", 0.5)).toBeCloseTo(0.125, 6);
    expect(easeValue(undefined, 0.7)).toBeCloseTo(0.7, 6);
  });

  it("evaluates a curve of its own", () => {
    expect(easeValue({ kind: "linear" }, 0.4)).toBeCloseTo(0.4, 6);
    expect(easeValue(bezier("ease out"), 0.25)).toBeGreaterThan(0.25);
    expect(easeValue({ kind: "spring", mass: 1, stiffness: 100, damping: 10 }, 1)).toBe(1);
  });

  it("names a curve the same way however it was written", () => {
    expect(easeKey(undefined)).toBe(easeKey("linear"));
    expect(easeKey({ kind: "linear" })).toBe(easeKey("linear"));
    expect(easeKey(bezier("ease in"))).not.toBe(easeKey(bezier("ease out")));
  });

  it("knows which curves are the identity", () => {
    expect(isLinearEase(undefined)).toBe(true);
    expect(isLinearEase(PRESETS.linear)).toBe(true);
    expect(isLinearEase(bezier("in-out"))).toBe(false);
    expect(isLinearEase({ kind: "spring", mass: 1, stiffness: 100, damping: 10 })).toBe(false);
  });

  it("lights up the chip a curve is standing on, and none for one dragged off them", () => {
    expect(presetOf(PRESETS["ease out back"])).toBe("ease out back");
    expect(presetOf("inout")).toBe("in-out");
    expect(presetOf({ kind: "bezier", x1: 0.11, y1: 0.9, x2: 0.3, y2: 0.2 })).toBeNull();
    expect(presetOf({ kind: "spring", mass: 1, stiffness: 100, damping: 10 })).toBeNull();
  });
});

describe("a curve on a stop", () => {
  it("carries the value between its two stops", () => {
    const stops = [
      { t: 0, v: 0 },
      { t: 1, v: 100, ease: bezier("ease in") },
    ];
    // Easing in means still behind the straight line halfway through.
    expect(sampleStops(stops, 0.5)).toBeLessThan(50);
    expect(sampleStops(stops, 0)).toBe(0);
    expect(sampleStops(stops, 1)).toBe(100);
  });

  it("belongs to the segment arriving at the stop, not the one leaving it", () => {
    const stops = [
      { t: 0, v: 0 },
      { t: 0.5, v: 50 },
      { t: 1, v: 100, ease: bezier("ease in") },
    ];
    // The first half has no curve on its destination, so it stays a straight line.
    expect(sampleStops(stops, 0.25)).toBeCloseTo(25, 6);
    expect(sampleStops(stops, 0.75)).toBeLessThan(75);
  });
});

describe("blend on a stop", () => {
  it("is the arriving segment's, and falls back to replacing the value", () => {
    const stops = [
      { t: 0, v: 0 },
      { t: 0.5, v: 1, blend: "add" as const },
      { t: 1, v: 2, blend: "mul" as const },
    ];
    expect(blendAt(stops, 0.25)).toBe("add");
    expect(blendAt(stops, 0.75)).toBe("mul");
    expect(blendAt([{ t: 0, v: 0 }, { t: 1, v: 1 }], 0.5)).toBe("set");
  });
});
