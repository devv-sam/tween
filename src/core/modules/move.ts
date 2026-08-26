import type { ModuleImpl } from "../types";
import { lerp } from "../math";

export const move: ModuleImpl = {
  evaluate(state, ctx, params) {
    const from = (params.from as number) ?? 0;
    const to = (params.to as number) ?? 0;
    return { ...state, x: state.x + lerp(from, to, ctx.localT) };
  },
  emit(ctx, params) {
    const from = (params.from as number) ?? 0;
    const to = (params.to as number) ?? 0;
    return (
      `document.getElementById(${JSON.stringify(ctx.targetId)})?.animate(` +
      `[{transform:"translateX(${from}px)"},{transform:"translateX(${to}px)"}],` +
      `{duration:1000,fill:"forwards"});`
    );
  },
};
