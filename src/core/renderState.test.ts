import { describe, it, expect } from "vitest";
import "./modules/index";
import { renderState } from "./renderState";
import { emitComposition } from "./emit";
import type { Composition, Transform } from "./types";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const comp: Composition = {
  fps: 30,
  duration: 1,
  driver: { kind: "time" },
  tracks: [
    {
      layer: { id: "card", source: { kind: "shape", value: "rect" }, base },
      modules: [{ type: "move", range: [0, 1], params: { from: 0, to: 100 } }],
    },
  ],
};

describe("renderState (evaluate face)", () => {
  it("evaluates the module across its range", () => {
    expect(renderState(comp, 0)[0].state.x).toBe(0);
    expect(renderState(comp, 0.5)[0].state.x).toBe(50);
    expect(renderState(comp, 1)[0].state.x).toBe(100);
  });

  it("is a pure function (same t, same result)", () => {
    expect(renderState(comp, 0.5)).toEqual(renderState(comp, 0.5));
  });
});

describe("emitComposition (emit face)", () => {
  it("serializes modules to non-empty code referencing the target", () => {
    const code = emitComposition(comp);
    expect(code.length).toBeGreaterThan(0);
    expect(code).toContain("card");
    expect(code).toContain("animate");
  });
});
