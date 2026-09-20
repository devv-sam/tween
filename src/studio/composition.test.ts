import { describe, expect, it } from "vitest";
import type { Composition, ModuleData, Track } from "../core/types";
import {
  RESOLUTIONS,
  clampFps,
  contentEnd,
  normalizeHex,
  resolutionFor,
  resolutionKey,
  retimed,
} from "./composition";

/** The first entry of a track that only ever holds behaviour of its own. */
const rawModule = (track: Track): ModuleData => track.modules[0] as ModuleData;

describe("clampFps", () => {
  it("rounds and keeps a playable rate", () => {
    expect(clampFps(29.7)).toBe(30);
    expect(clampFps(0)).toBe(1);
    expect(clampFps(1e6)).toBe(240);
  });
});

describe("resolutions", () => {
  it("round-trips every preset through its key", () => {
    for (const r of RESOLUTIONS) {
      expect(resolutionFor(resolutionKey(r.size))).toEqual(r.size);
    }
  });

  it("has no answer for a size it does not offer", () => {
    expect(resolutionFor("640x480")).toBeUndefined();
  });
});

describe("normalizeHex", () => {
  it("accepts both lengths, with or without the hash", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("aabbcc")).toBe("#aabbcc");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("  #ABC  ")).toBe("#aabbcc");
  });

  it("treats a half-typed colour as a draft, not a value", () => {
    for (const bad of ["", "#", "#ab", "#abcd", "#gggggg", "red"]) {
      expect(normalizeHex(bad)).toBeUndefined();
    }
  });
});

const track = (
  keyframes: Track["keyframes"],
  modules: Track["modules"] = [],
): Track => ({
  layer: {
    id: "l1",
    source: { kind: "image", value: "a" },
    base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  },
  keyframes,
  modules,
});

const comp = (tracks: Track[], duration = 2.5): Composition => ({
  fps: 30,
  duration,
  driver: { kind: "time" },
  tracks,
});

describe("contentEnd", () => {
  it("has nothing to report when nothing is animated", () => {
    expect(contentEnd(comp([]), [])).toBeNull();
    expect(contentEnd(comp([track(undefined)]), [])).toBeNull();
  });

  it("reads a set's last stop inside its own block, not the block's end", () => {
    const stops = [
      { t: 0, v: 0, ease: "linear" as const },
      { t: 0.5, v: 300, ease: "linear" as const },
    ];
    expect(contentEnd(comp([track({ x: { stops, range: [0, 0.4] } })]), [])).toBeCloseTo(0.2);
  });

  it("takes the latest of everything on every track", () => {
    const early = track({ x: { stops: [{ t: 1, v: 1, ease: "linear" }], range: [0, 0.3] } });
    const late = track({ y: { stops: [{ t: 1, v: 1, ease: "linear" }], range: [0, 0.75] } });
    expect(contentEnd(comp([early, late]), [])).toBeCloseTo(0.75);
  });

  it("gives a module the whole block it is active over", () => {
    const md = track(undefined, [{ type: "move", range: [0.2, 0.6], params: {} }]);
    expect(contentEnd(comp([md]), [])).toBeCloseTo(0.6);
  });
});

describe("retimed", () => {
  const stops = [
    { t: 0, v: 0, ease: "linear" as const },
    { t: 1, v: 300, ease: "linear" as const },
  ];

  it("keeps the seconds a block was authored at", () => {
    // 0 to 0.3s of a 2.5s composition, over a composition that is now 0.3s long.
    const before = comp([track({ x: { stops, range: [0, 0.12] } })], 2.5);
    const after = retimed(before, 0.3);
    expect(after.duration).toBe(0.3);
    expect(after.tracks[0].keyframes!.x.range[1]).toBeCloseTo(1);
    // The block grew to cover the same seconds, so the stops sit where they did.
    expect(after.tracks[0].keyframes!.x.stops).toEqual(stops);
  });

  it("rescales modules the same way", () => {
    const before = comp([track(undefined, [{ type: "move", range: [0.2, 0.4], params: {} }])], 4);
    const after = retimed(before, 2);
    expect(rawModule(after.tracks[0]).range).toEqual([0.4, 0.8]);
  });

  it("keeps a stop on its second when the block it is in runs past the end", () => {
    // A block over 0 to 2s of a 4s composition, with a stop half way through it, on
    // a composition that is now 2s long: the block is out of room to grow, so the
    // stop moves inside it instead and stays on the second it was on.
    const mid = [
      { t: 0, v: 0, ease: "linear" as const },
      { t: 0.5, v: 100, ease: "linear" as const },
      { t: 1, v: 300, ease: "linear" as const },
    ];
    const before = comp([track({ x: { stops: mid, range: [0, 0.5] } })], 4);
    const after = retimed(before, 2);
    const set = after.tracks[0].keyframes!.x;
    expect(set.range).toEqual([0, 1]);
    // 1s in, which is half of the 2s composition.
    expect(set.stops[1].t).toBeCloseTo(0.5);
    expect(set.stops.map((st) => st.v)).toEqual([0, 100, 300]);
  });

  it("carries a module's own stops the same way", () => {
    const md = {
      type: "keyframes",
      range: [0, 0.5] as [number, number],
      params: { property: "x", stops: [{ t: 0, v: 0 }, { t: 1, v: 100 }] },
    };
    const after = retimed(comp([track(undefined, [md])], 4), 2);
    const out = rawModule(after.tracks[0]);
    expect(out.range).toEqual([0, 1]);
    expect(out.params.stops).toEqual([{ t: 0, v: 0 }, { t: 1, v: 100 }]);
  });

  it("leaves a composition alone when the duration has not moved", () => {
    const before = comp([track({ x: { stops, range: [0, 1] } })], 3);
    expect(retimed(before, 3)).toBe(before);
  });
});
