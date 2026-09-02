import { useEffect, useRef, useState } from "react";
import type { Driver, ModuleData, Track, Transform } from "../core/types";
import type { Easing } from "../core/easing";
import { clamp } from "../core/math";
import { useStudio, type ImageAsset } from "./store";
import {
  DRIVERS,
  FPS_CHOICES,
  RESOLUTIONS,
  normalizeHex,
  resolutionFor,
  resolutionKey,
} from "./composition";
import {
  EASINGS,
  PROPS,
  PROP_COLOR,
  PROP_STEP,
  addStop,
  baseValue,
  layerName,
  moduleLabel,
  moduleProp,
  moduleStops,
  patchStop,
  removeStop,
  type KeyProp,
} from "./modules";

/** Muted chrome shared by every control in the panel, kept in one place so the
 *  inspector reads as one surface rather than a pile of inputs. */
const LABEL = "text-[10px] uppercase tracking-[0.04em] text-[#888]";
const SECTION = "border-b border-[#e0e0e0] px-3 py-3";
const INPUT =
  "min-w-0 bg-transparent text-[11px] text-[#111] tabular-nums outline-none placeholder:text-[#c0c0c0]";
const BOX =
  "flex items-center gap-1.5 rounded-md border border-[#e0e0e0] px-2 h-[26px] focus-within:border-[#0d99ff]";
const GHOST_BTN =
  "rounded-md border border-[#e0e0e0] px-2 h-[26px] text-[11px] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111]";

/**
 * Always in the layout at a fixed width, so selecting an element changes what this
 * panel says and never how wide the frame is. One content slot, three possible
 * occupants: composition settings, the element inspector, and the module inspector
 * nested inside it.
 */
export function Inspector() {
  const composition = useStudio((s) => s.composition);
  const assets = useStudio((s) => s.assets);
  const selectedId = useStudio((s) => s.selectedId);

  const index = composition.tracks.findIndex((tr) => tr.layer.id === selectedId);
  const track = index < 0 ? null : composition.tracks[index];
  const assetName =
    track?.layer.source.kind === "image"
      ? assets.find((a) => a.id === track.layer.source.value)?.name
      : undefined;

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-l border-[#e0e0e0] bg-white"
      aria-label="inspector"
    >
      <header className="flex h-9 shrink-0 items-center border-b border-[#e0e0e0] px-3">
        <span className={`${LABEL} truncate`}>
          {track ? layerName(track.layer, assetName, index) : "composition"}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {track ? (
          <ElementPanel track={track} index={index} assets={assets} />
        ) : (
          <CompositionPanel />
        )}
      </div>
    </aside>
  );
}

/**
 * What the panel holds with nothing selected. The header already says "composition",
 * so the section does not repeat it.
 *
 * No duration field: length is not a setting to fill in before you can animate. It
 * follows from the work, and the ruler's end handle is there when you want to say
 * otherwise.
 */
function CompositionPanel() {
  const { fps, driver, background } = useStudio((s) => s.composition);
  const frame = useStudio((s) => s.frame);

  return (
    <section className={SECTION}>
      <div className="flex flex-col gap-1.5">
        <SelectField
          label="fps"
          value={String(fps)}
          onChange={(v) => useStudio.getState().setFps(Number(v))}
          options={FPS_CHOICES.map((f) => ({ value: String(f), label: String(f) }))}
        />

        <SelectField
          label="resolution"
          value={resolutionKey(frame)}
          onChange={(v) => {
            const size = resolutionFor(v);
            if (size) useStudio.getState().setResolution(size);
          }}
          options={RESOLUTIONS.map((r) => ({ value: resolutionKey(r.size), label: r.label }))}
        />

        <BackgroundField value={background ?? "#ffffff"} />

        <div className={`${BOX} justify-between`}>
          <span className={LABEL}>driver</span>
          <DriverToggle value={driver.kind} />
        </div>
      </div>
    </section>
  );
}

/**
 * Swatch and hex, one value. The swatch is the native picker; the text field takes a
 * typed colour and only commits once it is a whole one, so a half-typed `#ab` does
 * not repaint the frame.
 */
