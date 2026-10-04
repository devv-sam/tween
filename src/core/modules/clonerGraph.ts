import type { ModuleImpl, Blend, Prop } from "../types";
import { sampleStops, type Stop } from "../curve";
import { apply } from "../blend";

export const clonerGraph: ModuleImpl = {
  evaluate(state, ctx, params) {
    const prop = params.property as Prop;
    const blend = (params.blend as Blend) ?? "mul";

    const indexStops = params.indexStops as Stop[] | undefined;
    const timeStops = params.timeStops as Stop[] | undefined;
    const legacyStops = params.stops as Stop[] | undefined;

    const indexVal =
      indexStops?.length ? sampleStops(indexStops, ctx.u)
      : legacyStops?.length ? sampleStops(legacyStops, ctx.u)
      : 1;

    const timeVal = timeStops?.length ? sampleStops(timeStops, ctx.localT) : 1;

    const combined = indexVal * timeVal;
    return apply(state, prop, combined, blend);
  },
  emit() { return ""; },
};
