import { clamp } from "../core/math";
import type { Span } from "./reorder";
import type { Point, Size } from "./view";

export const POPOVER_GAP = 8;

export function fitInViewport(at: Point, box: Size, viewport: Size, within?: Span): Point {
  const top = Math.max(POPOVER_GAP, within?.top ?? 0);
  const bottom = Math.min(viewport.height - POPOVER_GAP, within?.bottom ?? Infinity);
  return {
    x: clamp(at.x, POPOVER_GAP, Math.max(POPOVER_GAP, viewport.width - box.width - POPOVER_GAP)),
    y: clamp(at.y, top, Math.max(top, bottom - box.height)),
  };
}
