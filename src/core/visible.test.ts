import { describe, it, expect } from "vitest";
import { visibleElements } from "./visible";
import type { Composition, Layer, Transform } from "./types";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({
  id,
  source: { kind: "shape", value: "rect" },
  base,
  ...extra,
});
const comp = (...layers: Layer[]): Composition => ({
  fps: 30,
  duration: 1,
  driver: { kind: "time" },
  tracks: layers.map((l) => ({ layer: l, modules: [] })),
});
const ids = (c: Composition) => c.tracks.map((tr) => tr.layer.id);

describe("visibleElements", () => {
  it("passes everything through untouched when nothing is hidden or soloed", () => {
    const c = comp(layer("a"), layer("b", { locked: true }));
    expect(visibleElements(c)).toBe(c);
  });

  it("drops hidden elements", () => {
    expect(ids(visibleElements(comp(layer("a", { visible: false }), layer("b"))))).toEqual(["b"]);
  });

  it("keeps only the soloed set, in order, while anything is soloed", () => {
    const c = comp(layer("a"), layer("b"), layer("c"));
    expect(ids(visibleElements(c, ["c", "a"]))).toEqual(["a", "c"]);
  });

  it("a hidden element stays hidden even when soloed", () => {
    expect(ids(visibleElements(comp(layer("a", { visible: false }), layer("b")), ["a"]))).toEqual([]);
  });

  it("ignores solo ids for elements that are gone", () => {
    expect(ids(visibleElements(comp(layer("a"), layer("b")), ["gone"]))).toEqual(["a", "b"]);
  });
});
