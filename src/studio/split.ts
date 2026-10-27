import { clamp } from "../core/math";

/** How close, in px, a dragged split has to come to half and half to snap to it. */
export const SNAP_PX = 8;

/** The lower panel's share of what two panels split, to the nearest 5, kept off the ends. */
export const lowerPercent = (lower: number, total: number): number =>
  clamp(Math.round((lower / total) * 20) * 5, 5, 95);

/** `size`, or `mid` when it is within the snap distance of it. */
export const snapToMid = (size: number, mid: number): number =>
  Math.abs(size - mid) <= SNAP_PX ? mid : size;
