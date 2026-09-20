import { describe, it, expect } from "vitest";
import { pathData, samplePath, type PathNode } from "./geometry";

const at = (nodes: PathNode[], u: number) => {
  const s = samplePath(nodes, u);
  return [Math.round(s.x), Math.round(s.y)];
};

describe("samplePath on straight runs", () => {
  const line: PathNode[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it("spreads by distance from end to end", () => {
    expect(at(line, 0)).toEqual([0, 0]);
    expect(at(line, 0.5)).toEqual([50, 0]);
    expect(at(line, 1)).toEqual([100, 0]);
  });

  it("measures the whole run, not each leg, so bunched anchors do not bunch clones", () => {
    // Two legs of very different length: halfway along the path is halfway along
    // the distance, which lands inside the long leg rather than at the joint.
    const kinked: PathNode[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 110, y: 0 },
    ];
    expect(at(kinked, 0.5)).toEqual([55, 0]);
  });

  it("clamps outside 0–1 rather than running off the ends", () => {
    expect(at(line, -1)).toEqual([0, 0]);
    expect(at(line, 2)).toEqual([100, 0]);
  });

  it("faces along the direction of travel", () => {
    expect(samplePath(line, 0.5).angle).toBeCloseTo(0);
    expect(samplePath([{ x: 0, y: 0 }, { x: 0, y: 50 }], 0.5).angle).toBeCloseTo(90);
  });
});

describe("samplePath on curved runs", () => {
  /** A quarter turn: out of (0,0) heading right, into (100,100) heading down. The
   *  handle length that best fits a circular arc is r * 0.5523. */
  const K = 55.23;
  const arc: PathNode[] = [
    { x: 0, y: 0, out: { x: K, y: 0 } },
    { x: 100, y: 100, in: { x: 0, y: -K } },
  ];

  it("bows away from the straight line between its ends", () => {
    const [x, y] = at(arc, 0.5);
    // The chord's midpoint is (50,50); the arc bulges past it towards (100,0).
    expect(x).toBeGreaterThan(50);
    expect(y).toBeLessThan(50);
  });

  it("stays pinned to its anchors at both ends", () => {
    expect(at(arc, 0)).toEqual([0, 0]);
    expect(at(arc, 1)).toEqual([100, 100]);
  });

  it("tracks a circle of the same radius closely", () => {
    // Every sample should sit ~100 from the arc's centre at (0,100).
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const s = samplePath(arc, u);
      expect(Math.hypot(s.x - 0, s.y - 100)).toBeCloseTo(100, -0.5);
    }
  });

  it("turns as it goes, rather than holding one heading", () => {
    expect(samplePath(arc, 0).angle).toBeCloseTo(0, 0);
    expect(samplePath(arc, 1).angle).toBeCloseTo(90, 0);
  });

  it("spaces clones evenly along the curve, not evenly in t", () => {
    const step = (a: number, b: number) => {
      const p = samplePath(arc, a);
      const q = samplePath(arc, b);
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    const first = step(0, 0.25);
    const middle = step(0.375, 0.625);
    const last = step(0.75, 1);
    // Sampling by t alone would make the ends noticeably shorter than the middle.
    expect(Math.abs(first - last)).toBeLessThan(1);
    expect(Math.abs(first - middle)).toBeLessThan(2);
  });

  it("leaves a segment straight when neither end steers it", () => {
    const mixed: PathNode[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0, out: { x: 50, y: 0 } },
      { x: 200, y: 100, in: { x: 0, y: -50 } },
    ];
    // The first leg has no handles facing it, so its midpoint is exactly halfway.
    const s = samplePath(mixed, 0);
    expect([Math.round(s.x), Math.round(s.y)]).toEqual([0, 0]);
    expect(pathData(mixed)).toContain("L 100 0");
    expect(pathData(mixed)).toContain("C ");
  });
});

describe("pathData", () => {
  it("is empty for a path with no nodes", () => {
    expect(pathData([])).toBe("");
  });

  it("writes straight runs as lines", () => {
    expect(pathData([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toBe("M 0 0 L 10 20");
  });

  it("writes a steered run as a cubic through its handles", () => {
    const d = pathData([
      { x: 0, y: 0, out: { x: 10, y: 0 } },
      { x: 100, y: 0, in: { x: -10, y: 0 } },
    ]);
    expect(d).toBe("M 0 0 C 10 0, 90 0, 100 0");
  });
});
