import { clamp, lerp } from "./math";
import { easings, type Easing } from "./easing";

export type Stop = { t: number; v: number; ease?: Easing };

export function sampleStops(stops: Stop[], t: number): number {
  if (t <= stops[0].t) return stops[0].v;
  const last = stops[stops.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const lt = (t - a.t) / (b.t - a.t);
      return lerp(a.v, b.v, easings[b.ease ?? "linear"](clamp(lt, 0, 1)));
    }
  }
  return last.v;
}
