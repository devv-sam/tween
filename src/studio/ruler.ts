import { clamp } from "../core/math";

/** A composition shorter than this reads as a flash; longer than this is a film. */
export const MIN_DURATION = 1;
export const MAX_DURATION = 30;

/** Lane geometry, shared by the gutter labels so the two columns stay in step. */
export const TRACK_HEIGHT = 32;
export const RULER_HEIGHT = 28;

/** Within this many pixels of the left edge the playhead reads as "the start". */
export const SNAP_PX = 6;

const MAJOR_STEPS = [1, 2, 5, 10];
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

/** `MM:SS`, for ruler labels. */
export function formatTick(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`;
}

/** `MM:SS.CC`, for the transport readout — centiseconds, so scrubbing reads live. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, seconds);
  const mm = Math.floor(total / 60);
  const ss = Math.floor(total % 60);
  const cs = Math.floor((total - Math.floor(total)) * 100);
  return `${pad(mm)}:${pad(ss)}.${pad(cs)}`;
}

/** Whole milliseconds, for the readout's `ms` unit. */
export function formatMillis(seconds: number): string {
  return String(Math.round(Math.max(0, seconds) * 1000));
}

export type Tick = { t: number; x: number; label: string | null };

/**
 * Tick positions across a ruler of `width` spanning `duration` seconds. Labelled
 * majors are whole seconds so no two labels round to the same `MM:SS`; unlabelled
 * minors subdivide them when there is room.
 */
export function ticks(duration: number, width: number): Tick[] {
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
    out.push({ t, x: timeToX(t, width), label: isMajor ? formatTick(seconds) : null });
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
