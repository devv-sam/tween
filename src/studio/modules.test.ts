import { describe, expect, it } from "vitest";
import { sampleStops } from "../core/curve";
import { remap } from "../core/math";
import type { Track } from "../core/types";
import {
  MIN_RANGE,
  secondsToT,
  stopAtTime,
  stopSeconds,
  baseValue,
  layerName,
  newKeyframes,
  positionDrivers,
  shiftStops,
  trackBlocks,
  mergePosition,
  newPosition,
  patchStop,
  removeStop,
  SAME_STOP,
  slideStops,
  stretchStops,
  positionSets,
  slideRange,
  trimRange,
  fromDisplay,
  propLabel,
  toDisplay,
  type Range,
  blockSpan,
  slideTrackEdits,
  stretchTrackEdits,
  trackSpan,
  type BlockView,
  type KeyTarget,
  type TimeEdit,
  hasSpan,
} from "./modules";

const base = { x: 40, y: 20, scaleX: 2, scaleY: 3, rotation: 90, opacity: 0.5 };

describe("baseValue", () => {
  it("reads the virtual scale off the x axis", () => {
    expect(baseValue(base, "scale")).toBe(2);
    expect(baseValue(base, "opacity")).toBe(0.5);
  });
});

describe("newKeyframes", () => {
  it("spans the composition and starts on the element's current value", () => {
    const set = newKeyframes("scale", base);
    expect(set.range).toEqual([0, 1]);
    // One stop, not a pair: nothing is invented at the end to animate towards, and
    // nothing caps where the author's own keyframes can go. No easing either — an
    // easing describes an incoming segment, and the first stop has nothing incoming.
    expect(set.stops).toEqual([{ t: 0, v: 2 }]);
  });
});

describe("positionDrivers", () => {
  const kf = (property: string, blend?: string) => ({
    type: "keyframes",
    range: [0, 1] as [number, number],
    params: { property, stops: [{ t: 0, v: 10 }, { t: 1, v: 90 }], ...(blend ? { blend } : {}) },
  });
  const track = (over: Partial<Track>): Track => ({
    layer: { id: "a", source: { kind: "image", value: "x" }, base },
    modules: [],
    ...over,
  });
  const set = (v: number) => ({ stops: [{ t: 0, v }, { t: 1, v: v + 5 }], range: [0, 1] as [number, number] });

  it("names the axes a set-blend keyframe module owns outright", () => {
    const drivers = positionDrivers(track({ modules: [kf("x"), kf("y")] }));
    expect(drivers.map((d) => d.axis)).toEqual(["x", "y"]);
    expect(drivers.map((d) => d.part)).toEqual([
      { kind: "module", index: 0 },
      { kind: "module", index: 1 },
    ]);
  });

  it("names standalone keyframes too, which always set their axis", () => {
    const drivers = positionDrivers(track({ keyframes: { x: set(10), y: set(20) } }));
    expect(drivers.map((d) => d.part)).toEqual([
      { kind: "keyframes", property: "x" },
      { kind: "keyframes", property: "y" },
    ]);
  });

  it("ignores properties that are not a position", () => {
    expect(positionDrivers(track({ modules: [kf("scale"), kf("opacity")] }))).toEqual([]);
    expect(positionDrivers(track({ keyframes: { scale: set(2) } }))).toEqual([]);
  });

  it("ignores a blend that only offsets the base, since base still moves it", () => {
    expect(positionDrivers(track({ modules: [kf("x", "add"), kf("y", "mul")] }))).toEqual([]);
  });

  it("carries the stops the move will be measured from", () => {
    expect(positionDrivers(track({ modules: [kf("x")] }))[0].stops).toEqual([
      { t: 0, v: 10 },
      { t: 1, v: 90 },
    ]);
  });
});

