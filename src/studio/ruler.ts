import { clamp } from "../core/math";

/** Short enough for a single gesture to be the whole composition; longer than the
 *  maximum is a film. */
export const MIN_DURATION = 0.1;
export const MAX_DURATION = 30;

/** Lane geometry, shared by the gutter labels so the two columns stay in step. */
export const TRACK_HEIGHT = 32;
/** Deep enough for the transport to sit in beside the ruler, not just for ticks. */
export const RULER_HEIGHT = 40;
/** A property's own row, opened under the element it belongs to. Room enough that a
 *  keyframe has air above and below it rather than filling its lane. */
export const PROPERTY_HEIGHT = 30;

/** Within this many pixels of the left edge the playhead reads as "the start". */
export const SNAP_PX = 6;

/**
 * Room kept to the left of time zero. The playhead's grab triangle is centred on the
 * time it points at, so at 0 its left half hangs off the strip and is clipped away.
 * The composition is drawn from here rather than from the strip's own edge.
 */
export const GUTTER_PX = 8;

/** The pixels the composition itself is drawn across — the strip less its gutter. */
export const spanPx = (width: number): number => Math.max(0, width - GUTTER_PX);

/** Seconds a labelled tick can step by. Decimals read fine, so fractions are
 *  allowed. The smallest is what a fully zoomed-in ruler lands on: five minors to a
 *  major puts 0.05 at a 10ms finest tick, and nothing finer is ever drawn. */
const MAJOR_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
/** The finest tick the ruler will draw, in seconds. `MAJOR_STEPS[0]` divided by
 *  `MINOR_DIVISIONS` — kept here so a test can hold the two to it. */
export const FINEST_STEP = 0.01;
const MINOR_DIVISIONS = 5;
const MIN_LABEL_GAP = 56;
const MIN_MINOR_GAP = 10;

export const clampDuration = (seconds: number) =>
  clamp(seconds, MIN_DURATION, MAX_DURATION);

/**
 * The ruler's one mapping: normalized time to a strip-local x. `xToTime` is its
 * inverse, so a drag and the playhead it moves always agree.
 */
export function timeToX(t: number, width: number): number {
  return GUTTER_PX + clamp(t, 0, 1) * spanPx(width);
}

export function xToTime(x: number, width: number): number {
  const span = spanPx(width);
  if (span < 1) return 0;
  // Anywhere in the gutter is the start, which is what the snap already said about
  // the pixels just past it.
  const local = x - GUTTER_PX;
  return clamp(local <= SNAP_PX ? 0 : local / span, 0, 1);
}

/** Which unit the transport and the ruler both read in. */
export type Unit = "s" | "ms";

/** Seconds to two decimals — the same `0.00` shape at every magnitude. */
export function formatSeconds(seconds: number): string {
  return Math.max(0, seconds).toFixed(2);
}

/** Whole milliseconds, the unit the exporter counts frames in. */
export function formatMillis(seconds: number): string {
  return String(Math.round(Math.max(0, seconds) * 1000));
}

/** One formatter for the readout and the ruler, so a unit switch moves both. */
export function formatTime(seconds: number, unit: Unit): string {
  return unit === "s" ? formatSeconds(seconds) : formatMillis(seconds);
}

export type Tick = { t: number; x: number; label: string | null };

/**
 * Tick positions across a ruler of `width` spanning `duration` seconds. Majors
 * carry a label in the current unit; unlabelled minors subdivide them when there
 * is room.
 */
export function ticks(duration: number, width: number, unit: Unit = "s"): Tick[] {
  const span = spanPx(width);
  if (span < 1 || duration <= 0) return [];
  const perSecond = span / duration;
  const major =
    MAJOR_STEPS.find((s) => s * perSecond >= MIN_LABEL_GAP) ??
    MAJOR_STEPS[MAJOR_STEPS.length - 1];
  const step =
    (major / MINOR_DIVISIONS) * perSecond >= MIN_MINOR_GAP
      ? major / MINOR_DIVISIONS
      : major;

  const out: Tick[] = [];
  for (let i = 0; i * step <= duration + 1e-6; i++) {
    const seconds = i * step;
    const t = seconds / duration;
    const ratio = seconds / major;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-6;
    out.push({
      t,
      x: timeToX(t, width),
      label: isMajor ? formatTime(seconds, unit) : null,
    });
  }
  return out;
}
