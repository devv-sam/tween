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
