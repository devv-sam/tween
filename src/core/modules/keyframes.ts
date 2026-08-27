import type { ModuleImpl, Blend, Prop } from "../types";
import { sampleStops, type Stop } from "../curve";
import { apply } from "../blend";

export const keyframes: ModuleImpl = {
  evaluate(state, ctx, params) {
    const prop = params.property as Prop;
    const stops = params.stops as Stop[];
    const blend = (params.blend as Blend) ?? "set";
    return apply(state, prop, sampleStops(stops, ctx.localT), blend);
  },
  emit(ctx, params) {
    const prop = params.property as string;
    const stops = params.stops as Stop[];
    const frames = stops.map((s) => `{ offset:${s.t}, ${prop}:${s.v} }`).join(", ");
    return `document.getElementById(${JSON.stringify(ctx.targetId)})?.animate([${frames}], { duration:1000, fill:"both" });`;
  },
};
