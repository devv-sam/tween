import { describe, it, expect } from "vitest";
import { landingIndex, slotAt } from "./reorder";

const rows = [
  { top: 0, bottom: 20 },
  { top: 20, bottom: 60 },
  { top: 60, bottom: 80 },
];

describe("slotAt", () => {
  it("splits each row at its middle, tall rows included", () => {
    expect(slotAt(rows, -5)).toBe(0);
    expect(slotAt(rows, 9)).toBe(0);
    expect(slotAt(rows, 11)).toBe(1);
    expect(slotAt(rows, 39)).toBe(1);
    expect(slotAt(rows, 41)).toBe(2);
    expect(slotAt(rows, 200)).toBe(3);
  });
});

describe("landingIndex", () => {
  it("is null for the gaps either side of the row itself", () => {
    expect(landingIndex(1, 1)).toBeNull();
    expect(landingIndex(1, 2)).toBeNull();
  });

  it("moving down counts the gap past the row's own place", () => {
    expect(landingIndex(0, 3)).toBe(2);
    expect(landingIndex(2, 0)).toBe(0);
  });
});