describe("trackBlocks", () => {
  const kfSet = (v: number) => ({
    stops: [{ t: 0, v }, { t: 1, v }],
    range: [0, 1] as [number, number],
  });
  const built: Track = {
    layer: { id: "a", source: { kind: "image", value: "x" }, base },
    keyframes: { scaleX: kfSet(1), opacity: kfSet(0.5) },
    modules: [
      {
        type: "keyframes",
        range: [0.25, 0.75],
        params: { property: "x", stops: [{ t: 0, v: 0 }, { t: 1, v: 100 }] },
      },
    ],
  };

  it("lists standalone sets before modules, matching evaluation order", () => {
    expect(trackBlocks(built, []).map((b) => [b.label, b.standalone])).toEqual([
      ["width", true],
      ["opacity", true],
      ["x", false],
    ]);
  });

  it("addresses each block by what selecting it means", () => {
    expect(trackBlocks(built, []).map((b) => b.part)).toEqual([
      { kind: "keyframes", property: "scaleX" },
      { kind: "keyframes", property: "opacity" },
      { kind: "module", index: 0 },
    ]);
  });

  it("carries each block's own window and stops", () => {
    const blocks = trackBlocks(built, []);
    expect(blocks[0].range).toEqual([0, 1]);
    expect(blocks[2].range).toEqual([0.25, 0.75]);
    expect(blocks[2].stops).toHaveLength(2);
  });

  it("has nothing to draw for a bare element", () => {
    expect(trackBlocks({ layer: built.layer, modules: [] }, [])).toEqual([]);
  });
});

describe("shiftStops", () => {
  it("travels the curve without changing its shape", () => {
    const stops = [
      { t: 0, v: 10, ease: "linear" as const },
      { t: 1, v: 90, ease: "inout" as const },
    ];
    const moved = shiftStops(stops, -25);
    expect(moved.map((s) => s.v)).toEqual([-15, 65]);
    expect(moved.map((s) => s.t)).toEqual([0, 1]);
    expect(moved.map((s) => s.ease)).toEqual(["linear", "inout"]);
    // The gap between stops is what the shape is: the move must leave it alone.
    expect(moved[1].v - moved[0].v).toBe(stops[1].v - stops[0].v);
  });
});

describe("slideStops", () => {
  const stops = [
    { t: 0.2, v: 1, ease: "linear" as const },
    { t: 0.6, v: 2, ease: "linear" as const },
  ];

  it("moves the whole set and keeps its shape", () => {
    expect(slideStops(stops, 0.1).map((s) => s.t)).toEqual([
      expect.closeTo(0.3),
      expect.closeTo(0.7),
    ]);
  });

  it("stops at the composition's edges rather than piling up on them", () => {
    expect(slideStops(stops, -1).map((s) => s.t)).toEqual([0, expect.closeTo(0.4)]);
    expect(slideStops(stops, 1).map((s) => s.t)).toEqual([expect.closeTo(0.6), 1]);
  });

  it("has nothing to move in an empty set", () => {
    expect(slideStops([], 0.5)).toEqual([]);
  });
});

describe("stretchStops", () => {
  const stops = [
    { t: 0, v: 1, ease: "linear" as const },
    { t: 0.25, v: 3, ease: "linear" as const },
    { t: 0.5, v: 2, ease: "linear" as const },
  ];

  it("scales every keyframe, so the curve keeps its shape", () => {
    const out = stretchStops(stops, 0, 0.5, 1);
    expect(out.map((s) => s.t)).toEqual([0, expect.closeTo(0.5), 1]);
    // Values are the shape; only the times were asked about.
    expect(out.map((s) => s.v)).toEqual([1, 3, 2]);
  });

  it("holds the far end still, whichever end is dragged", () => {
    const out = stretchStops(stops, 0.5, 0, 0.25);
    expect(out.map((s) => s.t)).toEqual([
      expect.closeTo(0.25),
      expect.closeTo(0.375),
      0.5,
    ]);
  });

  it("will not turn the set inside out", () => {
    // Dragged past the anchor, the set collapses to a hair rather than inverting.
    const out = stretchStops(stops, 0, 0.5, -1);
    expect(out.every((s) => s.t >= 0)).toBe(true);
    expect(out[out.length - 1].t).toBeCloseTo(SAME_STOP);
  });

  it("leaves a set with nothing to stretch alone", () => {
    const one = [{ t: 0.4, v: 1, ease: "linear" as const }];
    expect(stretchStops(one, 0.4, 0.4, 0.9)).toEqual(one);
  });
});

