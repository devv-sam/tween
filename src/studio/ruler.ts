import { clamp } from "../core/math";

/** A composition shorter than this reads as a flash; longer than this is a film. */
export const MIN_DURATION = 1;
export const MAX_DURATION = 30;

/** Lane geometry, shared by the gutter labels so the two columns stay in step. */
export const TRACK_HEIGHT = 32;
export const RULER_HEIGHT = 28;

/** Within this many pixels of the left edge the playhead reads as "the start". */
export const SNAP_PX = 6;

/** Seconds a labelled tick can step by. Decimals read fine, so halves are allowed. */
const MAJOR_STEPS = [0.5, 1, 2, 5, 10];
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
  return clamp(t, 0, 1) * width;
}

export function xToTime(x: number, width: number): number {
  if (width < 1) return 0;
  return clamp(x <= SNAP_PX ? 0 : x / width, 0, 1);
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
  if (width < 1 || duration <= 0) return [];
  const perSecond = width / duration;
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
