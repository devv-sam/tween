import type { ModuleImpl, Transform } from "../types";
import { clamp, lerp } from "../math";
import { easings, type Easing } from "../easing";

type Stop = { t: number; v: number; ease?: Easing };
type Prop = "x" | "y" | "scale" | "rotation" | "opacity";

export const keyframes: ModuleImpl = {
  evaluate(state, ctx, params) {
    const prop = params.property as Prop;
    const stops = params.stops as Stop[];
    return { ...state, [prop]: sample(stops, ctx.localT) } as Transform;
  },
  emit(ctx, params) {
    const prop = params.property as Prop;
    const stops = params.stops as Stop[];
    const frames = stops.map((s) => `{ offset:${s.t}, ${cssFor(prop, s.v)} }`).join(", ");
    return `document.getElementById(${JSON.stringify(ctx.targetId)})?.animate([${frames}], { duration:1000, fill:"both" });`;
  },
};

function sample(stops: Stop[], t: number): number {
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

function cssFor(prop: Prop, v: number): string {
  if (prop === "opacity") return `opacity:${v}`;
  if (prop === "rotation") return `transform:"rotate(${v}deg)"`;
  if (prop === "scale") return `transform:"scale(${v})"`;
  return `transform:"translate${prop.toUpperCase()}(${v}px)"`;
}
