import type { Distributor, Transform } from "../core/types";
import { distanceToSegment } from "./selection";
import { expand } from "../core/distribute";
import { samplePath } from "../core/geometry";
import type { PathNode, Pt } from "../core/geometry";

/**
 * What a cloner looks like on the frame, and what can be dragged to change it.
 *
 * Everything here is composition space. The overlay maps it to the screen once,
 * which keeps the arithmetic in one place and means a gizmo can be worked out and
 * tested without a canvas in front of it.
 */

/** A thing on the gizmo the pointer can take hold of. */
export type HandleId =
  | { kind: "node"; index: number }
  | { kind: "in"; index: number }
  | { kind: "out"; index: number }
  | { kind: "radius" }
  | { kind: "start" }
  | { kind: "gapX" }
  | { kind: "gapY" };

export const sameHandle = (a: HandleId | null, b: HandleId): boolean =>
  a?.kind !== b.kind ? false : "index" in a && "index" in b ? a.index === b.index : true;

export type Handle = { id: HandleId; at: Pt; /** Round handles steer, square ones place. */ round: boolean };

/** A handle's line back to the anchor it belongs to, so a bezier arm reads as one. */
export type Stem = { from: Pt; to: Pt };

export type Ghost = { x: number; y: number; rotation: number };

export type Gizmo = {
  ghosts: Ghost[];
  /** The run the clones follow, placed on the frame. Null for layouts with no run.
   *  Nodes rather than path data: the overlay moves them to the screen first, so the
   *  curve is drawn at screen scale and the stroke does not scale with the zoom. */
  path: PathNode[] | null;
  /** The circle a radial cloner sweeps. */
  ring: { at: Pt; radius: number } | null;
  handles: Handle[];
  stems: Stem[];
  /** Where clones travel, shown once at the three-quarter mark so it does not sit
   *  under the first or last ghost. */
  arrow: { at: Pt; angle: number } | null;
};

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export const nodesOf = (d: Distributor): PathNode[] =>
  Array.isArray(d.params?.points) ? (d.params.points as PathNode[]) : [];

const shift = (p: Pt, by: Pt): Pt => ({ x: p.x + by.x, y: p.y + by.y });

/** The layout as the frame sees it: the element's own position plus each offset. */
export function gizmoFor(d: Distributor, base: Transform): Gizmo {
  const origin = { x: base.x, y: base.y };
  const ghosts = expand({
    id: "gizmo",
    source: { kind: "shape", value: "#000" },
    base,
    distributor: d,
  }).map((i) => ({ x: i.base.x, y: i.base.y, rotation: i.base.rotation }));

  if (d.type === "path") {
    const nodes = nodesOf(d);
    const placed = nodes.map((n) => ({ ...n, ...shift(n, origin) }));
    const handles: Handle[] = [];
    const stems: Stem[] = [];
    placed.forEach((n, index) => {
      handles.push({ id: { kind: "node", index }, at: { x: n.x, y: n.y }, round: false });
      if (n.in) {
        const at = shift({ x: n.x, y: n.y }, n.in);
        handles.push({ id: { kind: "in", index }, at, round: true });
        stems.push({ from: { x: n.x, y: n.y }, to: at });
      }
      if (n.out) {
        const at = shift({ x: n.x, y: n.y }, n.out);
        handles.push({ id: { kind: "out", index }, at, round: true });
        stems.push({ from: { x: n.x, y: n.y }, to: at });
      }
    });
    // Between the last two ghosts rather than at an end, where the arrow would sit
    // under a clone and say nothing.
    const arrow =
      ghosts.length > 1
        ? (() => {
            const a = ghosts[ghosts.length - 2];
            const b = ghosts[ghosts.length - 1];
            return {
              at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
            };
          })()
        : null;
    return { ghosts, path: placed, ring: null, handles, stems, arrow };
  }

  if (d.type === "radial") {
    const radius = num(d.params?.radius, 200);
    const start = num(d.params?.startAngle, -90);
    const rad = (start * Math.PI) / 180;
    const onRing = {
      x: origin.x + Math.cos(rad) * radius,
      y: origin.y + Math.sin(rad) * radius,
    };
    return {
      ghosts,
      path: null,
      ring: { at: origin, radius },
      handles: [
        { id: { kind: "radius" }, at: { x: origin.x + radius, y: origin.y }, round: false },
        { id: { kind: "start" }, at: onRing, round: true },
      ],
      stems: [{ from: origin, to: onRing }],
      arrow:
        ghosts.length > 1
          ? {
              at: ghosts[1],
              angle: start + 360 / Math.max(1, d.count) + 90,
            }
          : null,
    };
  }

  if (d.type === "grid") {
    const cols = Math.max(1, Math.round(num(d.params?.cols, Math.ceil(Math.sqrt(d.count)))));
    const rows = Math.ceil(d.count / cols);
    const gapX = num(d.params?.gapX, 100);
    const gapY = num(d.params?.gapY, 100);
    return {
      ghosts,
      path: null,
      ring: null,
      handles: [
        {
          id: { kind: "gapX" },
          at: { x: origin.x + ((cols - 1) * gapX) / 2, y: origin.y },
          round: false,
        },
        {
          id: { kind: "gapY" },
          at: { x: origin.x, y: origin.y + ((rows - 1) * gapY) / 2 },
          round: false,
        },
      ],
      stems: [],
      arrow: null,
    };
  }

  return { ghosts, path: null, ring: null, handles: [], stems: [], arrow: null };
}

