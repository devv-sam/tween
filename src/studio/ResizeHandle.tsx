import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SlotText } from "slot-text/react";
import "slot-text/style.css";
import { clamp } from "../core/math";

/** How close, in px, a dragged split has to come to half and half to snap to it. */
const SNAP_PX = 8;

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
  ratio,
}: {
  label: string;
  axis: "x" | "y";
  /** The panel's current width (x) or height (y). */
  value: number;
  limits: { min: number; max: number };
  /** Which way a drag has to go to make the panel larger. */
  grows: "left" | "right" | "up";
  onResize: (size: number) => void;
  /**
   * For a handle that splits a column in two: while it is dragged, a pill says how the
   * column divides, and it snaps to half and half with a line across the window while it
   * holds there. `room` is what the two panels share; `side` is where the pill sits.
   */
  ratio?: { room: () => number; side: "after" | "before" | "inside" };
}) {
  const start = useRef<{ at: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const sign = grows === "right" ? 1 : -1;
  const horizontal = axis === "x";
  const half = () => (ratio ? Math.round(ratio.room() / 2) : null);
  const to = (v: number) => {
    const mid = half();
    onResize(clamp(mid !== null && Math.abs(v - mid) <= SNAP_PX ? mid : v, limits.min, limits.max));
  };
  const onHalf = ratio && dragging && value === half();

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
        horizontal ? "w-(--gap) cursor-col-resize" : "h-(--gap) cursor-row-resize"
      }`}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { at: horizontal ? e.clientX : e.clientY, value };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (start.current) {
          to(
            start.current.value + ((horizontal ? e.clientX : e.clientY) - start.current.at) * sign,
          );
        }
      }}
      onPointerUp={() => {
        start.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className={`absolute ${
          horizontal ? "inset-y-(--gap) -inset-x-1" : "inset-x-(--gap) -inset-y-1"
        }`}
      />
      <div
        className={`absolute rounded-full group-hover:bg-accent/50 group-focus-visible:bg-accent/50 group-active:bg-accent ${
          horizontal
            ? "inset-y-(--gap) left-1/2 w-[2px] -translate-x-1/2"
            : "inset-x-(--gap) top-1/2 h-[2px] -translate-y-1/2"
        }`}
      />
      {ratio && dragging ? <Ratio value={value} {...ratio} /> : null}
      {onHalf ? (
        <span
          aria-hidden="true"
          // Fixed, so it runs the width of the window from where the handle sits.
          className="pointer-events-none fixed right-0 left-0 z-10 mt-[calc(var(--gap)/2)] -translate-y-px border-t-2 border-dashed border-accent"
        />
      ) : null}
    </div>
  );
}

const SIDE = { after: "left-full ml-2", before: "right-full mr-2", inside: "right-2" } as const;

/** The split as two whole-ish percentages, to the nearest 5, so it reads at a glance. */
function Ratio({
  value,
  room,
  side,
}: {
  value: number;
  room: () => number;
  side: keyof typeof SIDE;
}) {
  const total = room();
  if (total <= 0) return null;
  const lower = clamp(Math.round((value / total) * 20) * 5, 5, 95);

  return (
    <span
      className={`pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white tabular-nums ${SIDE[side]}`}
    >
      <SlotText
        text={`${100 - lower} / ${lower}`}
        options={{ direction: "up", duration: 220, stagger: 0, bounce: 0 }}
      />
    </span>
  );
}