describe("slideRange", () => {
  it("keeps its width", () => {
    const [s, e] = slideRange([0.2, 0.5], 0.1);
    expect(s).toBeCloseTo(0.3);
    expect(e).toBeCloseTo(0.6);
  });

  it("stops at the ends rather than shrinking", () => {
    expect(slideRange([0.2, 0.5], -1)).toEqual([0, 0.3]);
    expect(slideRange([0.2, 0.5], 1)).toEqual([0.7, 1]);
  });
});

describe("trimRange", () => {
  it("moves one edge and leaves the other", () => {
    expect(trimRange([0.2, 0.8], "start", 0.4)).toEqual([0.4, 0.8]);
    expect(trimRange([0.2, 0.8], "end", 0.5)).toEqual([0.2, 0.5]);
  });

  it("never lets the edges cross", () => {
    const [s, e] = trimRange([0.2, 0.8], "start", 0.95);
    expect(e - s).toBeCloseTo(MIN_RANGE);
    const [s2, e2] = trimRange([0.2, 0.8], "end", 0);
    expect(e2 - s2).toBeCloseTo(MIN_RANGE);
  });

  it("clamps to the composition", () => {
    expect(trimRange([0.2, 0.8], "start", -3)).toEqual([0, 0.8]);
    expect(trimRange([0.2, 0.8], "end", 4)).toEqual([0.2, 1]);
  });
});

describe("stops", () => {
  const stops = [
    { t: 0.2, v: 0.5, ease: "linear" as const },
    { t: 0.8, v: 1, ease: "linear" as const },
  ];

  it("re-sorts when a stop is dragged past its neighbour", () => {
    expect(patchStop(stops, 0, { t: 0.9 }).map((s) => s.t)).toEqual([0.8, 0.9]);
    expect(patchStop(stops, 1, { t: 0.1 }).map((s) => s.v)).toEqual([1, 0.5]);
  });

  it("keeps the last stop a curve needs", () => {
    expect(removeStop(stops, 0)).toHaveLength(1);
    expect(removeStop(stopAtTime(stops, 0.5, 7), 1)).toHaveLength(2);
    expect(removeStop([stops[0]], 0)).toHaveLength(1);
  });
});

describe("stop times in seconds", () => {
  const full: [number, number] = [0, 1];
  const trimmed: [number, number] = [0.5, 1];

  it("reads a full-range block straight off the ruler", () => {
    expect(stopSeconds(0, full, 3)).toBe(0);
    expect(stopSeconds(0.5, full, 3)).toBe(1.5);
    expect(stopSeconds(1, full, 3)).toBe(3);
  });

  it("reads a trimmed block at the ruler time it actually sits on", () => {
    expect(stopSeconds(0, trimmed, 3)).toBe(1.5);
    expect(stopSeconds(1, trimmed, 3)).toBe(3);
  });

  it("round-trips through the block's window", () => {
    for (const range of [full, trimmed]) {
      for (const t of [0, 0.25, 0.5, 1]) {
        expect(secondsToT(stopSeconds(t, range, 3), range, 3)).toBeCloseTo(t);
      }
    }
  });

  it("pins a time outside the block to its nearest edge", () => {
    expect(secondsToT(-5, full, 3)).toBe(0);
    expect(secondsToT(99, full, 3)).toBe(1);
    expect(secondsToT(0, trimmed, 3)).toBe(0);
    expect(secondsToT(99, trimmed, 3)).toBe(1);
  });

  it("has no answer to divide by for an empty block or composition", () => {
    expect(secondsToT(1, [0.4, 0.4], 3)).toBe(0);
    expect(secondsToT(1, full, 0)).toBe(0);
  });
});

