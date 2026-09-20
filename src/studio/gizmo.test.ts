import { describe, expect, it } from "vitest";
import type { Distributor, Transform } from "../core/types";
import type { PathNode } from "../core/geometry";
import { addNode, dragHandle, gizmoFor, nodesOf, removeNode, toggleSmooth } from "./gizmo";

const base: Transform = { x: 500, y: 300, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const path = (points: PathNode[], count = 3): Distributor => ({
  type: "path",
  count,
  params: { points },
});

const line = () =>
  path([
    { x: -100, y: 0 },
    { x: 100, y: 0 },
  ]);

describe("gizmoFor", () => {
  it("places the run on the frame, around the element", () => {
    const g = gizmoFor(line(), base);
    const nodes = g.handles.filter((h) => h.id.kind === "node").map((h) => h.at);
    expect(nodes).toEqual([
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ]);
  });

  it("ghosts every clone where it will actually land", () => {
    const g = gizmoFor(line(), base);
    expect(g.ghosts.map((p) => [p.x, p.y])).toEqual([
      [400, 300],
      [500, 300],
      [600, 300],
    ]);
  });

  it("points the arrow the way the clones travel", () => {
    expect(gizmoFor(line(), base).arrow?.angle).toBeCloseTo(0);
    const down = path([
      { x: 0, y: -100 },
      { x: 0, y: 100 },
    ]);
    expect(gizmoFor(down, base).arrow?.angle).toBeCloseTo(90);
  });

  it("gives a steered anchor an arm back to itself", () => {
    const g = gizmoFor(path([{ x: -100, y: 0, out: { x: 50, y: 0 } }, { x: 100, y: 0 }]), base);
    expect(g.handles.some((h) => h.id.kind === "out")).toBe(true);
    expect(g.stems).toEqual([{ from: { x: 400, y: 300 }, to: { x: 450, y: 300 } }]);
  });

  it("draws a radial cloner's ring around the element", () => {
    const g = gizmoFor({ type: "radial", count: 4, params: { radius: 80 } }, base);
    expect(g.ring).toEqual({ at: { x: 500, y: 300 }, radius: 80 });
    expect(g.path).toBeNull();
  });

  it("offers a grid its two gaps and nothing else", () => {
    const g = gizmoFor(
      { type: "grid", count: 4, params: { cols: 2, gapX: 40, gapY: 60 } },
      base,
    );
    expect(g.handles.map((h) => h.id.kind).sort()).toEqual(["gapX", "gapY"]);
    expect(g.handles.find((h) => h.id.kind === "gapX")?.at).toEqual({ x: 520, y: 300 });
    expect(g.handles.find((h) => h.id.kind === "gapY")?.at).toEqual({ x: 500, y: 330 });
  });
});

describe("dragHandle", () => {
  it("writes an anchor back as an offset from the element", () => {
    const next = dragHandle(line(), { kind: "node", index: 1 }, { x: 700, y: 400 }, base);
    expect(nodesOf(next)[1]).toEqual({ x: 200, y: 100 });
  });

  it("leaves the anchor alone when an arm is dragged", () => {
    const steered = path([{ x: -100, y: 0, out: { x: 50, y: 0 } }, { x: 100, y: 0 }]);
    const next = dragHandle(steered, { kind: "out", index: 0 }, { x: 400, y: 260 }, base);
    const node = nodesOf(next)[0];
    expect([node.x, node.y]).toEqual([-100, 0]);
    expect(node.out).toEqual({ x: 0, y: -40 });
  });

  it("reads a radius as the distance from the element", () => {
    const d: Distributor = { type: "radial", count: 4, params: { radius: 80 } };
    const next = dragHandle(d, { kind: "radius" }, { x: 620, y: 300 }, base);
    expect(next.params?.radius).toBe(120);
  });

  it("reads a start angle as the direction from the element", () => {
    const d: Distributor = { type: "radial", count: 4, params: { radius: 80 } };
    expect(dragHandle(d, { kind: "start" }, { x: 500, y: 400 }, base).params?.startAngle).toBe(90);
    expect(dragHandle(d, { kind: "start" }, { x: 600, y: 300 }, base).params?.startAngle).toBe(0);
  });

  it("spreads a grid from its centre, so a gap handle moves half the span", () => {
    const d: Distributor = { type: "grid", count: 4, params: { cols: 2, gapX: 40, gapY: 60 } };
    // One column gap, and the handle sits at half of it.
    const next = dragHandle(d, { kind: "gapX" }, { x: 560, y: 300 }, base);
    expect(next.params?.gapX).toBe(120);
  });

  it("never lets a gap go negative", () => {
    const d: Distributor = { type: "grid", count: 4, params: { cols: 2, gapX: 40, gapY: 60 } };
    expect(dragHandle(d, { kind: "gapX" }, { x: 100, y: 300 }, base).params?.gapX).toBe(0);
  });
});

describe("shaping the run", () => {
  it("rounds a corner off without moving it, and squares it back", () => {
    const three = path([
      { x: -100, y: 0 },
      { x: 0, y: -60 },
      { x: 100, y: 0 },
    ]);
    const smooth = toggleSmooth(three, 1);
    const middle = nodesOf(smooth)[1];
    expect([middle.x, middle.y]).toEqual([0, -60]);
    expect(middle.in).toBeDefined();
    expect(middle.out).toBeDefined();
    // The arms face opposite ways along the line between the neighbours.
    expect(middle.in!.x).toBeLessThan(0);
    expect(middle.out!.x).toBeGreaterThan(0);

    const corner = nodesOf(toggleSmooth(smooth, 1))[1];
    expect(corner.in).toBeUndefined();
    expect(corner.out).toBeUndefined();
  });

  it("only steers the side an end anchor has a neighbour on", () => {
    const first = nodesOf(toggleSmooth(line(), 0))[0];
    expect(first.in).toBeUndefined();
    expect(first.out).toBeDefined();
  });

  it("adds an anchor beyond the end, carrying on the way the run was heading", () => {
    const next = nodesOf(addNode(line()));
    expect(next).toHaveLength(3);
    expect(next[2].y).toBe(0);
    expect(next[2].x).toBeGreaterThan(100);
  });

  it("keeps the last two anchors, because a run needs both ends", () => {
    expect(nodesOf(removeNode(line(), 0))).toHaveLength(2);
    const three = addNode(line());
    expect(nodesOf(removeNode(three, 1))).toHaveLength(2);
  });
});
