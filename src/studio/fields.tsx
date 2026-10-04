import { useRef, useState, type PointerEvent } from "react";
import { clamp } from "../core/math";
import { useStudio } from "./store";
import { THUMB_INSET, sliderFraction, sliderValueAt } from "./slider";

/**
 * The chrome every control in the studio's panels is built from. One place for it so
 * the inspector and the timeline's gutter read as the same surface — a keyframe, a
 * label, a number should not look one way on the right and another way below.
 */
export const LABEL = "text-[10px] uppercase tracking-[0.04em] text-text-muted";
/** A label for one row inside a section — quieter than the section's own, so it
 *  groups the fields under it without competing with the heading above them. */
export const SUBLABEL = "text-[9px] uppercase tracking-[0.04em] text-text-muted/60";
export const SECTION = "border-b border-border px-3 py-3";
export const INPUT =
  "min-w-0 bg-transparent text-[11px] text-text-primary tabular-nums outline-none placeholder:text-text-muted/60";
export const BOX =
  "flex items-center gap-1.5 rounded-md border border-border px-2 h-[26px] focus-within:border-accent";
/** `BOX` with the padding pulled in, for a field holding a number and nothing else. */
export const BOX_TIGHT =
  "flex items-center rounded-md border border-border px-1.5 h-[26px] focus-within:border-accent";
export const GHOST_BTN =
  "rounded-md border border-border px-2 h-[26px] text-[11px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary";

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
  ariaLabel,
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
  tight,
  onDone,
  mixed,
  onStep,
}: {
  label: string;
  title?: string;
  /** For a field with no visible label to be named by. */
  ariaLabel?: string;
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
  /** No label beside the number, so it does not need the room for one. */
  tight?: boolean;
  /** The edit is over: enter, or focus leaving. Lets a field that only exists while
   *  it is being edited put itself away. */
  onDone?: () => void;
  /**
   * The things this field speaks for do not agree, so there is no value to show. It
   * reads "Mixed" until something is typed, and typing settles them all on that.
   */
  mixed?: boolean;
  /**
   * Step by an amount rather than to a value — what the arrow keys do when they have
   * one, so a nudge can reach several things at once and leave the spread between
   * them intact. Without it the arrows write `value + by`, as they always have.
   */
  onStep?: (by: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Nothing agreed on means nothing to show: the field is empty, and its placeholder
  // says why, rather than naming a value none of them holds.
  const shown = draft ?? (mixed ? "" : String(Number(value.toFixed(precision))));
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
    ? "flex items-center gap-1 rounded-[3px] border border-transparent px-1 h-[18px] hover:border-border focus-within:border-accent"
    : tight
      ? BOX_TIGHT
      : BOX;

  return (
    <label
      className={`${box} ${joined} relative focus-within:z-10 ${
        disabled ? "opacity-60" : ""
      }`}
      title={title}
    >
      {label ? <span className={`${LABEL} shrink-0`}>{label}</span> : null}
      <input
        className={`${INPUT} w-full text-right disabled:text-text-muted/60`}
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={mixed ? "Mixed" : undefined}
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
          if (onStep) onStep(Number(by.toFixed(4)));
          else onChange(bounded(Number((value + by).toFixed(4))));
        }}
      />
    </label>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const fraction = sliderFraction(value, min, max);

  const slideTo = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = sliderValueAt(clientX, rect.left, rect.width, min, max, step);
    if (next !== null) onChange(next);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    useStudio.getState().sealHistory();
  };

  const nudge = (by: number) => onChange(Number((value + by).toFixed(4)));

  return (
    <div
      className="group flex h-[26px] cursor-ew-resize touch-none select-none items-center gap-2 rounded-[7px] border border-transparent bg-text-primary/5 px-2 focus-within:border-accent"
      onPointerDown={(e) => {
        if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          return;
        }
        dragging.current = e.pointerId;
        slideTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current === e.pointerId) slideTo(e.clientX);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className={`${LABEL} shrink-0`}>{label}</span>
      <div ref={trackRef} className="relative h-full min-w-0 flex-1">
        <span
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="absolute top-1/2 h-[14px] w-[4px] -translate-y-1/2 rounded-full bg-text-muted/60 group-hover:bg-text-muted focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
          style={{
            left: `calc(${THUMB_INSET}px + ${fraction} * (100% - ${THUMB_INSET * 2}px) - 2px)`,
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            nudge((e.shiftKey ? 10 : 1) * step * (e.key === "ArrowRight" ? 1 : -1));
          }}
          onBlur={() => useStudio.getState().sealHistory()}
        />
      </div>
      <input
        className={`${INPUT} w-11 cursor-text text-right`}
        inputMode="decimal"
        aria-label={`${label} value`}
        value={draft ?? String(Math.round(value))}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          setDraft(null);
          useStudio.getState().sealHistory();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
            return;
          }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          setDraft(null);
          nudge((e.shiftKey ? 10 : 1) * step * (e.key === "ArrowUp" ? 1 : -1));
        }}
      />
    </div>
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
export function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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

/** Lucide `lock` / `lock-open`, inlined so two glyphs don't pull in an icon package. */
export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function LockOpenIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
