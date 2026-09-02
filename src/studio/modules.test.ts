import { describe, expect, it } from "vitest";
import { sampleStops } from "../core/curve";
import { remap } from "../core/math";
import {
  BLOCK_HEIGHT,
  BLOCK_GAP,
  MIN_RANGE,
  blockTop,
  rowHeight,
  addStop,
  baseValue,
  layerName,
  newKeyframeModule,
  patchStop,
  removeStop,
  slideRange,
  trimRange,
  withRangeEdge,
  type Range,
} from "./modules";

const base = { x: 40, y: 20, scaleX: 2, scaleY: 3, rotation: 90, opacity: 0.5 };

describe("baseValue", () => {
  it("reads the virtual scale off the x axis", () => {
    expect(baseValue(base, "scale")).toBe(2);
    expect(baseValue(base, "opacity")).toBe(0.5);
  });
});

describe("newKeyframeModule", () => {
  it("spans the composition and starts flat on the element's current value", () => {
    const md = newKeyframeModule("scale", base);
    expect(md.range).toEqual([0, 1]);
    expect(md.params.stops).toEqual([
      { t: 0, v: 2, ease: "linear" },
      { t: 1, v: 2, ease: "linear" },
    ]);
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
    expect(withRangeEdge([0.2, 0.8], "start", -3)).toEqual([0, 0.8]);
    expect(withRangeEdge([0.2, 0.8], "end", 4)).toEqual([0.2, 1]);
  });
});

describe("stops", () => {
  const stops = [
    { t: 0.2, v: 0.5, ease: "linear" as const },
    { t: 0.8, v: 1, ease: "linear" as const },
  ];

  it("adds into the widest gap, on the line already drawn", () => {
    expect(addStop(stops)).toEqual([
      { t: 0.2, v: 0.5, ease: "linear" },
      { t: 0.5, v: 0.75, ease: "linear" },
      { t: 0.8, v: 1, ease: "linear" },
    ]);
  });

  it("re-sorts when a stop is dragged past its neighbour", () => {
    expect(patchStop(stops, 0, { t: 0.9 }).map((s) => s.t)).toEqual([0.8, 0.9]);
    expect(patchStop(stops, 1, { t: 0.1 }).map((s) => s.v)).toEqual([1, 0.5]);
  });

  it("keeps the two a curve needs", () => {
    expect(removeStop(stops, 0)).toHaveLength(2);
    expect(removeStop(addStop(stops), 1)).toHaveLength(2);
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
