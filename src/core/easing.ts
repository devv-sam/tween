import { clamp } from "./math";

export type Easing = "linear" | "in" | "out" | "inout";

export const easings: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/**
 * A curve described rather than named. The four bezier numbers are the same ones
 * `cubic-bezier()` takes, so a curve authored here is a curve the browser can run.
 */
export type EasingDef =
  | { kind: "bezier"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "spring"; mass: number; stiffness: number; damping: number }
  | { kind: "linear" };

/** What a stop can carry: one of the old names, or a curve of its own. */
export type StopEase = Easing | EasingDef;

export const PRESET_NAMES = [
  "linear",
  "ease in",
  "ease out",
  "in-out",
  "ease in back",
  "ease out back",
] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

export const PRESETS: Record<PresetName, EasingDef> = {
  linear: { kind: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 },
  "ease in": { kind: "bezier", x1: 0.42, y1: 0, x2: 1, y2: 1 },
  "ease out": { kind: "bezier", x1: 0, y1: 0, x2: 0.58, y2: 1 },
  "in-out": { kind: "bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  "ease in back": { kind: "bezier", x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
  "ease out back": { kind: "bezier", x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
};

export const DEFAULT_SPRING = { kind: "spring", mass: 1, stiffness: 100, damping: 10 } as const;

export const LINEAR: EasingDef = { kind: "linear" };

/** What a stop carries when nothing has been said about it. */
export const defaultEase = (): EasingDef => LINEAR;

export const isEasingDef = (e: StopEase | undefined): e is EasingDef =>
  typeof e === "object" && e !== null;

const cubic = (t: number, a: number, b: number): number => {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
};

const slope = (t: number, a: number, b: number): number => {
  const u = 1 - t;
  return 3 * u * u * a + 6 * u * t * (b - a) + 3 * t * t * (1 - b);
};

const NEWTON_STEPS = 20;
const BISECT_STEPS = 40;
const EPSILON = 1e-7;

/**
 * The parameter `t` whose x lands on `x` — the step every `cubic-bezier()` starts
 * with, because the curve is parametric and progress is read on the x axis.
 *
 * Newton converges in a handful of steps on any sane curve; a near-flat stretch
 * sends it nowhere, so a bisection takes over rather than returning the guess.
 */
function solveT(x: number, x1: number, x2: number): number {
  let t = x;
  for (let i = 0; i < NEWTON_STEPS; i++) {
    const err = cubic(t, x1, x2) - x;
    if (Math.abs(err) < EPSILON) return t;
    const d = slope(t, x1, x2);
    if (Math.abs(d) < EPSILON) break;
    t -= err / d;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < BISECT_STEPS; i++) {
    const at = cubic(t, x1, x2);
    if (Math.abs(at - x) < EPSILON) return t;
    if (at < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

export function bezierEase(
  x: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const p = clamp(x, 0, 1);
  if (p === 0 || p === 1) return p;
  // Control points on the diagonal are the identity, and solving for it wastes
  // twenty iterations on the commonest curve there is.
  if (x1 === y1 && x2 === y2) return p;
  return cubic(solveT(p, x1, x2), y1, y2);
}

/** Steps in the table a spring is sampled into. Fine enough that reading between
 *  two of them is invisible at any size the graph is drawn at. */
const SPRING_STEPS = 256;
const SPRING_SUBSTEPS = 8;

const springCache = new Map<string, Float64Array>();

/**
 * The spring integrated once and kept.
 *
 * Time here is the segment's own progress read as seconds, so a stiffness of 100 on
 * a mass of 1 swings about one and a half times across a segment however long that
 * segment happens to be — the curve is the shape of the motion, not its length.
 */
function springTable(mass: number, stiffness: number, damping: number): Float64Array {
  const key = `${mass}|${stiffness}|${damping}`;
  const held = springCache.get(key);
  if (held) return held;

  const m = Math.max(mass, 1e-3);
  const dt = 1 / (SPRING_STEPS * SPRING_SUBSTEPS);
  const table = new Float64Array(SPRING_STEPS + 1);
  let x = 0;
  let v = 0;
  for (let i = 1; i <= SPRING_STEPS; i++) {
    for (let k = 0; k < SPRING_SUBSTEPS; k++) {
      v += ((-stiffness * (x - 1) - damping * v) / m) * dt;
      x += v * dt;
    }
    table[i] = x;
  }
  springCache.set(key, table);
  return table;
}

/** The settled value a spring is normalized against — where it comes to rest, which
 *  is the displacement it was asked for. */
const SPRING_SETTLED = 1;

export function springEase(
  t: number,
  mass: number,
  stiffness: number,
  damping: number,
): number {
  const p = clamp(t, 0, 1);
  if (p === 0) return 0;
  if (p === 1) return SPRING_SETTLED;
  const table = springTable(mass, stiffness, damping);
  const at = p * SPRING_STEPS;
  const i = Math.floor(at);
  const frac = at - i;
  const a = table[i];
  const b = table[Math.min(i + 1, SPRING_STEPS)];
  return (a + (b - a) * frac) / SPRING_SETTLED;
}

/**
 * A stop's easing evaluated, whichever kind it carries. The named easings predate
 * the curves and go on working — a composition written before this existed reads
 * exactly as it always did.
 */
export function easeValue(ease: StopEase | undefined, t: number): number {
  if (ease === undefined) return t;
  if (typeof ease === "string") return easings[ease](t);
  if (ease.kind === "linear") return t;
  if (ease.kind === "spring") return springEase(t, ease.mass, ease.stiffness, ease.damping);
  return bezierEase(t, ease.x1, ease.y1, ease.x2, ease.y2);
}

/** Whether a curve is the identity — what the timeline asks before it bothers
 *  drawing a shape over a segment. */
export function isLinearEase(ease: StopEase | undefined): boolean {
  if (ease === undefined || ease === "linear") return true;
  if (typeof ease === "string") return false;
  if (ease.kind === "linear") return true;
  if (ease.kind === "spring") return false;
  return ease.x1 === ease.y1 && ease.x2 === ease.y2;
}

/** A curve written down, for comparing two of them and for keying a cache. */
export function easeKey(ease: StopEase | undefined): string {
  if (ease === undefined) return "linear";
  if (typeof ease === "string") return ease;
  if (ease.kind === "linear") return "linear";
  if (ease.kind === "spring") return `spring:${ease.mass}:${ease.stiffness}:${ease.damping}`;
  return `bezier:${ease.x1}:${ease.y1}:${ease.x2}:${ease.y2}`;
}

/**
 * Which preset chip a curve is, or null for one that has been dragged off them.
 *
 * The old named easings answer here too: they are the same four shapes the presets
 * describe, so a composition written before curves existed still lights up a chip
 * rather than reading as custom.
 */
export function presetOf(ease: StopEase | undefined): PresetName | null {
  if (ease === undefined) return "linear";
  if (typeof ease === "string") {
    return ease === "in" ? "ease in" : ease === "out" ? "ease out" : ease === "inout" ? "in-out" : "linear";
  }
  if (ease.kind === "linear") return "linear";
  if (ease.kind === "spring") return null;
  const key = easeKey(ease);
  return PRESET_NAMES.find((name) => easeKey(PRESETS[name]) === key) ?? null;
}

export const isSpring = (ease: StopEase | undefined): boolean =>
  isEasingDef(ease) && ease.kind === "spring";
