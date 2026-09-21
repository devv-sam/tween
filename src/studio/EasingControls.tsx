import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
import { LABEL, NumberField, SUBLABEL } from "./fields";

/** The chips, in the order they are offered. `custom` is not something to pick — it
 *  lights up on its own once the graph has been dragged off every preset. */
const CHIPS = [...PRESET_NAMES, "spring", "custom"] as const;
type Chip = (typeof CHIPS)[number];

/** Which chip a curve is standing on. */
function chipOf(ease: StopEase | undefined): Chip | null {
  if (ease === undefined) return "linear";
  if (isSpring(ease)) return "spring";
  return presetOf(ease) ?? "custom";
}

const BEZIER_FALLBACK: EasingDef = PRESETS["in-out"];

/** The bezier a curve reads as in the graph. A spring has no handles of its own, so
 *  switching back off it lands on the shape the graph was last able to show. */
function asBezier(ease: StopEase | undefined): { x1: number; y1: number; x2: number; y2: number } {
  if (ease === undefined) return PRESETS.linear as { x1: number; y1: number; x2: number; y2: number };
  if (typeof ease === "string") {
    const preset = PRESETS[presetOf(ease) ?? "linear"];
    return preset as { x1: number; y1: number; x2: number; y2: number };
  }
  if (ease.kind === "bezier") return ease;
  if (ease.kind === "linear") return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return BEZIER_FALLBACK as { x1: number; y1: number; x2: number; y2: number };
}

function asSpring(ease: StopEase | undefined): {
  mass: number;
  stiffness: number;
  damping: number;
} {
  return typeof ease === "object" && ease !== null && ease.kind === "spring"
    ? { mass: ease.mass, stiffness: ease.stiffness, damping: ease.damping }
    : { mass: DEFAULT_SPRING.mass, stiffness: DEFAULT_SPRING.stiffness, damping: DEFAULT_SPRING.damping };
}

