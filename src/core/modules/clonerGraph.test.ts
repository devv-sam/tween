import { describe, it, expect } from "vitest";
import "./index";
import { getModule } from "../registry";
import type { Transform, EvalCtx } from "../types";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const ctx = (u: number, localT = 0): EvalCtx => ({ t: 0, tSec: 0, localT, u, i: 0, count: 3, field: () => 0 });
const g = getModule("clonerGraph");

describe("clonerGraph", () => {
  it("varies a property by u via indexStops", () => {
    const params = { property: "scale", blend: "mul", indexStops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }] };
    expect(g.evaluate(base, ctx(0), params).scaleX).toBeCloseTo(0.5);
    expect(g.evaluate(base, ctx(1), params).scaleX).toBeCloseTo(1.5);
  });

  it("drives both axes through the virtual `scale` prop", () => {
    const params = { property: "scale", blend: "mul", indexStops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }] };
    const out = g.evaluate(base, ctx(1), params);
    expect(out.scaleY).toBeCloseTo(out.scaleX);
  });

  it("falls back to legacy stops for spatial curve", () => {
    const params = { property: "scale", blend: "mul", stops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }] };
    expect(g.evaluate(base, ctx(0), params).scaleX).toBeCloseTo(0.5);
    expect(g.evaluate(base, ctx(1), params).scaleX).toBeCloseTo(1.5);
  });

  it("animates over time via timeStops", () => {
    const params = { property: "scale", blend: "mul", timeStops: [{ t: 0, v: 1 }, { t: 1, v: 2 }] };
    expect(g.evaluate(base, ctx(0, 0), params).scaleX).toBeCloseTo(1);
    expect(g.evaluate(base, ctx(0, 1), params).scaleX).toBeCloseTo(2);
  });

  it("combines index and time with mul blend", () => {
    const params = {
      property: "scale",
      blend: "mul",
      indexStops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }],
      timeStops: [{ t: 0, v: 1 }, { t: 1, v: 2 }],
    };
    // u=0 → index 0.5, localT=1 → time 2, combined = 0.5 * 2 = 1
    expect(g.evaluate(base, ctx(0, 1), params).scaleX).toBeCloseTo(1);
    // u=1 → index 1.5, localT=0.5 → time 1.5, combined = 1.5 * 1.5 = 2.25
    expect(g.evaluate(base, ctx(1, 0.5), params).scaleX).toBeCloseTo(2.25);
  });

  it("combines index and time with add blend", () => {
    const params = {
      property: "scale",
      blend: "add",
      indexStops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }],
      timeStops: [{ t: 0, v: 1 }, { t: 1, v: 2 }],
    };
    // u=0 → index 0.5, localT=1 → time 2, combined = 0.5 * 2 = 1.0, applied as add: base + 1.0
    expect(g.evaluate(base, ctx(0, 1), params).scaleX).toBeCloseTo(2);
  });

  it("returns identity when no stops provided", () => {
    const params = { property: "scale", blend: "mul" };
    expect(g.evaluate(base, ctx(0.5, 0.5), params).scaleX).toBeCloseTo(1);
  });
});
