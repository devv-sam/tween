import { describe, it, expect } from "vitest";
import type { Track, Transform } from "../core/types";
import { collectKeyframeTimes, nextKeyframe, previousKeyframe } from "./transport";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const track = (id: string, over: Partial<Track>): Track => ({
  layer: { id, source: { kind: "image", value: "x" }, base },
  modules: [],
  ...over,
});

describe("collectKeyframeTimes", () => {
  it("maps a standalone set's stops out to composition time", () => {
    const tr = track("a", {
      keyframes: {
        rotation: { range: [0.2, 0.8], stops: [{ t: 0, v: 0 }, { t: 0.5, v: 90 }, { t: 1, v: 180 }] },
      },
    });
    // 0.2 + t * 0.6
    expect(collectKeyframeTimes([tr], [], [])).toEqual([0.2, 0.5, 0.8]);
  });

  it("takes a module's edges, since it has no stops to land on", () => {
    const tr = track("a", {
      modules: [{ type: "pulse", range: [0.3, 0.9], params: { property: "scale" } }],
    });
    expect(collectKeyframeTimes([tr], [], [])).toEqual([0.3, 0.9]);
  });

  it("folds near-identical moments together and sorts them", () => {
    const tr: Track = {
      layer: { id: "a", source: { kind: "image", value: "x" }, base, separatePosition: true },
      modules: [],
      keyframes: {
        x: { range: [0, 1], stops: [{ t: 0.5, v: 0 }, { t: 1, v: 10 }] },
        y: { range: [0, 1], stops: [{ t: 0, v: 0 }, { t: 0.5, v: 10 }] },
      },
    };
    // Two separate axes whose stop times overlap: 0, 0.5, 1 once each, in order.
    expect(collectKeyframeTimes([tr], [], [])).toEqual([0, 0.5, 1]);
  });

  it("scopes to the selection when there is one", () => {
    const a = track("a", {
      keyframes: { opacity: { range: [0, 1], stops: [{ t: 0.25, v: 1 }] } },
    });
    const b = track("b", {
      keyframes: { opacity: { range: [0, 1], stops: [{ t: 0.75, v: 1 }] } },
    });
    expect(collectKeyframeTimes([a, b], [], [])).toEqual([0.25, 0.75]);
    expect(collectKeyframeTimes([a, b], [], ["b"])).toEqual([0.75]);
  });
});

describe("stepping between keyframes", () => {
  const times = [0, 0.25, 0.5, 0.75, 1];

  it("finds the next moment past the playhead", () => {
    expect(nextKeyframe(times, 0.3)).toBe(0.5);
    expect(nextKeyframe(times, 0)).toBe(0.25);
  });

  it("falls back to the end when nothing is ahead", () => {
    expect(nextKeyframe(times, 1)).toBe(1);
    expect(nextKeyframe([], 0.4)).toBe(1);
  });

  it("finds the previous moment before the playhead", () => {
    expect(previousKeyframe(times, 0.3)).toBe(0.25);
    expect(previousKeyframe(times, 1)).toBe(0.75);
  });

  it("falls back to the start when nothing is behind", () => {
    expect(previousKeyframe(times, 0)).toBe(0);
    expect(previousKeyframe([], 0.4)).toBe(0);
  });

  it("does not read the moment it is sitting on as a step", () => {
    expect(nextKeyframe(times, 0.5)).toBe(0.75);
    expect(previousKeyframe(times, 0.5)).toBe(0.25);
  });
});
