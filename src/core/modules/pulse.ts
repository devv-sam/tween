import type { ModuleImpl, Blend, Prop } from "../types";
import { apply } from "../blend";

export const pulse: ModuleImpl = {
  evaluate(state, ctx, params) {
    const prop = (params.property as Prop) ?? "scale";
    const rhythm = (params.rhythm as number) ?? 1;
    const stagger = (params.stagger as number) ?? 0;
    const min = (params.min as number) ?? 0.8;
    const max = (params.max as number) ?? 1.2;
    const blend = (params.blend as Blend) ?? "mul";

    const phase = ctx.i * stagger;
    const raw = Math.sin(2 * Math.PI * rhythm * (ctx.tSec + phase));
    const value = min + (raw * 0.5 + 0.5) * (max - min);

    return apply(state, prop, value, blend);
  },
  emit() { return ""; },
};
