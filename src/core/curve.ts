import { clamp, lerp } from "./math";
import { easeValue, type StopEase } from "./easing";
import type { Blend } from "./types";

/**
 * One keyframe. `ease` and `blend` both describe the *incoming* transition — how the
 * value arrives here from the stop before it — so the first stop on a curve carries
 * neither: nothing precedes it.
 */
export type Stop = { t: number; v: number; ease?: StopEase; blend?: Blend };

export function sampleStops(stops: Stop[], t: number): number {
  if (t <= stops[0].t) return stops[0].v;
  const last = stops[stops.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const lt = (t - a.t) / (b.t - a.t);
      return lerp(a.v, b.v, easeValue(b.ease, clamp(lt, 0, 1)));
    }
  }
  return last.v;
}

/** How the segment covering `t` writes its value onto whatever is already there.
 *  Held by the stop the segment arrives at, the same way its easing is. */
export function blendAt(stops: Stop[], t: number): Blend {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) return stops[i].blend ?? "set";
  }
  return stops[stops.length - 1].blend ?? "set";
}