/**
 * The other arm of a smoothed anchor, swung to stay in line with the one being
 * dragged and keeping its own reach.
 *
 * A run is what clones are spread along, and with `align` on it is what they face
 * down — so a bend that is smooth on screen has to be smooth in its tangent too. An
 * anchor that looked rounded while secretly turning a corner is the one state the
 * gizmo must not be able to get into. A sharp turn is still available: that is what
 * an anchor with no arms already is.
 *
 * Lengths stay independent. Mirroring those as well would rule out every asymmetric
 * curve and put the break gesture straight back on the table.
 */
function facing(
  node: PathNode,
  dragged: "in" | "out",
  arm: Pt,
): Partial<Pick<PathNode, "in" | "out">> {
  const other = dragged === "in" ? "out" : "in";
  const partner = node[other];
  const reach = Math.hypot(arm.x, arm.y);
  // Nothing on the other side, or an arm pulled onto its own anchor: no direction
  // to be read off it, so the partner is left exactly where it was.
  if (!partner || reach === 0) return {};
  const keep = Math.hypot(partner.x, partner.y);
  return { [other]: { x: (-arm.x / reach) * keep, y: (-arm.y / reach) * keep } };
}

/** How finely a run is flattened for hit testing. Fine enough that the slop around
 *  the line is doing the work, rather than the chords. */
const HIT_STEPS = 48;

/**
 * How far a point on the frame is from the shape a cloner spreads along, or null
 * when the layout has no line to be near.
 *
 * This is what makes a cloned element clickable. Clones are spread out, so the gaps
 * between them are not the element and a click there lands on nothing — but the run
 * passing through them is the element, so aiming at the line hits it.
 */
export function runDistance(d: Distributor, base: Transform, p: Pt): number | null {
  if (d.type === "path") {
    const nodes = nodesOf(d);
    if (nodes.length < 2) return null;
    const on = (u: number): Pt => {
      const s = samplePath(nodes, u);
      return { x: base.x + s.x, y: base.y + s.y };
    };
    let best = Infinity;
    let prev = on(0);
    for (let i = 1; i <= HIT_STEPS; i++) {
      const at = on(i / HIT_STEPS);
      best = Math.min(best, distanceToSegment(p, prev, at));
      prev = at;
    }
    return best;
  }

  // The ring itself, not the disc: the middle of a radial cloner is empty, and
  // whatever is sitting in there should still be reachable.
  if (d.type === "radial") {
    const radius = num(d.params?.radius, 200);
    return Math.abs(Math.hypot(p.x - base.x, p.y - base.y) - radius);
  }

  // A grid has no line to aim at. Its copies are the only thing to click.
  return null;
}

/**
 * The distributor after a handle has been dragged to a point on the frame.
 *
 * Offsets, so the drag is read back against the element rather than against the
 * frame — which is what keeps a cloner something the element carries.
 */
