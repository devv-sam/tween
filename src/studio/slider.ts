import { clamp } from "../core/math";

export const THUMB_INSET = 2;

export const sliderFraction = (value: number, min: number, max: number): number =>
  max > min ? clamp((value - min) / (max - min), 0, 1) : 0;

export function sliderValueAt(
  x: number,
  left: number,
  width: number,
  min: number,
  max: number,
  step: number,
): number | null {
  const span = width - THUMB_INSET * 2;
  if (span <= 0) return null;
  const at = clamp((x - left - THUMB_INSET) / span, 0, 1);
  return clamp(Math.round((min + at * (max - min)) / step) * step, min, max);
}
