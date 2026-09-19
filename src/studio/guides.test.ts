import { describe, expect, it } from "vitest";
import { alignmentFor, type Box } from "./guides";

const frame = { width: 1000, height: 600 };

const box = (id: string, x: number, y: number, w: number, h: number): Box => ({
  id,
  centre: { x, y },
  half: { x: w / 2, y: h / 2 },
});

/** The bands the canvas passes in, already through the zoom. */
const SNAP = 6;
const REACH = 28;

const align = (moving: Box, others: Box[] = []) =>
  alignmentFor(moving, others, frame, SNAP, REACH);

describe("the composition's own centre", () => {
  it("draws both centre lines when an element is dropped on the middle", () => {
    const out = align(box("a", 500, 300, 100, 80));
    expect(out.delta).toEqual({ x: 0, y: 0 });
    expect(out.guides.map((g) => [g.axis, g.at])).toEqual([
      ["x", 500],
      ["y", 300],
    ]);
    expect(out.guides.every((g) => g.kind === "frame")).toBe(true);
  });

  it("pulls the element onto the centre from inside the snap band", () => {
    const out = align(box("a", 504, 300, 100, 80));
    expect(out.delta.x).toBe(-4);
    expect(out.guides.some((g) => g.axis === "x" && g.at === 500)).toBe(true);
  });

  it("runs the centre line the whole height of the frame", () => {
    const line = align(box("a", 500, 300, 100, 80)).guides.find((g) => g.axis === "x");
    expect([line?.from, line?.to]).toEqual([0, 600]);
  });

  it("lets go once the element is past the band", () => {
    const out = align(box("a", 507, 309, 100, 80));
    expect(out.delta).toEqual({ x: 0, y: 0 });
    expect(out.guides).toEqual([]);
  });
});

describe("one element against another", () => {
  // A 100x80 box sitting well away from the frame's centre lines.
  const other = box("b", 200, 150, 100, 80);

  it("lines centre up with centre", () => {
    const out = align(box("a", 203, 400, 60, 60), [other]);
    expect(out.delta.x).toBe(-3);
    const guide = out.guides.find((g) => g.axis === "x");
    expect(guide?.at).toBe(200);
    expect(guide?.kind).toBe("element");
  });

  it("lines an edge up with the matching edge", () => {
    // Left edges: the other's is at 150, this one's would be at 154.
    const out = align(box("a", 204, 400, 100, 60), [other]);
    expect(out.delta.x).toBe(-4);
    expect(out.guides.find((g) => g.axis === "x")?.at).toBe(150);
  });

  it("lines an edge up with the other's opposite edge", () => {
    // This box's left edge lands on the other's right edge, at 250.
    const out = align(box("a", 302, 400, 100, 60), [other]);
    expect(out.delta.x).toBe(-2);
    expect(out.guides.find((g) => g.axis === "x")?.at).toBe(250);
  });

  it("draws every line the same move satisfies, not just the nearest", () => {
    // Same width and position: left edge, centre and right edge all land at once.
    const out = align(box("a", 202, 400, 100, 60), [other]);
    const xs = out.guides.filter((g) => g.axis === "x").map((g) => g.at);
    expect(xs.sort((m, n) => m - n)).toEqual([150, 200, 250]);
  });

  it("reaches between the two elements it joins, and a little past both", () => {
    const guide = align(box("a", 203, 400, 60, 60), [other]).guides.find(
      (g) => g.axis === "x",
    );
    // Other spans y 110..190, the dragged one 370..430, plus the overhang.
    expect([guide?.from, guide?.to]).toEqual([110 - 12, 430 + 12]);
  });

  it("snaps both axes at once when both are in reach", () => {
    const out = align(box("a", 197, 154, 100, 80), [other]);
    expect(out.delta).toEqual({ x: 3, y: -4 });
  });
});

describe("a near miss, which is a spacing being chosen", () => {
  const other = box("b", 200, 150, 100, 80);

  it("reports the gap between the two rather than drawing a line", () => {
    // 12px off the shared centre line: past the snap band, inside the reach.
    const out = align(box("a", 212, 400, 60, 60), [other]);
    expect(out.delta).toEqual({ x: 0, y: 0 });
    expect(out.guides).toEqual([]);
    // Other's bottom edge is at 190, the dragged one's top at 370. The label sits
    // between them, centred on the width the two share.
    expect(out.measures).toEqual([
      { axis: "x", gap: 180, at: { x: 212, y: 280 } },
    ]);
  });

  it("says nothing at all once the element is past the reach", () => {
    const out = align(box("a", 400, 400, 60, 60), [other]);
    expect(out.guides).toEqual([]);
    expect(out.measures).toEqual([]);
  });

  it("has no gap to report between boxes that overlap", () => {
    // Nearly aligned on x, but sitting across the other box on y.
    const out = align(box("a", 212, 160, 60, 60), [other]);
    expect(out.measures).toEqual([]);
  });

  it("does not measure against the frame, which is not an element", () => {
    // Near the centre line on x, nowhere near it on y.
    const out = align(box("a", 512, 450, 60, 60));
    expect(out.guides).toEqual([]);
    expect(out.measures).toEqual([]);
  });
});

describe("what alignment is measured against", () => {
  it("has nothing to say about an element with no company and no centre in reach", () => {
    expect(align(box("a", 100, 100, 40, 40))).toEqual({
      delta: { x: 0, y: 0 },
      guides: [],
      measures: [],
    });
  });

  it("takes the boxes it is given, so a rotated element offers its outer bounds", () => {
    // The caller folds rotation into `half`; a wider box moves the edge it aligns by.
    const turned = box("b", 200, 150, 140, 140);
    const out = align(box("a", 133, 400, 60, 60), [turned]);
    // Left edges meet at 130, which is four away.
    expect(out.delta.x).toBe(-3);
    expect(out.guides.find((g) => g.axis === "x")?.at).toBe(130);
  });
});