describe("stopAtTime", () => {
  const stops = [
    { t: 0, v: 10, ease: "linear" as const },
    { t: 1, v: 90, ease: "inout" as const },
  ];

  it("inserts in time order", () => {
    expect(stopAtTime(stops, 0.4, 55).map((s) => [s.t, s.v])).toEqual([
      [0, 10],
      [0.4, 55],
      [1, 90],
    ]);
  });

  it("carries the easing of the stop it follows", () => {
    expect(stopAtTime(stops, 0.4, 55)[1].ease).toBe("linear");
  });

  it("revalues rather than doubling up on an existing keyframe", () => {
    const next = stopAtTime(stops, 0, 42);
    expect(next).toHaveLength(2);
    expect(next[0].v).toBe(42);
  });
});

describe("range remapping", () => {
  it("puts stop t=0 at the module's start, not the composition's", () => {
    const range: Range = [0.5, 1];
    const stops = [
      { t: 0, v: 0.5, ease: "linear" as const },
      { t: 1, v: 1, ease: "linear" as const },
    ];
    expect(sampleStops(stops, remap(0.5, range))).toBe(0.5);
    expect(sampleStops(stops, remap(0.75, range))).toBe(0.75);
    expect(sampleStops(stops, remap(1, range))).toBe(1);
  });
});

describe("layerName", () => {
  const layer = { id: "a", source: { kind: "image" as const, value: "x" }, base };

  it("prefers the given name, then the asset, then a number", () => {
    expect(layerName({ ...layer, name: "hero" }, "star.png", 0)).toBe("hero");
    expect(layerName({ ...layer, name: "  " }, "star.png", 0)).toBe("star.png");
    expect(layerName(layer, undefined, 2)).toBe("Element 3");
  });
});

describe("position", () => {
  const track = (
    keyframes: Track["keyframes"],
    separatePosition?: boolean,
  ): Track => ({
    layer: { id: "a", source: { kind: "image", value: "i" }, base, separatePosition },
    keyframes,
    modules: [],
  });
  const set = (stops: { t: number; v: number }[], range: Range = [0, 1]) => ({
    stops,
    range,
  });

  it("is one property while both axes are held together", () => {
    const both = track({ x: set([{ t: 0, v: 0 }]), y: set([{ t: 0, v: 0 }]) });
    expect(positionSets(both)).not.toBeNull();
    expect(trackBlocks(both, []).map((b) => b.label)).toEqual(["position"]);
  });

  it("is two once the axes are separated, or when only one carries motion", () => {
    const apart = track({ x: set([{ t: 0, v: 0 }]), y: set([{ t: 0, v: 0 }]) }, true);
    expect(positionSets(apart)).toBeNull();
    expect(trackBlocks(apart, []).map((b) => b.label)).toEqual(["x", "y"]);
    expect(positionSets(track({ x: set([{ t: 0, v: 0 }]) }))).toBeNull();
  });

  it("leaves axes that already agree exactly as they are", () => {
    const x = set([{ t: 0, v: 0 }, { t: 1, v: 10 }]);
    const y = set([{ t: 0, v: 5 }, { t: 1, v: 50 }]);
    expect(mergePosition(x, y)).toEqual({ x, y });
  });

  it("keeps every stop time from either axis, sampling the one that lacks it", () => {
    const x = set([{ t: 0, v: 0 }, { t: 1, v: 100 }]);
    const y = set([{ t: 0, v: 0 }, { t: 0.5, v: 50 }, { t: 1, v: 0 }]);
    const merged = mergePosition(x, y);
    expect(merged.x.stops.map((s) => [s.t, s.v])).toEqual([
      [0, 0],
      [0.5, 50],
      [1, 100],
    ]);
    expect(merged.y.stops.map((s) => [s.t, s.v])).toEqual([
      [0, 0],
      [0.5, 50],
      [1, 0],
    ]);
  });

  it("spans both windows, holding an axis at its end past its own edge", () => {
    const x = set([{ t: 0, v: 0 }, { t: 1, v: 10 }], [0, 0.5]);
    const y = set([{ t: 0, v: 100 }, { t: 1, v: 200 }], [0.5, 1]);
    const merged = mergePosition(x, y);
    expect(merged.x.range).toEqual([0, 1]);
    expect(merged.y.range).toEqual([0, 1]);
    expect(merged.x.stops.map((s) => [s.t, s.v])).toEqual([
      [0, 0],
      [0.5, 10],
      [1, 10],
    ]);
    expect(merged.y.stops.map((s) => [s.t, s.v])).toEqual([
      [0, 100],
      [0.5, 100],
      [1, 200],
    ]);
  });

  it("gives a missing axis the other's timing, held at the element's value", () => {
    const x = set([{ t: 0, v: 0 }, { t: 0.5, v: 40 }, { t: 1, v: 0 }]);
    expect(newPosition(track({ x }))).toEqual({
      x,
      y: { range: [0, 1], stops: x.stops.map((s) => ({ ...s, v: base.y })) },
    });
  });

  it("starts both axes flat on the element when there is nothing to merge", () => {
    const fresh = newPosition(track(undefined));
    expect(fresh.x.stops.map((s) => s.v)).toEqual([base.x]);
    expect(fresh.y.stops.map((s) => s.v)).toEqual([base.y]);
  });
});

