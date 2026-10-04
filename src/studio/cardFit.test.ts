import { describe, expect, it } from "vitest";
import { POPOVER_GAP, fitInViewport } from "./cardFit";

const viewport = { width: 1000, height: 700 };
const box = { width: 260, height: 300 };

describe("fitInViewport", () => {
  it("leaves a card that already fits where it is", () => {
    expect(fitInViewport({ x: 400, y: 200 }, box, viewport)).toEqual({ x: 400, y: 200 });
  });

  it("keeps the whole card on screen, a gap in from every edge", () => {
    expect(fitInViewport({ x: -50, y: -50 }, box, viewport)).toEqual({
      x: POPOVER_GAP,
      y: POPOVER_GAP,
    });
    expect(fitInViewport({ x: 5000, y: 5000 }, box, viewport)).toEqual({
      x: 1000 - 260 - POPOVER_GAP,
      y: 700 - 300 - POPOVER_GAP,
    });
  });

  it("pins a card bigger than the window to the top-left rather than past it", () => {
    expect(fitInViewport({ x: 300, y: 300 }, { width: 2000, height: 2000 }, viewport)).toEqual({
      x: POPOVER_GAP,
      y: POPOVER_GAP,
    });
  });
});
