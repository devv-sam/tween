import { useState } from "react";
import { clamp } from "../core/math";
import { useStudio } from "./store";

/**
 * The chrome every control in the studio's panels is built from. One place for it so
 * the inspector and the timeline's gutter read as the same surface — a keyframe, a
 * label, a number should not look one way on the right and another way below.
 */
export const LABEL = "text-[10px] uppercase tracking-[0.04em] text-[#888]";
/** A label for one row inside a section — quieter than the section's own, so it
 *  groups the fields under it without competing with the heading above them. */
export const SUBLABEL = "text-[9px] uppercase tracking-[0.04em] text-[#b0b0b0]";
export const SECTION = "border-b border-[#e0e0e0] px-3 py-3";
export const INPUT =
  "min-w-0 bg-transparent text-[11px] text-[#111] tabular-nums outline-none placeholder:text-[#c0c0c0]";
export const BOX =
  "flex items-center gap-1.5 rounded-md border border-[#e0e0e0] px-2 h-[26px] focus-within:border-[#0d99ff]";
export const GHOST_BTN =
  "rounded-md border border-[#e0e0e0] px-2 h-[26px] text-[11px] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111]";

/** Which side of a joined pair a field is, when two of them make one control. */
export type Join = "left" | "right";

/**
 * A numeric cell that writes on every valid keystroke — the frame re-evaluates from
 * the store, so there is no commit step to wait for. The draft is held only so a
 * half-typed "−" or "0." survives long enough to finish.
 */
export function NumberField({
  label,
  title,
  value,
  onChange,
  step = 1,
  min,
  max,
  precision = 2,
  join,
  disabled,
  autoFocus,
  compact,
  onDone,
}: {
  label: string;
  title?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  join?: Join;
  disabled?: boolean;
  /** Focus on mount — for a field that appeared because it was clicked. */
  autoFocus?: boolean;
  /** Short enough to sit in a timeline row, where the height is the lane's and there
   *  is no room for a border around every number. */
  compact?: boolean;
  /** The edit is over: enter, or focus leaving. Lets a field that only exists while
   *  it is being edited put itself away. */
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number(value.toFixed(precision)));
  const bounded = (v: number) =>
    clamp(v, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY);

  const commit = (raw: string) => {
    setDraft(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(bounded(n));
  };

  // Joined, the pair overlaps by the one pixel their shared border is, and whichever
  // half has focus draws over the other.
  const joined =
    join === "left"
      ? "rounded-r-none"
      : join === "right"
        ? "-ml-px rounded-l-none"
        : "";

  const box = compact
    ? "flex items-center gap-1 rounded-[3px] border border-transparent px-1 h-[18px] hover:border-[#e0e0e0] focus-within:border-[#0d99ff]"
    : BOX;

  return (
    <label
      className={`${box} ${joined} relative focus-within:z-10 ${
        disabled ? "opacity-60" : ""
      }`}
      title={title ?? label}
    >
      {label ? <span className={`${LABEL} shrink-0`}>{label}</span> : null}
      <input
        className={`${INPUT} w-full text-right disabled:text-[#b0b0b0]`}
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          setDraft(null);
          // A run of keystrokes in one field is one undo step; leaving ends it.
          useStudio.getState().sealHistory();
          onDone?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setDraft(null);
            e.currentTarget.blur();
            return;
          }
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
            return;
          }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const by = (e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1);
          setDraft(null);
          onChange(bounded(Number((value + by).toFixed(4))));
        }}
      />
    </label>
  );
}

/** Lucide `diamond` / `diamond-plus` / `diamond-minus` — a keyframe is a diamond
 *  everywhere in the studio, so everything that makes or picks one carries the shape. */
export function DiamondIcon({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.4l7.6 7.6a2.41 2.41 0 0 0 3.4 0l7.6-7.6a2.41 2.41 0 0 0 0-3.4l-7.6-7.6a2.41 2.41 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function DiamondPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8v8" />
      <path d="M8 12h8" />
      <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.4l7.6 7.6a2.41 2.41 0 0 0 3.4 0l7.6-7.6a2.41 2.41 0 0 0 0-3.4l-7.6-7.6a2.41 2.41 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function DiamondMinusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 12h8" />
      <path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.4l7.6 7.6a2.41 2.41 0 0 0 3.4 0l7.6-7.6a2.41 2.41 0 0 0 0-3.4l-7.6-7.6a2.41 2.41 0 0 0-3.4 0Z" />
    </svg>
  );
}

/** Lucide `chevron-right`, turned by the caller when what it opens is open. */
export function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
