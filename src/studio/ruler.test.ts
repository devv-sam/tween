import { describe, it, expect } from "vitest";
import {
  MAX_DURATION,
  MIN_DURATION,
  SNAP_PX,
  clampDuration,
  formatClock,
  formatMillis,
  formatTick,
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
    expect(timeToX(0.25, WIDTH)).toBe(200);
    expect(xToTime(200, WIDTH)).toBeCloseTo(0.25);
  });

  it("clamps to the ruler at both ends", () => {
    expect(timeToX(-1, WIDTH)).toBe(0);
    expect(timeToX(2, WIDTH)).toBe(WIDTH);
    expect(xToTime(-40, WIDTH)).toBe(0);
    expect(xToTime(WIDTH + 40, WIDTH)).toBe(1);
  });

  it("snaps to zero near the left edge", () => {
    expect(xToTime(SNAP_PX, WIDTH)).toBe(0);
    expect(xToTime(SNAP_PX + 1, WIDTH)).toBeGreaterThan(0);
  });

  it("reads zero from a ruler with no width, rather than dividing by it", () => {
    expect(xToTime(10, 0)).toBe(0);
  });
});

describe("formatTick / formatClock", () => {
  it("labels ticks as MM:SS", () => {
    expect(formatTick(0)).toBe("00:00");
    expect(formatTick(75)).toBe("01:15");
  });

  it("reads the transport clock to a centisecond", () => {
    expect(formatClock(0)).toBe("00:00.00");
    expect(formatClock(2.5)).toBe("00:02.50");
    expect(formatClock(61.239)).toBe("01:01.23");
  });
});

describe("formatMillis", () => {
  it("reads whole milliseconds", () => {
    expect(formatMillis(0)).toBe("0");
    expect(formatMillis(1.4994)).toBe("1499");
    expect(formatMillis(3)).toBe("3000");
  });
});

describe("ticks", () => {
  it("starts at zero and ends on the duration", () => {
    const out = ticks(5, WIDTH);
    expect(out[0]).toMatchObject({ t: 0, x: 0 });
    expect(out[out.length - 1].x).toBeCloseTo(WIDTH);
  });

  it("spaces labels far enough apart to read", () => {
    const labelled = ticks(MAX_DURATION, WIDTH).filter((tk) => tk.label);
    for (let i = 1; i < labelled.length; i++) {
      expect(labelled[i].x - labelled[i - 1].x).toBeGreaterThanOrEqual(56);
    }
  });

  it("gives every label a distinct MM:SS", () => {
    const labels = ticks(3, WIDTH).map((tk) => tk.label).filter(Boolean);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("has nothing to draw without a ruler", () => {
    expect(ticks(5, 0)).toEqual([]);
    expect(ticks(0, WIDTH)).toEqual([]);
  });
});
