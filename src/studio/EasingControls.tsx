import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DEFAULT_SPRING,
  PRESETS,
  PRESET_NAMES,
  easeValue,
  isSpring,
  presetOf,
  type EasingDef,
  type PresetName,
  type StopEase,
} from "../core/easing";
import { clamp } from "../core/math";
import { BOX, INPUT, LABEL, SUBLABEL } from "./fields";
import { Popover } from "./Popover";

/** What the picker offers. `custom` is not something to choose — it names the curve
 *  you are already on once the pad has been dragged off every preset. */
const CHOICES = [...PRESET_NAMES, "spring"] as const;
type Choice = (typeof CHOICES)[number] | "custom";

const CHOICE_LABEL: Record<Choice, string> = {
  linear: "Linear",
  "ease in": "Ease in",
  "ease out": "Ease out",
  "in-out": "In-out",
  "ease in back": "Ease in back",
  "ease out back": "Ease out back",
  spring: "Spring",
  custom: "Custom",
};

/** Which entry a curve is standing on. */
function choiceOf(ease: StopEase | undefined): Choice {
  if (ease === undefined) return "linear";
  if (isSpring(ease)) return "spring";
  return presetOf(ease) ?? "custom";
}

const curveOf = (choice: Choice, ease: StopEase | undefined): StopEase =>
  choice === "custom"
    ? (ease ?? PRESETS.linear)
    : choice === "spring"
      ? { ...DEFAULT_SPRING }
      : PRESETS[choice];

const BEZIER_FALLBACK = PRESETS["in-out"] as EasingDef & { kind: "bezier" };

type Bezier = { x1: number; y1: number; x2: number; y2: number };

/** The four numbers a curve reads as on the pad. A spring has no handles of its own,
 *  so coming back off one lands on the shape the pad was last able to show. */
function asBezier(ease: StopEase | undefined): Bezier {
  if (ease === undefined) return { x1: 0, y1: 0, x2: 1, y2: 1 };
  if (typeof ease === "string") {
    const preset = PRESETS[presetOf(ease) ?? "linear"];
    return preset as Bezier;
  }
  if (ease.kind === "bezier") return ease;
  if (ease.kind === "linear") return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return BEZIER_FALLBACK;
}

function asSpring(ease: StopEase | undefined): {
  mass: number;
  stiffness: number;
  damping: number;
} {
  return typeof ease === "object" && ease !== null && ease.kind === "spring"
    ? { mass: ease.mass, stiffness: ease.stiffness, damping: ease.damping }
    : { ...DEFAULT_SPRING };
}

/**
 * The easing editor: which curve, and the pad or the sliders that shape it.
 *
 * One curve, however many segments are being written — the panel shows a starting
 * state and every change goes out to all of them at once.
 */
export function EasingSection({
  ease,
  mixed,
  onChange,
  note,
}: {
  ease: StopEase | undefined;
  /** They do not agree on one curve, so there is nothing to open on: the pad is
   *  drawn neutral and the picker names nothing until something is chosen. */
  mixed?: boolean;
  onChange: (ease: EasingDef) => void;
  /** Said quietly under the section when more than one segment is being written. */
  note?: string;
}) {
  const shown = mixed ? undefined : ease;
  const choice = mixed ? null : choiceOf(shown);
  const bezier = asBezier(mixed ? PRESETS.linear : shown);

  return (
    <div className="mt-2">
      <p className={LABEL}>easing</p>

      <PresetPicker
        choice={choice}
        ease={shown}
        onPick={(next) => onChange(curveOf(next, shown) as EasingDef)}
      />

      {choice === "spring" ? (
        <SpringFields spring={asSpring(shown)} onChange={onChange} />
      ) : (
        <>
          <BezierPad
            {...bezier}
            onChange={(next) => onChange({ kind: "bezier", ...next })}
          />
          <BezierValue
            {...bezier}
            onChange={(next) => onChange({ kind: "bezier", ...next })}
          />
        </>
      )}

      {note ? <p className="mt-2 text-[10px] text-[#b0b0b0]">{note}</p> : null}
    </div>
  );
}

