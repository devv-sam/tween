import { describe, it, expect } from "vitest";
import "./index";
import { getModule } from "../registry";
import type { Transform, EvalCtx } from "../types";

const base: Transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
const ctx = (localT: number): EvalCtx => ({ t: localT, localT, u: 0, i: 0, count: 1 });
const km = getModule("keyframes");
const params = { property: "opacity", stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }] };

describe("keyframes module", () => {
  it("interpolates across stops", () => {
    expect(km.evaluate(base, ctx(0), params).opacity).toBe(0);
    expect(km.evaluate(base, ctx(0.5), params).opacity).toBeCloseTo(0.5);
    expect(km.evaluate(base, ctx(1), params).opacity).toBe(1);
  });
  it("emits non-empty code referencing the target", () => {
    const code = km.emit({ targetId: "card" }, params);
    expect(code).toContain("card");
    expect(code).toContain("animate");
  });
});
