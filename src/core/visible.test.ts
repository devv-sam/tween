import { describe, it, expect } from "vitest";
import { SOLO_DIM, dimUnsoloed, visibleElements } from "./visible";
import type { Composition, Layer, Scene, Transform } from "./types";

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
const scene = (...ids: string[]): Scene =>
  ids.map((id) => ({ id, source: { kind: "shape", value: "rect" }, state: { ...base, opacity: 0.5 } }));

describe("visibleElements", () => {
  it("passes everything through untouched when nothing is hidden", () => {
    const c = comp(layer("a"), layer("b", { locked: true }));
    expect(visibleElements(c)).toBe(c);
  });

  it("drops hidden elements", () => {
    const ids = visibleElements(comp(layer("a", { visible: false }), layer("b"))).tracks.map(
      (tr) => tr.layer.id,
    );
    expect(ids).toEqual(["b"]);
  });
});

describe("dimUnsoloed", () => {
  it("leaves the scene alone when nothing in it is soloed", () => {
    const s = scene("a", "b");
    expect(dimUnsoloed(s, [])).toBe(s);
    expect(dimUnsoloed(s, ["gone"])).toBe(s);
  });

  it("fades everything but the soloed set, on top of its own opacity", () => {
    const out = dimUnsoloed(scene("a", "b", "c"), ["a", "c"]);
    expect(out.map((it) => it.state.opacity)).toEqual([0.5, 0.5 * SOLO_DIM, 0.5]);
  });
});