export function dragHandle(
  d: Distributor,
  id: HandleId,
  to: Pt,
  base: Transform,
): Distributor {
  const local = { x: to.x - base.x, y: to.y - base.y };
  const params = d.params ?? {};

  if (id.kind === "node" || id.kind === "in" || id.kind === "out") {
    const nodes = nodesOf(d);
    const node = nodes[id.index];
    if (!node) return d;
    const next = nodes.map((n, i) => {
      if (i !== id.index) return n;
      if (id.kind === "node") return { ...n, x: local.x, y: local.y };
      // A handle is stored against its own anchor, so dragging the anchor takes
      // both arms with it and dragging an arm leaves the anchor where it is.
      const arm = { x: local.x - n.x, y: local.y - n.y };
      return { ...n, [id.kind]: arm, ...facing(n, id.kind, arm) };
    });
    return { ...d, params: { ...params, points: next } };
  }

  if (id.kind === "radius") {
    return {
      ...d,
      params: { ...params, radius: Math.max(1, Math.round(Math.hypot(local.x, local.y))) },
    };
  }

  if (id.kind === "start") {
    const deg = (Math.atan2(local.y, local.x) * 180) / Math.PI;
    return { ...d, params: { ...params, startAngle: Math.round(deg) } };
  }

  if (id.kind === "gapX") {
    const cols = Math.max(1, Math.round(num(params.cols, Math.ceil(Math.sqrt(d.count)))));
    const span = Math.max(1, cols - 1);
    return {
      ...d,
      params: { ...params, gapX: Math.max(0, Math.round((local.x * 2) / span)) },
    };
  }

  if (id.kind === "gapY") {
    const cols = Math.max(1, Math.round(num(params.cols, Math.ceil(Math.sqrt(d.count)))));
    const rows = Math.max(1, Math.ceil(d.count / cols) - 1);
    return {
      ...d,
      params: { ...params, gapY: Math.max(0, Math.round((local.y * 2) / rows)) },
    };
  }

  return d;
}

/** A node added at the end of the run, carried on past the last one so it lands
 *  somewhere visible rather than on top of what is already there. */
export function addNode(d: Distributor): Distributor {
  const nodes = nodesOf(d);
  if (nodes.length === 0) {
    return { ...d, params: { ...d.params, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] } };
  }
  const last = nodes[nodes.length - 1];
  const before = nodes[nodes.length - 2] ?? { x: last.x - 100, y: last.y };
  const step = { x: last.x - before.x, y: last.y - before.y };
  const reach = Math.hypot(step.x, step.y) || 1;
  return {
    ...d,
    params: {
      ...d.params,
      points: [
        ...nodes,
        { x: last.x + (step.x / reach) * 120, y: last.y + (step.y / reach) * 120 },
      ],
    },
  };
}

/**
 * An anchor turned from a corner into a smooth bend, or back again.
 *
 * The handles it grows point along the line between its neighbours, a third of the
 * way to the nearer one — the usual smoothing, which bends the run through the
 * anchor without moving it. An end anchor has one neighbour, so it steers along
 * that. Toggling again takes them off and the corner comes back.
 */
export function toggleSmooth(d: Distributor, index: number): Distributor {
  const nodes = nodesOf(d);
  const node = nodes[index];
  if (!node) return d;

  const next = nodes.map((n, i) => {
    if (i !== index) return n;
    if (n.in || n.out) {
      const { in: _in, out: _out, ...corner } = n;
      return corner;
    }
    const before = nodes[i - 1] ?? n;
    const after = nodes[i + 1] ?? n;
    const along = { x: after.x - before.x, y: after.y - before.y };
    const reach = Math.hypot(along.x, along.y);
    if (reach === 0) return n;
    const unit = { x: along.x / reach, y: along.y / reach };
    const back = Math.hypot(n.x - before.x, n.y - before.y);
    const on = Math.hypot(after.x - n.x, after.y - n.y);
    const pull = Math.max(1, Math.min(back || on, on || back) / 3);
    return {
      ...n,
      ...(nodes[i - 1] ? { in: { x: -unit.x * pull, y: -unit.y * pull } } : {}),
      ...(nodes[i + 1] ? { out: { x: unit.x * pull, y: unit.y * pull } } : {}),
    };
  });
  return { ...d, params: { ...d.params, points: next } };
}

/** Two anchors is the least a run can be made of, so the last pair holds. */
export function removeNode(d: Distributor, index: number): Distributor {
  const nodes = nodesOf(d);
  if (nodes.length <= 2) return d;
  return { ...d, params: { ...d.params, points: nodes.filter((_, i) => i !== index) } };
}