function BackgroundField({ value }: { value: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (hex: string) => useStudio.getState().setBackground(hex);

  return (
    <div className={BOX}>
      <span className={`${LABEL} shrink-0`}>background</span>
      <input
        type="color"
        aria-label="background colour"
        className="ml-auto h-[16px] w-[22px] shrink-0 cursor-pointer rounded-[3px] border border-[#e0e0e0] bg-transparent p-0"
        value={value}
        onChange={(e) => {
          setDraft(null);
          set(e.target.value);
        }}
      />
      <input
        className={`${INPUT} w-[64px] shrink-0 text-right uppercase`}
        aria-label="background hex"
        spellCheck={false}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) set(hex);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

/** Two segments, one value. `input` is declared here before anything evaluates it. */
function DriverToggle({ value }: { value: Driver["kind"] }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[#e0e0e0]">
      {DRIVERS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          className={`px-2 py-0.5 text-[10px] ${
            value === kind
              ? "bg-[#e8f4ff] text-[#0d99ff]"
              : "text-[#888] hover:bg-[#f5f5f5] hover:text-[#111]"
          }`}
          onClick={() => useStudio.getState().setDriver(kind)}
        >
          {kind}
        </button>
      ))}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={`${BOX} justify-between`}>
      <span className={LABEL}>{label}</span>
      <select
        className="bg-transparent text-[11px] text-[#111] outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ElementPanel({
  track,
  index,
  assets,
}: {
  track: Track;
  index: number;
  assets: ImageAsset[];
}) {
  const selectedModule = useStudio((s) => s.selectedModule);
  const { layer, modules } = track;
  const asset =
    layer.source.kind === "image"
      ? assets.find((a) => a.id === layer.source.value)
      : undefined;
  const active =
    selectedModule !== null && selectedModule < modules.length ? selectedModule : null;

  return (
    <>
      <section className={SECTION}>
        <div className={BOX}>
          <input
            className={`${INPUT} w-full`}
            value={layer.name ?? ""}
            placeholder={layerName({ ...layer, name: undefined }, asset?.name, index)}
            aria-label="element name"
            onChange={(e) => useStudio.getState().renameLayer(layer.id, e.target.value)}
          />
        </div>
      </section>

      <BaseTransform layerId={layer.id} base={layer.base} />

      <section className={SECTION}>
        <p className={`${LABEL} mb-2`}>modules</p>
        {modules.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-[#b0b0b0]">
            No modules yet. Add one to animate this element.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {modules.map((md, i) => (
              <ModuleRow
                key={i}
                module={md}
                index={i}
                layerId={layer.id}
                selected={i === active}
              />
            ))}
          </ul>
        )}
        <AddModule layerId={layer.id} />
      </section>

      {active !== null ? (
        <KeyframeInspector layerId={layer.id} index={active} module={modules[active]} />
      ) : null}
    </>
  );
}

/** The element's own transform, before any module runs. */
function BaseTransform({ layerId, base }: { layerId: string; base: Transform }) {
  const set = (patch: Partial<Transform>) =>
    useStudio.getState().setLayerBase(layerId, patch);

  // One scale field for two axes: it drives scaleX and carries scaleY along at the
  // ratio a non-uniform resize left behind.
  const ratio = base.scaleX === 0 ? 1 : base.scaleY / base.scaleX;

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>transform</p>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="x" value={base.x} onChange={(v) => set({ x: v })} />
        <NumberField label="y" value={base.y} onChange={(v) => set({ y: v })} />
        <NumberField
          label="s"
          title="scale"
          value={base.scaleX}
          step={0.05}
          min={0}
          onChange={(v) => set({ scaleX: v, scaleY: v * ratio })}
        />
        <NumberField
          label="r"
          title="rotation in degrees"
          value={base.rotation}
          onChange={(v) => set({ rotation: v })}
        />
        <NumberField
          label="o"
          title="opacity"
          value={base.opacity}
          step={0.05}
          min={0}
          max={1}
          onChange={(v) => set({ opacity: v })}
        />
      </div>
    </section>
  );
}

