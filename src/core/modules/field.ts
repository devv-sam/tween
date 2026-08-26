import type { ModuleImpl, Blend, Prop } from "../types";
import { apply } from "../blend";

export const field: ModuleImpl = {
  evaluate(state, ctx, params) {
    const id = params.fieldId as string;
    const prop = params.property as Prop;
    const amount = (params.amount as number) ?? 1;
    const blend = (params.blend as Blend) ?? "mul";
    const f = ctx.field(id, state.x, state.y);
    const value = blend === "mul" ? 1 + (amount - 1) * f : amount * f;
    return apply(state, prop, value, blend);
  },
  emit() { return ""; },
};
