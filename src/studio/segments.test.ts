import { describe, it, expect } from "vitest";
import { PRESETS } from "../core/easing";
import type { Layer, Track, Transform } from "../core/types";
import {
  MIN_SEGMENT,
  easeSamples,
  findSegment,
  parseSegment,
  retimedStops,
  segmentId,
  sharedBlend,
  sharedEase,
  sharedLabel,
  trackSegments,
} from "./segments";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const layer = (id: string, separate = false): Layer => ({
  id,
  source: { kind: "shape", value: "rect" },
  base,
  separatePosition: separate,
});

const track = (keyframes: Track["keyframes"], separate = false): Track => ({
  layer: layer("el", separate),
  keyframes,
  modules: [],
});

describe("a segment's identity", () => {
  it("survives a round trip", () => {
    const ref = { layerId: "el", property: "rotation" as const, index: 2 };
    expect(parseSegment(segmentId(ref))).toEqual(ref);
  });

  it("refuses an id that names no segment", () => {
    // Index 0 is the first stop, which has nothing arriving at it.
    expect(parseSegment("el|x|0")).toBeNull();
    expect(parseSegment("el|x")).toBeNull();
    expect(parseSegment("el|x|two")).toBeNull();
  });
});

describe("the segments an element carries", () => {
  it("is one fewer than its stops — the first has nothing coming into it", () => {
    const tr = track({
      rotation: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 0.5, v: 90 }, { t: 1, v: 180 }] },
    });
    const segs = trackSegments(tr, 2);
    expect(segs.map((s) => s.ref.index)).toEqual([1, 2]);
    expect(segs.map((s) => [s.from, s.to])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("reads a combined position as one property holding both axes", () => {
    const tr = track({
      x: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 1, v: 300 }] },
      y: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 1, v: 120 }] },
    });
    const segs = trackSegments(tr, 1);
    expect(segs).toHaveLength(1);
    expect(segs[0].property).toBe("position");
    expect(segs[0].value).toEqual({ x: 300, y: 120 });
  });

  it("reads separated axes as two properties of their own", () => {
    const tr = track(
      {
        x: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 1, v: 300 }] },
        y: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 1, v: 120 }] },
      },
      true,
    );
    expect(trackSegments(tr, 1).map((s) => s.property)).toEqual(["x", "y"]);
  });

  it("measures against the ruler, not the block the stops live in", () => {
    const tr = track({
      opacity: { range: [0.25, 0.75], stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }] },
    });
    const [seg] = trackSegments(tr, 4);
    expect(seg.from).toBeCloseTo(1, 6);
    expect(seg.to).toBeCloseTo(3, 6);
  });

  it("is found by the ref that names it, and not by one that names nothing", () => {
    const tr = track({
      rotation: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 1, v: 90 }] },
    });
    expect(findSegment([tr], { layerId: "el", property: "rotation", index: 1 }, 1)?.value).toBe(90);
    expect(findSegment([tr], { layerId: "el", property: "rotation", index: 2 }, 1)).toBeNull();
    expect(findSegment([tr], { layerId: "gone", property: "rotation", index: 1 }, 1)).toBeNull();
  });
});

describe("retiming a segment", () => {
  const stops = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 2 }];

  it("moves the destination and leaves the source where it is", () => {
    const next = retimedStops(stops, 1, 0.25, [0, 1], 2);
    expect(next[0].t).toBe(0);
    expect(next[1].t).toBeCloseTo(0.125, 6);
    expect(next[2].t).toBe(1);
  });

  it("will not push the destination past the stop after it", () => {
    expect(retimedStops(stops, 1, 10, [0, 1], 2)[1].t).toBe(1);
  });

  it("will not collapse below a frame", () => {
    const next = retimedStops(stops, 1, 0, [0, 1], 2);
    expect(next[1].t).toBeCloseTo(MIN_SEGMENT / 2, 6);
  });

  it("measures seconds against the block it sits in, not the composition", () => {
    // A block covering half the composition: a second of segment is twice the share.
    const next = retimedStops(stops, 1, 1, [0, 0.5], 4);
    expect(next[1].t).toBeCloseTo(0.5, 6);
  });
});

describe("what several segments agree on", () => {
  const seg = (property: "x" | "rotation", ease: unknown, blend: "set" | "add") =>
    ({ property, ease, blend }) as never;

  it("shows a shared curve and nothing when they differ", () => {
    expect(sharedEase([seg("x", PRESETS["ease in"], "set"), seg("x", PRESETS["ease in"], "set")]))
      .toEqual(PRESETS["ease in"]);
    expect(sharedEase([seg("x", PRESETS["ease in"], "set"), seg("x", PRESETS["ease out"], "set")]))
      .toBeUndefined();
  });

  it("treats an unwritten easing and an explicit linear as one curve, so they agree", () => {
    expect(
      sharedEase([seg("x", { kind: "linear" }, "set"), seg("x", undefined, "set")]),
    ).toEqual({ kind: "linear" });
  });

  it("names the property they share, or says they do not share one", () => {
    expect(sharedLabel([seg("x", undefined, "set"), seg("x", undefined, "set")])).toBe("x");
    expect(sharedLabel([seg("x", undefined, "set"), seg("rotation", undefined, "set")])).toBe("mixed");
  });

  it("shows a shared blend and nothing when they differ", () => {
    expect(sharedBlend([seg("x", undefined, "add"), seg("x", undefined, "add")])).toBe("add");
    expect(sharedBlend([seg("x", undefined, "add"), seg("x", undefined, "set")])).toBeNull();
  });
});

describe("the shape drawn on a segment line", () => {
  it("runs corner to corner of the segment's own box", () => {
    const points = easeSamples(PRESETS["in-out"], 20);
    expect(points).toHaveLength(21);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[20]).toEqual({ x: 1, y: 1 });
  });

  it("leaves the box where the curve overshoots it", () => {
    const points = easeSamples(PRESETS["ease out back"], 20);
    expect(Math.max(...points.map((p) => p.y))).toBeGreaterThan(1);
  });
});
