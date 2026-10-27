import { describe, expect, it } from "vitest";
import { SNAP_PX, lowerPercent, snapToMid } from "./split";

describe("lowerPercent", () => {
  it("rounds to the nearest 5", () => {
    expect(lowerPercent(318, 600)).toBe(55);
    expect(lowerPercent(300, 600)).toBe(50);
    expect(lowerPercent(181, 600)).toBe(30);
  });

  it("never reads 0 or 100", () => {
    expect(lowerPercent(0, 600)).toBe(5);
    expect(lowerPercent(600, 600)).toBe(95);
  });
});

describe("snapToMid", () => {
  it("holds the middle within the snap distance and lets go past it", () => {
    expect(snapToMid(300 + SNAP_PX, 300)).toBe(300);
    expect(snapToMid(300 - SNAP_PX, 300)).toBe(300);
    expect(snapToMid(300 + SNAP_PX + 1, 300)).toBe(300 + SNAP_PX + 1);
  });
});
