import { describe, it, expect } from "vitest";
import { expand } from "./distribute";
import type { Layer } from "./types";

const layer: Layer = {
  id: "c", source: { kind: "shape", value: "#000" },
  base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  distributor: { type: "path", count: 3, params: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } },
};

describe("path distributor", () => {
  it("spreads instances with correct u and increasing x", () => {
    const inst = expand(layer);
    expect(inst.map((i) => i.u)).toEqual([0, 0.5, 1]);
    expect(inst[0].base.x).toBeCloseTo(0);
    expect(inst[2].base.x).toBeCloseTo(100);
  });
});

describe("grid distributor", () => {
  const grid = (count: number, params: Record<string, unknown>) =>
    expand({
      id: "g",
      source: { kind: "shape", value: "rect" },
      base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      distributor: { type: "grid", count, params },
    });

  it("fills rows left to right at the gaps asked for", () => {
    const at = grid(4, { cols: 2, gapX: 10, gapY: 20 }).map((i) => [i.base.x, i.base.y]);
    expect(at).toEqual([
      [-5, -10],
      [5, -10],
      [-5, 10],
      [5, 10],
    ]);
  });

  it("centres the block on where the element already stands", () => {
    const at = grid(3, { cols: 3, gapX: 10, gapY: 10 }).map((i) => i.base.x);
    expect(at).toEqual([-10, 0, 10]);
  });
});

describe("radial distributor", () => {
  const radial = (count: number, params: Record<string, unknown>) =>
    expand({
      id: "r",
      source: { kind: "shape", value: "rect" },
      base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      distributor: { type: "radial", count, params },
    });

  it("closes a full turn without doubling a clone on the first", () => {
    const at = radial(4, { radius: 10, startAngle: 0 }).map((i) => [
      Math.round(i.base.x),
      Math.round(i.base.y),
    ]);
    expect(at).toEqual([
      [10, 0],
      [0, 10],
      [-10, 0],
      [-0, -10],
    ]);
  });

  it("reaches the far end of a partial arc", () => {
    const at = radial(3, { radius: 10, startAngle: 0, sweep: 180 }).map((i) =>
      Math.round(i.base.x),
    );
    expect(at).toEqual([10, 0, -10]);
  });
});
