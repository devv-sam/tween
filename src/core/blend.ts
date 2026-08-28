import type { Transform, Blend, Prop } from "./types";

const mix = (cur: number, value: number, blend: Blend): number =>
  blend === "add" ? cur + value : blend === "mul" ? cur * value : value;

/**
 * `scale` is a virtual prop: it drives both axes together, so a module can scale an
 * element uniformly without knowing the transform carries separate axes.
 */
export function apply(state: Transform, prop: Prop, value: number, blend: Blend): Transform {
  if (prop === "scale") {
    return {
      ...state,
      scaleX: mix(state.scaleX, value, blend),
      scaleY: mix(state.scaleY, value, blend),
    };
  }
  return { ...state, [prop]: mix(state[prop], value, blend) };
}