describe("width and height as the panel reads them", () => {
  const size = { width: 240, height: 160 };

  it("names the axes after what they are, not after how they are stored", () => {
    expect(propLabel("scaleX")).toBe("width");
    expect(propLabel("scaleY")).toBe("height");
    expect(propLabel("rotation")).toBe("rotation");
  });

  it("reads a stored factor as the pixels it covers", () => {
    expect(toDisplay("scaleX", 2, size)).toBe(480);
    expect(toDisplay("scaleY", 0.5, size)).toBe(80);
  });

  it("takes a typed width back to the factor the engine multiplies by", () => {
    expect(fromDisplay("scaleX", 480, size)).toBe(2);
    expect(fromDisplay("scaleY", 80, size)).toBe(0.5);
  });

  it("leaves every other property in its own units", () => {
    expect(toDisplay("rotation", 90, size)).toBe(90);
    expect(fromDisplay("opacity", 0.5, size)).toBe(0.5);
    // A uniform module scale is a factor everywhere, with no element to measure it
    // against — only an element's own axes become pixels.
    expect(toDisplay("scale", 2, size)).toBe(2);
  });

  it("leaves the factor alone when there is nothing to measure against", () => {
    expect(toDisplay("scaleX", 2, undefined)).toBe(2);
    expect(fromDisplay("scaleX", 2, undefined)).toBe(2);
    // No width reaches any pixels once the element has been flattened, so the
    // division that has no answer is not attempted.
    expect(fromDisplay("scaleX", 480, { width: 0, height: 0 })).toBe(480);
  });

  it("stacks the two axes as separate blocks, width before height", () => {
    const flat = (v: number) => ({ stops: [{ t: 0, v }], range: [0, 1] as Range });
    const track: Track = {
      layer: { id: "a", source: { kind: "image", value: "x" }, base },
      keyframes: { scaleY: flat(1), scaleX: flat(1) },
      modules: [],
    };
    expect(trackBlocks(track, []).map((b) => b.label)).toEqual(["width", "height"]);
  });
});

