import { describe, it, expect } from "vitest";
import {
  FINEST_STEP,
  GUTTER_PX,
  MAX_DURATION,
  MIN_DURATION,
  SNAP_PX,
  clampDuration,
  formatMillis,
  formatSeconds,
  formatTime,
  ticks,
  timeToX,
  xToTime,
} from "./ruler";

const WIDTH = 800;

describe("clampDuration", () => {
  it("holds the composition between a second and half a minute", () => {
    expect(clampDuration(0.1)).toBe(MIN_DURATION);
    expect(clampDuration(120)).toBe(MAX_DURATION);
    expect(clampDuration(4.5)).toBe(4.5);
  });
});

describe("timeToX / xToTime", () => {
  it("round-trips through the middle of the ruler", () => {
    const middle = timeToX(0.25, WIDTH);
    expect(middle).toBe(GUTTER_PX + 0.25 * (WIDTH - GUTTER_PX));
    expect(xToTime(middle, WIDTH)).toBeCloseTo(0.25);
  });

  it("keeps the gutter clear, so the playhead at zero is not clipped", () => {
    expect(timeToX(0, WIDTH)).toBe(GUTTER_PX);
    expect(xToTime(0, WIDTH)).toBe(0);
  });

  it("clamps to the ruler at both ends", () => {
    expect(timeToX(-1, WIDTH)).toBe(GUTTER_PX);
    expect(timeToX(2, WIDTH)).toBe(WIDTH);
    expect(xToTime(-40, WIDTH)).toBe(0);
    expect(xToTime(WIDTH + 40, WIDTH)).toBe(1);
  });

  it("snaps to zero near the left edge", () => {
    expect(xToTime(GUTTER_PX + SNAP_PX, WIDTH)).toBe(0);
    expect(xToTime(GUTTER_PX + SNAP_PX + 1, WIDTH)).toBeGreaterThan(0);
  });

  it("reads zero from a ruler with no width, rather than dividing by it", () => {
    expect(xToTime(10, 0)).toBe(0);
    expect(xToTime(10, GUTTER_PX)).toBe(0);
  });
});

describe("formatSeconds / formatMillis / formatTime", () => {
  it("reads seconds as 0.00 at every magnitude", () => {
    expect(formatSeconds(0)).toBe("0.00");
    expect(formatSeconds(1.5)).toBe("1.50");
    expect(formatSeconds(61.239)).toBe("61.24");
  });

  it("reads whole milliseconds", () => {
    expect(formatMillis(0)).toBe("0");
    expect(formatMillis(1.4994)).toBe("1499");
    expect(formatMillis(3)).toBe("3000");
  });

  it("routes both units through one formatter", () => {
    expect(formatTime(2.5, "s")).toBe("2.50");
    expect(formatTime(2.5, "ms")).toBe("2500");
  });
});

describe("ticks", () => {
  it("starts at zero and ends on the duration", () => {
    const out = ticks(5, WIDTH);
    expect(out[0]).toMatchObject({ t: 0, x: GUTTER_PX });
    expect(out[out.length - 1].x).toBeCloseTo(WIDTH);
  });

  it("spaces labels far enough apart to read", () => {
    const labelled = ticks(MAX_DURATION, WIDTH).filter((tk) => tk.label);
    for (let i = 1; i < labelled.length; i++) {
      expect(labelled[i].x - labelled[i - 1].x).toBeGreaterThanOrEqual(56);
    }
  });

  it("gives every label a distinct time", () => {
    const labels = ticks(3, WIDTH).map((tk) => tk.label).filter(Boolean);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("relabels in the unit it is asked for", () => {
    const at = (unit: "s" | "ms") =>
      ticks(2, WIDTH, unit).map((tk) => tk.label).filter(Boolean);
    expect(at("s")).toContain("1.00");
    expect(at("ms")).toContain("1000");
    // Same ticks either way — only their labels change.
    expect(ticks(2, WIDTH, "ms").map((tk) => tk.x)).toEqual(
      ticks(2, WIDTH, "s").map((tk) => tk.x),
    );
  });

  const gapsInSeconds = (duration: number, width: number) => {
    const out = ticks(duration, width);
    return out.slice(1).map((tk, i) => (tk.t - out[i].t) * duration);
  };

  it("reaches 10ms a tick once the composition is as short as it goes", () => {
    for (const width of [1400, 800, 400, 200]) {
      const gaps = gapsInSeconds(MIN_DURATION, width);
      expect(Math.min(...gaps)).toBeCloseTo(FINEST_STEP, 6);
    }
  });

  it("never draws finer than 10ms, however short the composition", () => {
    for (const duration of [MIN_DURATION, 0.15, 0.25, 0.5, 0.908, 1, 3, MAX_DURATION]) {
      for (const width of [1400, 800, 320]) {
        const finest = Math.min(...gapsInSeconds(duration, width));
        expect(finest).toBeGreaterThanOrEqual(FINEST_STEP - 1e-9);
      }
    }
  });

  it("labels the short end in whole milliseconds", () => {
    const labels = ticks(MIN_DURATION, 1400, "ms").map((tk) => tk.label).filter(Boolean);
    expect(labels).toEqual(["0", "50", "100"]);
  });

  it("has nothing to draw without a ruler", () => {
    expect(ticks(5, 0)).toEqual([]);
    expect(ticks(5, GUTTER_PX)).toEqual([]);
    expect(ticks(0, WIDTH)).toEqual([]);
  });
});
