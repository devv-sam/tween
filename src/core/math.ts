export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const remap = (t: number, [s, e]: [number, number]) =>
  e === s ? 0 : clamp((t - s) / (e - s), 0, 1);
