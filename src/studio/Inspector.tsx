import { useState, type ReactNode } from "react";
import type { Driver, ModuleData, Track, Transform } from "../core/types";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import { clamp } from "../core/math";
import { renderState } from "../core/renderState";
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
  PROP_DOT,
  PROP_STEP,
  PROP_TEXT,
  baseValue,
  keyframesFor,
  layerName,
  moduleLabel,
  moduleProp,
  moduleStops,
  patchStop,
  removeStop,
  secondsToT,
  stopAtTime,
  stopSeconds,
  type KeyProp,
  type Range,
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
        {/* The composition is always there to edit, so it stays put and the element's
            own panel stacks under it rather than replacing it. */}
        <CompositionPanel labelled={Boolean(track)} />
        {track ? <ElementPanel track={track} index={index} assets={assets} /> : null}
      </div>
    </aside>
  );
}

/**
 * The composition's own settings, kept compact so an element's panel has room under
 * them. Its heading only appears once the panel header is naming an element instead
 * — with nothing selected the header already says "composition".
 *
 * No duration field: length is not a setting to fill in before you can animate. It
 * follows from the work, and the ruler's end handle is there when you want to say
 * otherwise.
 */
function CompositionPanel({ labelled }: { labelled: boolean }) {
  const { fps, driver, background } = useStudio((s) => s.composition);
  const frame = useStudio((s) => s.frame);

  return (
    <section className={SECTION}>
      {labelled ? <p className={`${LABEL} mb-2`}>composition</p> : null}
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          label="fps"
          value={String(fps)}
          onChange={(v) => useStudio.getState().setFps(Number(v))}
          options={FPS_CHOICES.map((f) => ({ value: String(f), label: String(f) }))}
        />

        <SelectField
          label="res"
          title="resolution"
          value={resolutionKey(frame)}
          onChange={(v) => {
            const size = resolutionFor(v);
            if (size) useStudio.getState().setResolution(size);
          }}
          options={RESOLUTIONS.map((r) => ({ value: resolutionKey(r.size), label: r.label }))}
        />

        <BackgroundField value={background ?? "#ffffff"} />

        <div className={`${BOX} justify-between px-1`} title="driver">
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
    <div className={BOX} title="background">
      <input
        type="color"
        aria-label="background colour"
        className="h-[16px] w-[20px] shrink-0 cursor-pointer rounded-[3px] border border-[#e0e0e0] bg-transparent p-0"
        value={value}
        onChange={(e) => {
          setDraft(null);
          set(e.target.value);
        }}
      />
      <input
        className={`${INPUT} min-w-0 flex-1 text-right uppercase`}
        aria-label="background hex"
        spellCheck={false}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) set(hex);
        }}
        onBlur={() => {
          setDraft(null);
          useStudio.getState().sealHistory();
        }}
      />
    </div>
  );
}