/** The curve in force, and a list of the ones you could have instead. */
function PresetPicker({
  choice,
  ease,
  onPick,
}: {
  choice: Choice | null;
  ease: StopEase | undefined;
  onPick: (choice: Choice) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label="easing preset"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${BOX} mt-1.5 w-full justify-between hover:border-[#c8c8c8]`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <MiniCurve ease={choice === null ? PRESETS.linear : ease} />
          <span className="truncate text-[11px] text-[#111]">
            {choice === null ? "Mixed" : CHOICE_LABEL[choice]}
          </span>
        </span>
        <ChevronDownIcon />
      </button>

      {open ? (
        <Popover
          anchorRef={anchorRef}
          placement="below"
          label="easing preset"
          onClose={() => setOpen(false)}
        >
          <ul role="listbox" className="max-h-[260px] w-[226px] overflow-y-auto py-1">
            {CHOICES.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={choice === name}
                  className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] ${
                    choice === name ? "bg-[#eef4fb] text-[#111]" : "text-[#555] hover:bg-[#f5f5f5]"
                  }`}
                  onClick={() => {
                    onPick(name);
                    setOpen(false);
                  }}
                >
                  <MiniCurve
                    ease={name === "spring" ? { ...DEFAULT_SPRING } : PRESETS[name as PresetName]}
                  />
                  {CHOICE_LABEL[name]}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}

/** The dotted ground the canvas is drawn on, at the size it uses there — so the pad
 *  reads as a piece of the same surface rather than a window onto something else. */
const DOTS =
  "bg-[radial-gradient(circle,#e0e0e0_1px,transparent_1.15px)] bg-[length:20px_20px]";

/** The same surface at glyph size. Twenty-pixel dots in a twenty-pixel tile would be
 *  one dot, which reads as a speck rather than as ground. */
const DOTS_MINI =
  "bg-[radial-gradient(circle,#e4e4e4_0.5px,transparent_0.8px)] bg-[length:4px_4px]";

const MINI_W = 22;
const MINI_H = 22;
const MINI_PAD = 4;
const MINI_STEPS = 16;

/** A curve at glyph size, for the picker and its list. */
function MiniCurve({ ease }: { ease: StopEase | undefined }) {
  const points = useMemo(() => {
    const span = MINI_H - MINI_PAD * 2;
    const out: string[] = [];
    for (let i = 0; i <= MINI_STEPS; i++) {
      const x = i / MINI_STEPS;
      const y = clamp(easeValue(ease, x), -0.25, 1.25);
      out.push(
        `${(MINI_PAD + x * (MINI_W - MINI_PAD * 2)).toFixed(1)},${(
          MINI_H - MINI_PAD - y * span
        ).toFixed(1)}`,
      );
    }
    return out.join(" ");
  }, [ease]);

  return (
    <svg
      width={MINI_W}
      height={MINI_H}
      viewBox={`0 0 ${MINI_W} ${MINI_H}`}
      className={`shrink-0 rounded-[3px] border border-[#e8e8e8] ${DOTS_MINI}`}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke="#111" strokeWidth="1.25" />
    </svg>
  );
}

/** Room around the 0–1 square. The curve is clipped at the pad's edge; a handle
 *  dragged past it is still drawn at the edge, because a handle you cannot see is
 *  one you cannot drag back. */
const PAD_X = 16;
const PAD_Y = 24;
const PAD_HEIGHT = 170;
const CURVE_STEPS = 48;

type Handle = 1 | 2;

/**
 * The curve, and the two handles that shape it.
 *
 * The ends are the segment itself — it starts where it starts and arrives where it
 * arrives — so only the two control points move. They are free above and below the
 * box, which is the whole of how a curve overshoots its destination and comes back.
 */
function BezierPad({
  x1,
  y1,
  x2,
  y2,
  onChange,
}: Bezier & { onChange: (next: Bezier) => void }) {
  const padRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [held, setHeld] = useState<Handle | null>(null);

  // Measured rather than given a viewBox: the pad fills whatever width the panel
  // has, and a viewBox stretched to fit would turn its handles into ellipses.
  useEffect(() => {
    const el = padRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inner = Math.max(1, width - PAD_X * 2);
  const gx = (x: number): number => PAD_X + x * inner;
  const gy = (y: number): number => PAD_HEIGHT - PAD_Y - y * (PAD_HEIGHT - PAD_Y * 2);

  const path = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const x = i / CURVE_STEPS;
      const y = easeValue({ kind: "bezier", x1, y1, x2, y2 }, x);
      out.push(`${gx(x).toFixed(2)},${gy(y).toFixed(2)}`);
    }
    return out.join(" ");
  }, [x1, y1, x2, y2, inner]);

  const at = (e: ReactPointerEvent<HTMLElement>): Bezier | null => {
    const box = padRef.current?.getBoundingClientRect();
    if (!box) return null;
    const x = clamp((e.clientX - box.left - PAD_X) / inner, 0, 1);
    const y =
      (PAD_HEIGHT - PAD_Y - (e.clientY - box.top)) / (PAD_HEIGHT - PAD_Y * 2);
    return held === 1 ? { x1: x, y1: y, x2, y2 } : { x1, y1, x2: x, y2: y };
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!held) return;
    const next = at(e);
    if (next) onChange(next);
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!held) return;
    setHeld(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handle = (n: Handle, hx: number, hy: number) => {
    // Drawn at the edge when the value has gone past it: the stored number keeps its
    // overshoot, and the grip stays somewhere a pointer can reach.
    const cx = gx(hx);
    const cy = clamp(gy(hy), 7, PAD_HEIGHT - 7);
    return (
      <g key={n}>
        <line
          x1={n === 1 ? gx(0) : gx(1)}
          y1={n === 1 ? gy(0) : gy(1)}
          x2={cx}
          y2={cy}
          stroke="#c8c8c8"
          strokeWidth="1"
        />
        <circle
          cx={cx}
          cy={cy}
          r={held === n ? 6 : 5}
          fill={held === n ? "#0d99ff" : "#fff"}
          stroke="#0d99ff"
          strokeWidth="1.5"
          className="cursor-grab touch-none"
          onPointerDown={(e) => {
            e.preventDefault();
            setHeld(n);
            padRef.current?.setPointerCapture(e.pointerId);
          }}
        />
      </g>
    );
  };

  return (
    <div
      ref={padRef}
      className={`relative mt-1.5 w-full touch-none overflow-hidden rounded-md border border-[#e0e0e0] ${DOTS}`}
      style={{ height: PAD_HEIGHT }}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg className="absolute inset-0 h-full w-full" aria-label="easing curve">
        {/* The 0–1 square the curve is read against, so a handle past it reads as
            past something rather than as floating. */}
        <line x1={gx(0)} y1={gy(0)} x2={gx(1)} y2={gy(0)} stroke="#d8d8d8" strokeWidth="1" />
        <line x1={gx(0)} y1={gy(1)} x2={gx(1)} y2={gy(1)} stroke="#d8d8d8" strokeWidth="1" />
        <line
          x1={gx(0)}
          y1={gy(0)}
          x2={gx(1)}
          y2={gy(1)}
          stroke="#d8d8d8"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <polyline points={path} fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" />
        <circle cx={gx(0)} cy={gy(0)} r="3" fill="#b0b0b0" />
        <circle cx={gx(1)} cy={gy(1)} r="3" fill="#b0b0b0" />
        {handle(1, x1, y1)}
        {handle(2, x2, y2)}
      </svg>
    </div>
  );
}

const trim = (v: number): string => String(Number(v.toFixed(3)));

/** Four numbers separated by commas, or nothing this field can use. x is a share of
 *  the segment so it cannot leave 0–1; y is the value, which overshoots freely. */
function parseBezier(raw: string): Bezier | null {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return {
    x1: clamp(parts[0], 0, 1),
    y1: parts[1],
    x2: clamp(parts[2], 0, 1),
    y2: parts[3],
  };
}

/** The curve as the four numbers it is, typed rather than dragged. */
function BezierValue({ x1, y1, x2, y2, onChange }: Bezier & { onChange: (next: Bezier) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? [x1, y1, x2, y2].map(trim).join(", ");

  return (
    <label className={`${BOX} mt-1.5`} title="cubic bezier: x1, y1, x2, y2">
      <span className="shrink-0 text-[#888]">
        <SplineIcon />
      </span>
      <input
        className={`${INPUT} w-full`}
        aria-label="cubic bezier x1, y1, x2, y2"
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = parseBezier(e.target.value);
          if (next) onChange(next);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

const SPRING_FIELDS = [
  { key: "mass", min: 0.1, max: 10, step: 0.1 },
  { key: "stiffness", min: 10, max: 400, step: 1 },
  { key: "damping", min: 0, max: 50, step: 0.5 },
] as const;

/** How long the preview dot takes to cross its strip. Fixed — the sliders change the
 *  shape of the bounce, and a run that also changed length would hide that. */
const PREVIEW_SECONDS = 1.4;
const PREVIEW_SAMPLES = 40;

function SpringFields({
  spring,
  onChange,
}: {
  spring: { mass: number; stiffness: number; damping: number };
  onChange: (ease: EasingDef) => void;
}) {
  const write = (patch: Partial<typeof spring>) =>
    onChange({ kind: "spring", ...spring, ...patch });

  // The spring handed to CSS as a timing function rather than drawn frame by frame,
  // so the dot runs on the compositor and re-reads the sliders as they move.
  const timing = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= PREVIEW_SAMPLES; i++) {
      out.push(easeValue({ kind: "spring", ...spring }, i / PREVIEW_SAMPLES).toFixed(4));
    }
    return `linear(${out.join(",")})`;
  }, [spring.mass, spring.stiffness, spring.damping]);

  return (
    <>
      <div className="mt-2 flex flex-col gap-1.5">
        {SPRING_FIELDS.map(({ key, min, max, step }) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`${SUBLABEL} w-[52px] shrink-0`}>{key}</span>
            <input
              type="range"
              className="h-[18px] min-w-0 flex-1 accent-[#0d99ff]"
              aria-label={key}
              min={min}
              max={max}
              step={step}
              value={spring[key]}
              onChange={(e) => write({ [key]: Number(e.target.value) })}
            />
            <span className="w-[34px] shrink-0 text-right text-[10px] tabular-nums text-[#555]">
              {Number(spring[key].toFixed(1))}
            </span>
          </div>
        ))}
      </div>

      <div
        className={`relative mt-2 h-[26px] overflow-hidden rounded-md border border-[#e0e0e0] ${DOTS}`}
        aria-hidden="true"
      >
        <span
          className="absolute top-1/2 h-[10px] w-[10px] -translate-y-1/2 animate-[spring-dot_1.4s_infinite] rounded-full bg-[#0d99ff]"
          style={{ animationTimingFunction: timing, animationDuration: `${PREVIEW_SECONDS}s` }}
        />
      </div>
    </>
  );
}

function ChevronDownIcon() {
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
      className="shrink-0 text-[#888]"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Lucide `spline` — a curve held at two ends, which is what the four numbers are. */
function SplineIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <path d="M5 17A12 12 0 0 1 17 5" />
    </svg>
  );
}

/**
 * The compact easing picker, for the places that edit one keyframe at a time: the
 * keyframe log and the module stop list.
 *
 * The presets are the vocabulary here — a curve shaped on the pad shows up as
 * `custom` and is left alone rather than being rounded to the nearest one. Shaping
 * one is what the segment panel is for.
 */
export function EaseSelect({
  ease,
  onChange,
  className = "",
  title,
}: {
  ease: StopEase | undefined;
  onChange: (ease: EasingDef) => void;
  className?: string;
  title?: string;
}) {
  const choice = choiceOf(ease);
  return (
    <select
      className={`h-[26px] rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none ${className}`}
      aria-label="easing"
      title={title ?? "easing into this keyframe"}
      value={choice}
      onChange={(e) => {
        const next = e.target.value as Choice;
        if (next !== "custom") onChange(curveOf(next, ease) as EasingDef);
      }}
    >
      {CHOICES.map((name) => (
        <option key={name} value={name}>
          {CHOICE_LABEL[name]}
        </option>
      ))}
      {/* Only there to have something to show while a shaped curve is in force. */}
      {choice === "custom" ? <option value="custom">Custom</option> : null}
    </select>
  );
}
