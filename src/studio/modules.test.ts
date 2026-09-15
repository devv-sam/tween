import { describe, expect, it } from "vitest";
import { sampleStops } from "../core/curve";
import { remap } from "../core/math";
import type { Track } from "../core/types";
import {
  BLOCK_HEIGHT,
  BLOCK_GAP,
  MIN_RANGE,
  blockTop,
  rowHeight,
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
  positionSets,
  slideRange,
  trimRange,
  type Range,
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
    // nothing caps where the author's own keyframes can go.
    expect(set.stops).toEqual([{ t: 0, v: 2, ease: "linear" }]);
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
    keyframes: { scale: kfSet(1), opacity: kfSet(0.5) },
    modules: [
      {
        type: "keyframes",
        range: [0.25, 0.75],
        params: { property: "x", stops: [{ t: 0, v: 0 }, { t: 1, v: 100 }] },
      },
    ],
  };

  it("lists standalone sets before modules, matching evaluation order", () => {
    expect(trackBlocks(built).map((b) => [b.label, b.standalone])).toEqual([
      ["scale", true],
      ["opacity", true],
      ["x", false],
    ]);
  });

  it("addresses each block by what selecting it means", () => {
    expect(trackBlocks(built).map((b) => b.part)).toEqual([
      { kind: "keyframes", property: "scale" },
      { kind: "keyframes", property: "opacity" },
      { kind: "module", index: 0 },
    ]);
  });

  it("carries each block's own window and stops", () => {
    const blocks = trackBlocks(built);
    expect(blocks[0].range).toEqual([0, 1]);
    expect(blocks[2].range).toEqual([0.25, 0.75]);
    expect(blocks[2].stops).toHaveLength(2);
  });

  it("has nothing to draw for a bare element", () => {
    expect(trackBlocks({ layer: built.layer, modules: [] })).toEqual([]);
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

describe("lane geometry", () => {
  it("keeps a short stack at the row's minimum height", () => {
    expect(rowHeight(0, 32)).toBe(32);
    expect(rowHeight(1, 32)).toBe(32);
  });

  it("grows the row so every module gets its own band", () => {
    expect(rowHeight(2, 32)).toBe(BLOCK_HEIGHT * 2 + BLOCK_GAP + 8);
    expect(rowHeight(3, 32)).toBe(BLOCK_HEIGHT * 3 + BLOCK_GAP * 2 + 8);
  });

  it("centres a lone block and stacks the rest without overlapping", () => {
    expect(blockTop(0, 1, 32)).toBe(7);
    for (const count of [2, 3, 4]) {
      const tops = Array.from({ length: count }, (_, i) => blockTop(i, count, 32));
      tops.forEach((top, i) => {
        if (i > 0) expect(top - tops[i - 1]).toBeGreaterThanOrEqual(BLOCK_HEIGHT);
      });
      expect(tops[0]).toBeGreaterThanOrEqual(0);
      expect(tops[count - 1] + BLOCK_HEIGHT).toBeLessThanOrEqual(rowHeight(count, 32));
    }
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
    expect(trackBlocks(both).map((b) => b.label)).toEqual(["position"]);
  });

  it("is two once the axes are separated, or when only one carries motion", () => {
    const apart = track({ x: set([{ t: 0, v: 0 }]), y: set([{ t: 0, v: 0 }]) }, true);
    expect(positionSets(apart)).toBeNull();
    expect(trackBlocks(apart).map((b) => b.label)).toEqual(["x", "y"]);
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