/** Two segments, one value. `input` is declared here before anything evaluates it. */
function DriverToggle({ value }: { value: Driver["kind"] }) {
  return (
    <div className="flex w-full overflow-hidden rounded-[5px]">
      {DRIVERS.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          className={`flex-1 py-0.5 text-[10px] ${
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
  title,
  value,
  options,
  onChange,
}: {
  label: string;
  title?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={`${BOX} justify-between`} title={title ?? label}>
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
  const selectedPart = useStudio((s) => s.selectedPart);
  const { layer, modules } = track;
  const asset =
    layer.source.kind === "image"
      ? assets.find((a) => a.id === layer.source.value)
      : undefined;
  const activeModule =
    selectedPart?.kind === "module" && selectedPart.index < modules.length
      ? selectedPart.index
      : null;
  const activeKeyframes =
    selectedPart?.kind === "keyframes" && keyframesFor(track, selectedPart.property)
      ? selectedPart.property
      : null;
  const authored = PROPS.filter((p) => keyframesFor(track, p));

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
            onBlur={() => useStudio.getState().sealHistory()}
          />
        </div>
      </section>

      <BaseTransform track={track} activeKeyframes={activeKeyframes} />

      {activeKeyframes ? (
        <StopEditor
          layerId={layer.id}
          prop={activeKeyframes}
          stops={keyframesFor(track, activeKeyframes)!.stops}
          range={keyframesFor(track, activeKeyframes)!.range}
        />
      ) : null}

      {/* Only what an element actually carries — there is no way to add a module
          until there are real module types to add. */}
      {modules.length > 0 ? (
        <section className={SECTION}>
          <p className={`${LABEL} mb-2`}>modules</p>
          <ul className="flex flex-col gap-1">
            {modules.map((md, i) => (
              <ModuleRow
                key={i}
                module={md}
                index={i}
                layerId={layer.id}
                selected={i === activeModule}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {activeModule !== null ? (
        <KeyframeInspector
          layerId={layer.id}
          index={activeModule}
          module={modules[activeModule]}
        />
      ) : null}

      {authored.length > 0 ? <SaveAsModule /> : null}
    </>
  );
}

/** Stub for the next increment: bundling authored keyframes into a named, reusable
 *  module. Disabled rather than hidden, so the path is visible before it exists. */
function SaveAsModule() {
  return (
    <section className={SECTION}>
      <button
        type="button"
        disabled
        title="coming soon — modules are reusable bundles"
        className={`${GHOST_BTN} w-full cursor-not-allowed opacity-50`}
      >
        save as module
      </button>
    </section>
  );
}

/** The element's own transform, before any module runs. */
/**
 * The element's base transform, with each field's keyframe button beside it.
 * Authoring motion belongs next to the value it animates rather than in a second
 * list of the same five properties.
 */
function BaseTransform({
  track,
  activeKeyframes,
}: {
  track: Track;
  activeKeyframes: KeyProp | null;
}) {
  const { id, base } = track.layer;
  const set = (patch: Partial<Transform>) => useStudio.getState().setLayerBase(id, patch);

  // One scale field for two axes: it drives scaleX and carries scaleY along at the
  // ratio a non-uniform resize left behind.
  const ratio = base.scaleX === 0 ? 1 : base.scaleY / base.scaleX;

  const cell = (prop: KeyProp, field: ReactNode) => (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">{field}</div>
      <KeyframeButton
        layerId={id}
        prop={prop}
        keyframed={Boolean(keyframesFor(track, prop))}
        selected={activeKeyframes === prop}
      />
    </div>
  );

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>transform</p>
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
        {cell("x", <NumberField label="x" value={base.x} onChange={(v) => set({ x: v })} />)}
        {cell("y", <NumberField label="y" value={base.y} onChange={(v) => set({ y: v })} />)}
        {cell(
          "scale",
          <NumberField
            label="s"
            title="scale"
            value={base.scaleX}
            step={0.05}
            min={0}
            onChange={(v) => set({ scaleX: v, scaleY: v * ratio })}
          />,
        )}
        {cell(
          "rotation",
          <NumberField
            label="r"
            title="rotation in degrees"
            value={base.rotation}
            onChange={(v) => set({ rotation: v })}
          />,
        )}
        {cell(
          "opacity",
          <NumberField
            label="o"
            title="opacity"
            value={base.opacity}
            step={0.05}
            min={0}
            max={1}
            onChange={(v) => set({ opacity: v })}
          />,
        )}
      </div>
    </section>
  );
}

/**
 * Hollow means this property has no motion yet and a click starts some; filled, in
 * the property's own colour, means it does and a click opens its stops.
 */
function KeyframeButton({
  layerId,
  prop,
  keyframed,
  selected,
}: {
  layerId: string;
  prop: KeyProp;
  keyframed: boolean;
  selected: boolean;
}) {
  const label = keyframed ? "edit keyframes" : "add keyframe";
  return (
    <button
      type="button"
      aria-label={`${label}: ${prop}`}
      aria-pressed={selected}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        selected ? "bg-[#e8f4ff]" : "hover:bg-[#f5f5f5]"
      } ${keyframed ? PROP_TEXT[prop] : "text-[#c0c0c0] hover:text-[#555]"}`}
      onClick={() => {
        const store = useStudio.getState();
        if (!keyframed) return store.addKeyframes(layerId, prop);
        store.selectPart(layerId, selected ? null : { kind: "keyframes", property: prop });
      }}
    >
      <DiamondIcon filled={keyframed} />
    </button>
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
          useStudio
            .getState()
            .selectPart(layerId, selected ? null : { kind: "module", index })
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

      <StopList
        layerId={layerId}
        prop={prop}
        stops={stops}
        range={md.range}
        onChange={(next) => params({ stops: next })}
      />
    </section>
  );
}

/** The element's own authored motion for one property: the same stop list a module
 *  gets, without a property picker — the property is what was clicked. */
function StopEditor({
  layerId,
  prop,
  stops,
  range,
}: {
  layerId: string;
  prop: KeyProp;
  stops: Stop[];
  range: Range;
}) {
  return (
    <section className={`${SECTION} bg-[#fbfbfb]`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PROP_DOT[prop]}`} />
        <p className={LABEL}>{prop} keyframes</p>
        <button
          type="button"
          aria-label={`remove ${prop} keyframes`}
          title="remove keyframes"
          className="ml-auto grid h-[20px] w-[20px] place-items-center rounded text-[#888] hover:bg-[#f0f0f0] hover:text-[#111]"
          onClick={() => useStudio.getState().removeKeyframes(layerId, prop)}
        >
          ×
        </button>
      </div>
      <StopList
        layerId={layerId}
        prop={prop}
        stops={stops}
        range={range}
        onChange={(next) => useStudio.getState().setKeyframeStops(layerId, prop, next)}
      />
    </section>
  );
}

/**
 * Time, value, easing, one row per stop. Time is read in the same seconds the ruler
 * is labelled with, so a stop and the tick it sits under say the same number.
 */
function StopList({
  layerId,
  prop,
  stops,
  range,
  onChange,
}: {
  layerId: string;
  prop: KeyProp;
  stops: Stop[];
  range: Range;
  onChange: (stops: Stop[]) => void;
}) {
  const duration = useStudio((s) => s.composition.duration);

  /** At the playhead, holding whatever the property reads there right now. */
  const addAtPlayhead = () => {
    const { composition, t } = useStudio.getState();
    const item = renderState(composition, t).find((it) => it.id === layerId);
    const v = item ? baseValue(item.state, prop) : stops[stops.length - 1].v;
    onChange(stopAtTime(stops, clamp(secondsToT(t * duration, range, duration), 0, 1), v));
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className={LABEL}>keyframes</p>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
          onClick={addAtPlayhead}
        >
          <DiamondPlusIcon />
          add keyframe
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {stops.map((stop, i) => (
          <li key={i} className="flex items-center gap-1">
            <div className="w-[68px] shrink-0">
              <NumberField
                label="s"
                title="time in seconds"
                value={stopSeconds(stop.t, range, duration)}
                step={0.1}
                min={0}
                onChange={(v) =>
                  onChange(patchStop(stops, i, { t: secondsToT(v, range, duration) }))
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <NumberField
                label="v"
                title={`${prop} value`}
                value={stop.v}
                step={PROP_STEP[prop]}
                onChange={(v) => onChange(patchStop(stops, i, { v }))}
              />
            </div>
            <select
              className="h-[26px] w-[74px] shrink-0 rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none"
              aria-label="easing"
              value={stop.ease ?? "linear"}
              onChange={(e) => onChange(patchStop(stops, i, { ease: e.target.value as Easing }))}
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
              onClick={() => onChange(removeStop(stops, i))}
            >
              <DiamondMinusIcon />
            </button>
          </li>
        ))}
      </ul>
    </>
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
        onBlur={() => {
          setDraft(null);
          // A run of keystrokes in one field is one undo step; leaving ends it.
          useStudio.getState().sealHistory();
        }}
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
function DiamondIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
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