describe("retiming an element as one set", () => {
  const keys = (property: KeyTarget, ts: number[]): BlockView => ({
    part: { kind: "keyframes", property },
    prop: property,
    label: String(property),
    range: [0, 1],
    stops: ts.map((t) => ({ t, v: t })),
    standalone: true,
    linked: false,
  });

  const mod = (index: number, range: Range): BlockView => ({
    part: { kind: "module", index },
    prop: "scale",
    label: "scale",
    range,
    stops: [],
    standalone: false,
    linked: false,
  });

  const timesOf = (edit: TimeEdit) =>
    edit.kind === "keyframes" ? edit.stops.map((s) => s.t) : [...edit.range];

  /** Times are accumulated floats; compare them as times, not as bit patterns. */
  const expectTimes = (got: number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 9));
  };

  // The element's bar is the handle for the skeletons under it, so it only exists
  // once one of them does. A single keyframe is a value held, not a stretch of time.
  it("has no span to move until some curve has two keyframes", () => {
    expect(hasSpan([])).toBe(false);
    expect(hasSpan([keys("position", [0])])).toBe(false);
    // Two properties, one keyframe each, at different times: still nothing animates.
    expect(hasSpan([keys("position", [0]), keys("opacity", [0.6])])).toBe(false);
    expect(hasSpan([keys("position", [0, 0.5])])).toBe(true);
    // A module is a window by nature, so it always has one.
    expect(hasSpan([mod(0, [0.2, 0.5])])).toBe(true);
  });

  it("reaches from the earliest keyframe to the latest, across every property", () => {
    expect(trackSpan([keys("opacity", [0.2, 0.5]), keys("rotation", [0.4, 0.8])]))
      .toEqual([0.2, 0.8]);
  });

  it("measures a module by its window and a curve by its keyframes", () => {
    expect(blockSpan(keys("opacity", [0.25, 0.75]))).toEqual([0.25, 0.75]);
    expect(blockSpan(mod(0, [0.1, 0.4]))).toEqual([0.1, 0.4]);
  });

  it("moves every property by the same amount, keeping the spread between them", () => {
    const blocks = [keys("opacity", [0.1, 0.3]), keys("rotation", [0.2, 0.6])];
    const [a, b] = slideTrackEdits(blocks, 0.1);
    expectTimes(timesOf(a), [0.2, 0.4]);
    expectTimes(timesOf(b), [0.3, 0.7]);
  });

  /** The whole point of doing this per element rather than per curve: one property
   *  hitting the edge must not let the others keep going. */
  it("stops the whole set at the edge rather than letting one curve pile up", () => {
    const blocks = [keys("opacity", [0.05, 0.25]), keys("rotation", [0.5, 0.7])];
    const moved = slideTrackEdits(blocks, -0.4).map(timesOf);
    // Only 0.05 of room before the earliest keyframe, so nothing moves further.
    expectTimes(moved[0], [0, 0.2]);
    expectTimes(moved[1], [0.45, 0.65]);
  });

  it("carries a module's window along with the curves", () => {
    const edits = slideTrackEdits([keys("opacity", [0.2, 0.4]), mod(0, [0.2, 0.5])], 0.1);
    expectTimes(timesOf(edits[1]), [0.3, 0.6]);
  });

  it("does nothing when there is nowhere left to go", () => {
    expect(slideTrackEdits([keys("opacity", [0, 0.4])], -0.2)).toEqual([]);
    expect(slideTrackEdits([], 0.1)).toEqual([]);
  });

  it("stretches every property about the same anchor", () => {
    const blocks = [keys("opacity", [0, 0.2]), keys("rotation", [0.1, 0.4])];
    // The set spans 0 to 0.4; dragging that end out to 0.8 doubles everything.
    const [a, b] = stretchTrackEdits(blocks, 0, 0.4, 0.8).map(timesOf);
    expectTimes(a, [0, 0.4]);
    expectTimes(b, [0.2, 0.8]);
  });

  it("refuses a stretch with no span to work from", () => {
    expect(stretchTrackEdits([keys("opacity", [0.3, 0.3])], 0.3, 0.3, 0.6)).toEqual([]);
  });
});
