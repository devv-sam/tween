import { clamp } from "../core/math";
import type { Composition, KeyframeSet } from "../core/types";
import type { Stop } from "../core/curve";
import type { Range } from "./modules";
import type { Size } from "./view";

/** The frame rates the studio offers, and the fallback for anything else. */
export const FPS_CHOICES = [24, 30, 60] as const;

/**
 * Frame sizes, named by the shape people ask for rather than the numbers — the
 * numbers are shown alongside, but the shape is what a user is choosing.
 */
export const RESOLUTIONS: { label: string; size: Size }[] = [
  { label: "1920×1080", size: { width: 1920, height: 1080 } },
  { label: "1080×1080", size: { width: 1080, height: 1080 } },
  { label: "1080×1920", size: { width: 1080, height: 1920 } },
];

export const DRIVERS = ["time", "input"] as const;

export const clampFps = (fps: number): number => clamp(Math.round(fps), 1, 240);

/** `1920x1080` — the key a select uses to name one of `RESOLUTIONS`. */
export const resolutionKey = (size: Size): string => `${size.width}x${size.height}`;

export const resolutionFor = (key: string): Size | undefined =>
  RESOLUTIONS.find((r) => resolutionKey(r.size) === key)?.size;

/**
 * A hex colour the colour input will accept, or undefined while the user is still
 * typing one. Both `#abc` and `#aabbcc` are real answers; anything else is a draft.
 */
export function normalizeHex(input: string): string | undefined {
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}

/**
 * Where the last authored motion lands, in normalized composition time, or null when
 * nothing is animated. Keyframe stops are normalized inside their own block, so a
 * set ends at its last stop rather than at the block's edge; a module has no stops to
 * read and ends where its block does.
 */
export function contentEnd(comp: Composition): number | null {
  let end: number | null = null;
  const reach = (at: number) => {
    if (end === null || at > end) end = at;
  };
  for (const track of comp.tracks) {
    for (const set of Object.values(track.keyframes ?? {})) {
      const last = set.stops.reduce((m, s) => Math.max(m, s.t), 0);
      reach(set.range[0] + last * (set.range[1] - set.range[0]));
    }
    for (const md of track.modules) reach(md.range[1]);
  }
  return end;
}

/**
 * The same composition over a different duration, with the motion kept at the
 * seconds it was authored at.
 *
 * Everything on the timeline is stored normalized — a block against the composition,
 * its stops against the block — so a plain duration change time-stretches the lot.
 * This is the other reading, where the ruler moves and the animation stays put. Both
 * levels are rescaled: a block slides and grows to cover the same seconds it did, and
 * where it runs past the end of the composition and has to stop there, its stops are
 * remapped into what is left of it so each one keeps the second it was on.
 */
export function retimed(comp: Composition, duration: number): Composition {
  if (duration <= 0 || comp.duration <= 0) return comp;
  const scale = comp.duration / duration;
  if (scale === 1) return comp;

  const shift = (range: Range): Range => [
    clamp(range[0] * scale, 0, 1),
    clamp(range[1] * scale, 0, 1),
  ];
  /** A stop's time inside its block, once the block has moved under it. */
  const restop = (t: number, from: Range, to: Range): number => {
    const span = to[1] - to[0];
    if (span <= 0) return 0;
    return clamp(((from[0] + t * (from[1] - from[0])) * scale - to[0]) / span, 0, 1);
  };
  const reset = (set: KeyframeSet): KeyframeSet => {
    const range = shift(set.range);
    return {
      ...set,
      range,
      stops: set.stops.map((stop) => ({ ...stop, t: restop(stop.t, set.range, range) })),
    };
  };

  return {
    ...comp,
    duration,
    tracks: comp.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes
        ? Object.fromEntries(
            Object.entries(track.keyframes).map(([prop, set]) => [prop, reset(set)]),
          )
        : track.keyframes,
      modules: track.modules.map((md) => {
        const range = shift(md.range);
        const stops = md.params.stops;
        return {
          ...md,
          range,
          // A module keyframes the same way, one level down in its params.
          params: Array.isArray(stops)
            ? {
                ...md.params,
                stops: (stops as Stop[]).map((stop) => ({
                  ...stop,
                  t: restop(stop.t, md.range, range),
                })),
              }
            : md.params,
        };
      }),
    })),
  };
}
