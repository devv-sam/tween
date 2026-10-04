import { describe, expect, it } from "vitest";
import { THUMB_INSET, sliderFraction, sliderValueAt } from "./slider";

describe("sliderFraction", () => {
  it("places a value along the range and pins it at the ends", () => {
    expect(sliderFraction(300, 0, 600)).toBe(0.5);
    expect(sliderFraction(-5, 0, 600)).toBe(0);
    expect(sliderFraction(900, 0, 600)).toBe(1);
  });

  it("has nowhere to place a value on an empty range", () => {
    expect(sliderFraction(3, 5, 5)).toBe(0);
  });
});

describe("sliderValueAt", () => {
  const left = 100;
  const width = 220;
  const reach = width - THUMB_INSET * 2;

  it("reads the pointer against the track inside its inset", () => {
    expect(sliderValueAt(left + THUMB_INSET, left, width, 0, 600, 1)).toBe(0);
    expect(sliderValueAt(left + THUMB_INSET + reach, left, width, 0, 600, 1)).toBe(600);
    expect(sliderValueAt(left + THUMB_INSET + reach / 2, left, width, 0, 600, 1)).toBe(300);
  });

  it("holds at the ends when the pointer leaves the track", () => {
    expect(sliderValueAt(left - 400, left, width, 0, 600, 1)).toBe(0);
    expect(sliderValueAt(left + width + 400, left, width, 0, 600, 1)).toBe(600);
  });

  it("lands on the step", () => {
    const x = left + THUMB_INSET + reach * 0.123;
    expect((sliderValueAt(x, left, width, 0, 600, 5) ?? 1) % 5).toBe(0);
  });

  it("gives nothing back when there is no track to read", () => {
    expect(sliderValueAt(0, 0, THUMB_INSET * 2, 0, 600, 1)).toBeNull();
  });
});
