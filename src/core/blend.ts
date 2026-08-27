import type { Transform, Blend, Prop } from "./types";

export function apply(state: Transform, prop: Prop, value: number, blend: Blend): Transform {
  const cur = state[prop];
  const next = blend === "add" ? cur + value : blend === "mul" ? cur * value : value;
  return { ...state, [prop]: next };
}
