import { describe, it, expect } from "vitest";
import "./index";
import { getModule } from "../registry";
import type { Transform, EvalCtx } from "../types";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const ctx = (tSec: number, i = 0, count = 4): EvalCtx => ({
  t: 0, tSec, localT: 0, u: i / Math.max(count - 1, 1), i, count, field: () => 0,
});
const p = getModule("pulse");

describe("pulse", () => {
  it("oscillates scale between min and max", () => {
    const params = { property: "scale", rhythm: 1, min: 0.5, max: 1.5, stagger: 0, blend: "mul" };
    // sin(0) = 0 → midpoint = 1.0
    expect(p.evaluate(base, ctx(0), params).scaleX).toBeCloseTo(1.0);
    // sin(π/2) = 1 → max = 1.5
    expect(p.evaluate(base, ctx(0.25), params).scaleX).toBeCloseTo(1.5);
    // sin(π) = 0 → midpoint = 1.0
    expect(p.evaluate(base, ctx(0.5), params).scaleX).toBeCloseTo(1.0);
    // sin(3π/2) = -1 → min = 0.5
    expect(p.evaluate(base, ctx(0.75), params).scaleX).toBeCloseTo(0.5);
  });

  it("drives both scale axes", () => {
    const params = { property: "scale", rhythm: 1, min: 0.5, max: 1.5, stagger: 0, blend: "mul" };
    const out = p.evaluate(base, ctx(0.25), params);
    expect(out.scaleY).toBeCloseTo(out.scaleX);
  });

  it("staggers clones by index", () => {
    const params = { property: "scale", rhythm: 1, min: 0.5, max: 1.5, stagger: 0.25, blend: "mul" };
    // clone 0 at tSec=0: sin(0) → midpoint
    expect(p.evaluate(base, ctx(0, 0), params).scaleX).toBeCloseTo(1.0);
    // clone 1 at tSec=0: phase = 0.25, sin(2π * 1 * 0.25) = sin(π/2) → max
    expect(p.evaluate(base, ctx(0, 1), params).scaleX).toBeCloseTo(1.5);
  });

  it("applies add blend for position", () => {
    const params = { property: "x", rhythm: 1, min: -10, max: 10, stagger: 0, blend: "add" };
    // sin(π/2) = 1 → max = 10, add to base x=0
    expect(p.evaluate(base, ctx(0.25), params).x).toBeCloseTo(10);
  });

  it("uses default params when none given", () => {
    const out = p.evaluate(base, ctx(0), {});
    // default: scale, rhythm 1, min 0.8, max 1.2, mul
    // sin(0) → midpoint = 1.0, mul with base 1 = 1.0
    expect(out.scaleX).toBeCloseTo(1.0);
  });

  it("rhythm controls speed", () => {
    const params = { property: "scale", rhythm: 2, min: 0, max: 2, stagger: 0, blend: "mul" };
    // rhythm 2: full cycle in 0.5s. At 0.25s: sin(2π*2*0.25) = sin(π) ≈ 0 → midpoint
    expect(p.evaluate(base, ctx(0.25), params).scaleX).toBeCloseTo(1.0);
  });
});