function ModuleRow({
  module: md,
  index,
  layerId,
  selected,
}: {
  module: ModuleData;
  index: number;
  layerId: string;
  selected: boolean;
}) {
  const prop = moduleProp(md);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={selected}
        className={`flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-md border px-2 text-left text-[11px] ${
          selected
            ? "border-[#0d99ff] bg-[#e8f4ff] text-[#111]"
            : "border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]"
        }`}
        onClick={() =>
          useStudio.getState().selectModule(layerId, selected ? null : index)
        }
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] border ${PROP_COLOR[prop]}`} />
        <span className="truncate">{moduleLabel(md)}</span>
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[#999]">
          {md.type}
        </span>
      </button>
      <button
        type="button"
        aria-label={`remove ${moduleLabel(md)} module`}
        title="remove module"
        className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-[#888] hover:bg-[#f5f5f5] hover:text-[#111]"
        onClick={() => useStudio.getState().removeModule(layerId, index)}
      >
        ×
      </button>
    </li>
  );
}

function AddModule({ layerId }: { layerId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative mt-2" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        className={`${GHOST_BTN} w-full`}
        onClick={() => setOpen((v) => !v)}
      >
        add module
      </button>
      {open ? (
        // Opens upward: the button lives at the foot of a scrolling panel.
        <div className="absolute bottom-full left-0 z-10 mb-1 w-full rounded-md border border-[#e0e0e0] bg-white p-1 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <button
            type="button"
            className="w-full rounded px-2 py-1.5 text-left text-[11px] text-[#111] hover:bg-[#f5f5f5]"
            onClick={() => {
              // Seeded on the element's current x, so a fresh module animates nothing
              // until a stop is edited.
              useStudio.getState().addKeyframeModule(layerId, "x");
              setOpen(false);
            }}
          >
            keyframes
          </button>
        </div>
      ) : null}
    </div>
  );
}

function KeyframeInspector({
  layerId,
  index,
  module: md,
}: {
  layerId: string;
  index: number;
  module: ModuleData;
}) {
  const prop = moduleProp(md);
  const stops = moduleStops(md);
  const params = (patch: Record<string, unknown>) =>
    useStudio.getState().setModuleParams(layerId, index, patch);

  return (
    <section className={`${SECTION} bg-[#fbfbfb]`}>
      <p className={`${LABEL} mb-2`}>keyframes · {prop}</p>

      <label className={`${BOX} justify-between`}>
        <span className={LABEL}>property</span>
        <select
          className="bg-transparent text-[11px] text-[#111] outline-none"
          value={prop}
          onChange={(e) => {
            const next = e.target.value as KeyProp;
            const track = useStudio
              .getState()
              .composition.tracks.find((tr) => tr.layer.id === layerId);
            // Values belong to the old property, so re-seed them from the base.
            const seed = track ? baseValue(track.layer.base, next) : 0;
            params({
              property: next,
              stops: stops.map((s) => ({ ...s, v: seed })),
            });
          }}
        >
          {PROPS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex items-center justify-between">
        <p className={LABEL}>keyframes</p>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
          onClick={() => params({ stops: addStop(stops) })}
        >
          <DiamondPlusIcon />
          add keyframe
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {stops.map((stop, i) => (
          <li key={i} className="flex items-center gap-1">
            <div className="w-[62px] shrink-0">
              <NumberField
                label="%"
                title="position in the module's window"
                value={stop.t * 100}
                step={5}
                min={0}
                max={100}
                precision={0}
                onChange={(v) =>
                  params({ stops: patchStop(stops, i, { t: clamp(v / 100, 0, 1) }) })
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <NumberField
                label="v"
                title={`${prop} value`}
                value={stop.v}
                step={PROP_STEP[prop]}
                onChange={(v) => params({ stops: patchStop(stops, i, { v }) })}
              />
            </div>
            <select
              className="h-[26px] w-[74px] shrink-0 rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none"
              aria-label="easing"
              value={stop.ease ?? "linear"}
              onChange={(e) =>
                params({
                  stops: patchStop(stops, i, { ease: e.target.value as Easing }),
                })
              }
            >
              {EASINGS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="remove keyframe"
              title="remove keyframe"
              disabled={stops.length <= 2}
              className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-[#888] hover:bg-[#f0f0f0] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent"
              onClick={() => params({ stops: removeStop(stops, i) })}
            >
              <DiamondMinusIcon />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A numeric cell that writes on every valid keystroke — the frame re-evaluates from
 * the store, so there is no commit step to wait for. The draft is held only so a
 * half-typed "−" or "0." survives long enough to finish.
 */
function NumberField({
  label,
  title,
  value,
  onChange,
  step = 1,
  min,
  max,
  precision = 2,
}: {
  label: string;
  title?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
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

  return (
    <label className={BOX} title={title ?? label}>
      <span className={`${LABEL} shrink-0`}>{label}</span>
      <input
        className={`${INPUT} w-full text-right`}
        inputMode="decimal"
        value={shown}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
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

/** Lucide `diamond-plus` / `diamond-minus` — a keyframe is a diamond everywhere else
 *  in the studio, so the buttons that add and remove one carry the same shape. */
function DiamondPlusIcon() {
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

function DiamondMinusIcon() {
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
