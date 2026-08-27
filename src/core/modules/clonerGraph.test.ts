import { describe, it, expect } from "vitest";
import "./index";
import { getModule } from "../registry";
import type { Transform, EvalCtx } from "../types";

const base: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const ctx = (u: number): EvalCtx => ({ t: 0, localT: 0, u, i: 0, count: 3, field: () => 0 });
const g = getModule("clonerGraph");
const params = { property: "scale", blend: "mul", stops: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }] };

describe("clonerGraph", () => {
  it("varies a property by u", () => {
    expect(g.evaluate(base, ctx(0), params).scale).toBeCloseTo(0.5);
    expect(g.evaluate(base, ctx(1), params).scale).toBeCloseTo(1.5);
  });
});
