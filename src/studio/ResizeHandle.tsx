import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clamp } from "../core/math";

/**
 * The gap between two panels, which is also where either can be dragged larger. The
 * hit area spills past the gap onto the panels' edges so the grip is wider than the gap.
 */
export function ResizeHandle({
  label,
  axis,
  value,
  limits,
  grows,
  onResize,
}: {
  label: string;
  axis: "x" | "y";
  /** The panel's current width (x) or height (y). */
  value: number;
  limits: { min: number; max: number };
  /** Which way a drag has to go to make the panel larger. */
  grows: "left" | "right" | "up";
  onResize: (size: number) => void;
}) {
  const start = useRef<{ at: number; value: number } | null>(null);
  const sign = grows === "right" ? 1 : -1;
  const horizontal = axis === "x";
  const to = (v: number) => onResize(clamp(v, limits.min, limits.max));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = horizontal ? "ArrowRight" : "ArrowDown";
    const back = horizontal ? "ArrowLeft" : "ArrowUp";
    if (e.key !== forward && e.key !== back) return;
    e.preventDefault();
    to(value + (e.key === forward ? 1 : -1) * sign * (e.shiftKey ? 48 : 16));
  };

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={value}
      tabIndex={0}
      className={`group relative z-10 shrink-0 touch-none outline-none ${
        horizontal ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
      }`}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { at: horizontal ? e.clientX : e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (start.current) {
          to(
            start.current.value + ((horizontal ? e.clientX : e.clientY) - start.current.at) * sign,
          );
        }
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={onKeyDown}
    >
      <div
        className={`absolute ${
          horizontal ? "inset-y-2 -inset-x-1" : "inset-x-2 -inset-y-1"
        }`}
      />
      <div
        className={`absolute rounded-full group-hover:bg-accent/50 group-focus-visible:bg-accent/50 group-active:bg-accent ${
          horizontal
            ? "inset-y-2 left-1/2 w-[2px] -translate-x-1/2"
            : "inset-x-2 top-1/2 h-[2px] -translate-y-1/2"
        }`}
      />
    </div>
  );
}

