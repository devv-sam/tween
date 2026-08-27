import type { ModuleImpl, Blend, Prop } from "../types";
import { sampleStops, type Stop } from "../curve";
import { apply } from "../blend";

export const clonerGraph: ModuleImpl = {
  evaluate(state, ctx, params) {
    const prop = params.property as Prop;
    const stops = params.stops as Stop[];
    const blend = (params.blend as Blend) ?? "mul";
    return apply(state, prop, sampleStops(stops, ctx.u), blend);
  },
  emit() { return ""; },
};
