import { describe, expect, it } from "vitest";
import type { Track } from "../core/types";
import type { Stop } from "../core/curve";
import { patchStop } from "./modules";
import {
  entryId,
  formatSeconds,
  formatValue,
  indexAfterMove,
  keyframeLog,
} from "./keyframeLog";

const base = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const stops = (...vs: [number, number][]): Stop[] =>
  vs.map(([t, v]) => ({ t, v, ease: "linear" as const }));

const track = (keyframes: Track["keyframes"], separate = false): Track => ({
  layer: { id: "a", source: { kind: "shape", value: "rect" }, base, separatePosition: separate },
  keyframes,
  modules: [],
});

describe("keyframeLog", () => {
  it("has nothing to say about an element with no keyframes", () => {
    expect(keyframeLog(track(undefined), 4)).toEqual([]);
  });

  it("carries the easing a keyframe is reached by, which the editor reads back", () => {
    const groups = keyframeLog(
      track({
        scaleX: {
          stops: [
            { t: 0, v: 1, ease: "linear" },
            { t: 1, v: 2, ease: "out" },
          ],
          range: [0, 1],
        },
      }),
      4,
    );
    expect(groups[0].entries.map((e) => e.ease)).toEqual(["linear", "out"]);
  });

  it("reads x and y as one position entry per stop", () => {
    const groups = keyframeLog(
      track({
        x: { stops: stops([0, 100], [1, 527]), range: [0, 1] },
        y: { stops: stops([0, 200], [1, 312]), range: [0, 1] },
      }),
      4,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].property).toBe("position");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries[1]).toMatchObject({
      property: "position",
      index: 1,
      t: 4,
      from: { x: 100, y: 200 },
      to: { x: 527, y: 312 },
    });
  });

  it("separates the axes into their own groups once the element asks for it", () => {
    const groups = keyframeLog(
      track(
        {
          x: { stops: stops([0, 0], [1, 10]), range: [0, 1] },
          y: { stops: stops([0, 0], [1, 20]), range: [0, 1] },
        },
        true,
      ),
      2,
    );
    expect(groups.map((g) => g.property)).toEqual(["x", "y"]);
  });

  it("groups in the same order the track blocks use, position first", () => {
    const groups = keyframeLog(
      track({
        rotation: { stops: stops([0, 0], [1, 20]), range: [0, 1] },
        x: { stops: stops([0, 0], [1, 1]), range: [0, 1] },
        y: { stops: stops([0, 0], [1, 1]), range: [0, 1] },
        opacity: { stops: stops([0, 1], [1, 0.8]), range: [0, 1] },
      }),
      2,
    );
    expect(groups.map((g) => g.property)).toEqual(["position", "rotation", "opacity"]);
  });

  it("times entries in the seconds the ruler is labelled with, inside the block", () => {
    const groups = keyframeLog(
      track({ scaleX: { stops: stops([0, 1], [0.5, 1.4], [1, 2]), range: [0.25, 0.75] } }),
      4,
    );
    expect(groups[0].entries.map((e) => e.t)).toEqual([1, 2, 3]);
  });

  it("carries the previous stop as `from`, and holds still at the head of a curve", () => {
    const groups = keyframeLog(
      track({ rotation: { stops: stops([0, 20], [1, 90]), range: [0, 1] } }),
      1,
    );
    expect(groups[0].entries[0]).toMatchObject({ from: 20, to: 20 });
    expect(groups[0].entries[1]).toMatchObject({ from: 20, to: 90 });
  });
});

describe("formatValue", () => {
  it("says a position as its two numbers", () => {
    expect(formatValue("position", { x: 527.4, y: 312 })).toBe("527, 312");
  });

  it("gives each property its own units", () => {
    expect(formatValue("rotation", 20)).toBe("20°");
    expect(formatValue("scale", 1.4)).toBe("1.4×");
    expect(formatValue("opacity", 0.8)).toBe("80%");
    expect(formatValue("x", 527)).toBe("527");
  });

  it("reads a size in the pixels it covers, given the element to measure", () => {
    expect(formatValue("scaleX", 2, { width: 240, height: 160 })).toBe("480");
    expect(formatValue("scaleY", 0.5, { width: 240, height: 160 })).toBe("80");
  });

  it("falls back to the bare factor when there is no element to measure against", () => {
    expect(formatValue("scaleX", 1.5)).toBe("1.5×");
  });
});

describe("formatSeconds", () => {
  it("trims what a trailing zero adds nothing to", () => {
    expect(formatSeconds(1.2)).toBe("1.2s");
    expect(formatSeconds(2)).toBe("2s");
  });
});

describe("indexAfterMove", () => {
  const four = stops([0, 0], [0.25, 1], [0.5, 2], [0.75, 3]);

  it("finds where a stop lands once the set is re-sorted", () => {
    expect(indexAfterMove(four, 0, 0.6)).toBe(2);
    expect(indexAfterMove(four, 3, 0.1)).toBe(1);
    expect(indexAfterMove(four, 1, 0.3)).toBe(1);
  });

  it("agrees with the re-sort `patchStop` actually performs", () => {
    for (const [i, t] of [[0, 0.6], [3, 0.1], [2, 0.9], [1, 0.3]] as const) {
      const moved = patchStop(four, i, { t });
      expect(moved[indexAfterMove(four, i, t)].v).toBe(four[i].v);
    }
  });
});

describe("entryId", () => {
  it("names a row by the property and the place it sits in", () => {
    expect(entryId("position", 2)).toBe("position:2");
  });
});
