export interface Pt { x: number; y: number; }

/**
 * One anchor on a distributor's path, with optional bezier handles.
 *
 * `out` steers the segment leaving this node, `in` the segment arriving at it, both
 * as offsets from the node itself. A node with neither is a corner, and a segment
 * whose two facing handles are both absent is a straight line — which is what every
 * path written before handles existed already is, so nothing has to be converted.
 */
export interface PathNode extends Pt {
  in?: Pt;
  out?: Pt;
}

export interface PathSample { x: number; y: number; angle: number; }

const deg = (radians: number): number => (radians * 180) / Math.PI;

/** Whether the run between two nodes bends. Straight segments are sampled exactly
 *  rather than approximated, which keeps an unedited path as crisp as it ever was. */
const curved = (a: PathNode, b: PathNode): boolean => Boolean(a.out || b.in);

const controls = (a: PathNode, b: PathNode): [Pt, Pt, Pt, Pt] => [
  a,
  a.out ? { x: a.x + a.out.x, y: a.y + a.out.y } : a,
  b.in ? { x: b.x + b.in.x, y: b.y + b.in.y } : b,
  b,
];

/** A cubic at `t`, de Casteljau's way — the same walk gives the tangent below. */
function cubicAt(c: [Pt, Pt, Pt, Pt], t: number): Pt {
  const s = 1 - t;
  const a = s * s * s;
  const b = 3 * s * s * t;
  const d = 3 * s * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

/** The curve's derivative at `t`, for the direction a clone faces. */
function cubicTangent(c: [Pt, Pt, Pt, Pt], t: number): Pt {
  const s = 1 - t;
  const a = 3 * s * s;
  const b = 6 * s * t;
  const d = 3 * t * t;
  return {
    x: a * (c[1].x - c[0].x) + b * (c[2].x - c[1].x) + d * (c[3].x - c[2].x),
    y: a * (c[1].y - c[0].y) + b * (c[2].y - c[1].y) + d * (c[3].y - c[2].y),
  };
}

/** How finely a curved segment is measured. Enough that an eye reading clone spacing
 *  cannot see the chords, cheap enough to redo on every frame of a drag. */
const STEPS = 24;

/** A segment's length, and the points it was measured from. */
type Run = { from: PathNode; to: PathNode; length: number; curve: [Pt, Pt, Pt, Pt] | null };

function runsOf(nodes: PathNode[]): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    if (!curved(from, to)) {
      runs.push({ from, to, length: Math.hypot(to.x - from.x, to.y - from.y), curve: null });
      continue;
    }
    const curve = controls(from, to);
    // Chord length. Clones are spread by distance travelled, so a curve that is
    // measured as shorter than it is would bunch them at its far end.
    let length = 0;
    let prev = cubicAt(curve, 0);
    for (let s = 1; s <= STEPS; s++) {
      const at = cubicAt(curve, s / STEPS);
      length += Math.hypot(at.x - prev.x, at.y - prev.y);
      prev = at;
    }
    runs.push({ from, to, length, curve });
  }
  return runs;
}

/** Where along one run a distance falls, walked the same way it was measured. */
function withinRun(run: Run, distance: number): PathSample {
  if (!run.curve) {
    const t = run.length === 0 ? 0 : distance / run.length;
    return {
      x: run.from.x + (run.to.x - run.from.x) * t,
      y: run.from.y + (run.to.y - run.from.y) * t,
      angle: deg(Math.atan2(run.to.y - run.from.y, run.to.x - run.from.x)),
    };
  }
  let walked = 0;
  let prev = cubicAt(run.curve, 0);
  for (let s = 1; s <= STEPS; s++) {
    const t = s / STEPS;
    const at = cubicAt(run.curve, t);
    const step = Math.hypot(at.x - prev.x, at.y - prev.y);
    if (walked + step >= distance || s === STEPS) {
      const within = step === 0 ? 0 : (distance - walked) / step;
      const exact = (t - 1 / STEPS) + within / STEPS;
      const p = cubicAt(run.curve, Math.min(1, Math.max(0, exact)));
      const d = cubicTangent(run.curve, Math.min(1, Math.max(0, exact)));
      return { x: p.x, y: p.y, angle: deg(Math.atan2(d.y, d.x)) };
    }
    walked += step;
    prev = at;
  }
  const end = cubicAt(run.curve, 1);
  return { x: end.x, y: end.y, angle: 0 };
}

/**
 * A point `u` of the way along a path, by distance rather than by segment — so
 * clones spread evenly over the whole run and do not bunch up wherever the anchors
 * happen to be close together.
 */
export function samplePath(nodes: PathNode[], u: number): PathSample {
  if (nodes.length === 0) return { x: 0, y: 0, angle: 0 };
  if (nodes.length === 1) return { x: nodes[0].x, y: nodes[0].y, angle: 0 };
  const runs = runsOf(nodes);
  const total = runs.reduce((sum, r) => sum + r.length, 0);
  let target = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < runs.length; i++) {
    if (target <= runs[i].length || i === runs.length - 1) return withinRun(runs[i], target);
    target -= runs[i].length;
  }
  const last = nodes[nodes.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

/** The path as an SVG `d`, for the overlay that draws it. Straight runs stay lines
 *  so an unedited path reads as the polyline it is. */
export function pathData(nodes: PathNode[]): string {
  if (nodes.length === 0) return "";
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (!curved(a, b)) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    const [, c1, c2] = controls(a, b);
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  }
  return d;
}