/**
 * The easing editor: the chips, and under them the graph or the spring's sliders.
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
  /** They do not agree on one curve, so there is nothing to open on: the graph is
   *  drawn neutral and no chip is lit until something is chosen. */
  mixed?: boolean;
  onChange: (ease: EasingDef) => void;
  /** Said quietly under the section when more than one segment is being written. */
  note?: string;
}) {
  const chip = mixed ? null : chipOf(ease);
  const spring = !mixed && isSpring(ease);

  return (
    <div className="mt-2">
      <p className={LABEL}>easing</p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {CHIPS.map((name) => {
          const on = chip === name;
          const pickable = name !== "custom";
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              disabled={!pickable}
              title={name === "custom" ? "the graph has been dragged off every preset" : name}
              className={`rounded-full border px-2 py-[3px] text-[10px] leading-none transition-colors ${
                on
                  ? "border-[#0d99ff] bg-[#0d99ff] text-white"
                  : "border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111]"
              } ${pickable ? "" : on ? "cursor-default" : "cursor-default disabled:opacity-45"}`}
              onClick={() => {
                if (name === "spring") onChange({ ...DEFAULT_SPRING });
                else if (name !== "custom") onChange({ ...PRESETS[name as PresetName] });
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {spring ? (
        <SpringFields spring={asSpring(ease)} onChange={onChange} />
      ) : (
        <BezierFields ease={mixed ? PRESETS.linear : ease} onChange={onChange} />
      )}

      {note ? <p className="mt-2 text-[10px] text-[#b0b0b0]">{note}</p> : null}
    </div>
  );
}

/** The graph's box, in its own units. Wide enough for the panel, and tall enough that
 *  an overshooting curve has somewhere to go before it runs off the top. */
const GRAPH_W = 236;
const GRAPH_H = 160;
/** Room around the 0–1 square. The curve is clipped at the box; a handle dragged past
 *  it is still drawn at the edge, because a handle you cannot see is one you cannot
 *  drag back. */
const PAD_X = 14;
const PAD_Y = 26;

const gx = (x: number): number => PAD_X + x * (GRAPH_W - PAD_X * 2);
const gy = (y: number): number => GRAPH_H - PAD_Y - y * (GRAPH_H - PAD_Y * 2);
const ungx = (px: number): number => (px - PAD_X) / (GRAPH_W - PAD_X * 2);
const ungy = (py: number): number => (GRAPH_H - PAD_Y - py) / (GRAPH_H - PAD_Y * 2);

const CURVE_STEPS = 48;

function BezierFields({
  ease,
  onChange,
}: {
  ease: StopEase | undefined;
  onChange: (ease: EasingDef) => void;
}) {
  const b = asBezier(ease);
  const write = (patch: Partial<typeof b>) =>
    onChange({ kind: "bezier", ...b, ...patch });

  return (
    <>
      <BezierGraph
        x1={b.x1}
        y1={b.y1}
        x2={b.x2}
        y2={b.y2}
        onChange={(next) => onChange({ kind: "bezier", ...next })}
      />
      <div className="mt-1.5 flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <NumberField label="x1" value={b.x1} step={0.01} min={0} max={1} onChange={(v) => write({ x1: v })} />
        </div>
        <div className="min-w-0 flex-1">
          <NumberField label="y1" value={b.y1} step={0.01} onChange={(v) => write({ y1: v })} />
        </div>
        <div className="min-w-0 flex-1">
          <NumberField label="x2" value={b.x2} step={0.01} min={0} max={1} onChange={(v) => write({ x2: v })} />
        </div>
        <div className="min-w-0 flex-1">
          <NumberField label="y2" value={b.y2} step={0.01} onChange={(v) => write({ y2: v })} />
        </div>
      </div>
    </>
  );
}

type Handle = 1 | 2;

/**
 * The curve, and the two handles that shape it.
 *
 * The ends are the segment itself — it starts where it starts and arrives where it
 * arrives — so only the two control points move. They are free above and below the
 * box, which is the whole of how a curve overshoots its destination and comes back.
 */
function BezierGraph({
  x1,
  y1,
  x2,
  y2,
  onChange,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  onChange: (next: { x1: number; y1: number; x2: number; y2: number }) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [held, setHeld] = useState<Handle | null>(null);

  const path = useMemo(() => {
    const points: string[] = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const x = i / CURVE_STEPS;
      points.push(`${gx(x).toFixed(2)},${gy(easeValue({ kind: "bezier", x1, y1, x2, y2 }, x)).toFixed(2)}`);
    }
    return points.join(" ");
  }, [x1, y1, x2, y2]);

  /** Where a pointer is, in the graph's own units. The rendered box can be scaled by
   *  the panel, so the reading goes through the element's measured size. */
  const at = (e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width < 1 || box.height < 1) return null;
    const px = ((e.clientX - box.left) / box.width) * GRAPH_W;
    const py = ((e.clientY - box.top) / box.height) * GRAPH_H;
    return { x: clamp(ungx(px), 0, 1), y: ungy(py) };
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!held) return;
    const p = at(e);
    if (!p) return;
    onChange(held === 1 ? { x1: p.x, y1: p.y, x2, y2 } : { x1, y1, x2: p.x, y2: p.y });
  };

  const end = (e: ReactPointerEvent<SVGSVGElement>) => {
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
    const cy = clamp(gy(hy), 6, GRAPH_H - 6);
    const anchorX = n === 1 ? gx(0) : gx(1);
    const anchorY = n === 1 ? gy(0) : gy(1);
    return (
      <g key={n}>
        <line x1={anchorX} y1={anchorY} x2={cx} y2={cy} stroke="#6b7280" strokeWidth="1" />
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
            svgRef.current?.setPointerCapture(e.pointerId);
          }}
        />
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
      className="mt-1.5 w-full touch-none overflow-hidden rounded-md bg-[#1b1b1f]"
      style={{ aspectRatio: `${GRAPH_W} / ${GRAPH_H}` }}
      aria-label="easing curve"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {/* The 0–1 square the curve is read against, so a handle past it reads as past
          something rather than as floating. */}
      <rect
        x={gx(0)}
        y={gy(1)}
        width={gx(1) - gx(0)}
        height={gy(0) - gy(1)}
        fill="none"
        stroke="#33343c"
        strokeWidth="1"
      />
      <line x1={gx(0)} y1={gy(0)} x2={gx(1)} y2={gy(1)} stroke="#33343c" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={path} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx={gx(0)} cy={gy(0)} r="3" fill="#6b7280" />
      <circle cx={gx(1)} cy={gy(1)} r="3" fill="#6b7280" />
      {handle(1, x1, y1)}
      {handle(2, x2, y2)}
    </svg>
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
      const t = i / PREVIEW_SAMPLES;
      out.push(easeValue({ kind: "spring", ...spring }, t).toFixed(4));
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

      <div className="relative mt-2 h-[26px] overflow-hidden rounded-md bg-[#f5f5f5]" aria-hidden="true">
        <span
          className="absolute top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-[#0d99ff] animate-[spring-dot_1.4s_infinite]"
          style={{ animationTimingFunction: timing, animationDuration: `${PREVIEW_SECONDS}s` }}
        />
      </div>
    </>
  );
}

/**
 * The compact easing picker, for the places that edit one keyframe at a time: the
 * keyframe log and the module stop list.
 *
 * The presets are the vocabulary here — a curve shaped on the graph shows up as
 * `custom` and is left alone rather than being rounded to the nearest chip. Shaping
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
  const chip = chipOf(ease) ?? "custom";
  const offMenu = chip === "custom" || chip === "spring";
  return (
    <select
      className={`h-[26px] rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none ${className}`}
      aria-label="easing"
      title={title ?? "easing into this keyframe"}
      value={chip}
      onChange={(e) => {
        const name = e.target.value;
        if (name === "spring") onChange({ ...DEFAULT_SPRING });
        else if (name !== "custom") onChange({ ...PRESETS[name as PresetName] });
      }}
    >
      {PRESET_NAMES.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value="spring">spring</option>
      {/* Only there to have something to show while a shaped curve is in force. */}
      {offMenu && chip === "custom" ? <option value="custom">custom</option> : null}
    </select>
  );
}
