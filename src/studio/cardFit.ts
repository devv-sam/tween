import { clamp } from "../core/math";
import type { Point, Size } from "./view";

export const POPOVER_GAP = 8;

export function fitInViewport(at: Point, box: Size, viewport: Size): Point {
  return {
    x: clamp(at.x, POPOVER_GAP, Math.max(POPOVER_GAP, viewport.width - box.width - POPOVER_GAP)),
    y: clamp(at.y, POPOVER_GAP, Math.max(POPOVER_GAP, viewport.height - box.height - POPOVER_GAP)),
  };
}
