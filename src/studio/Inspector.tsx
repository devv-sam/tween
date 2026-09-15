import { useEffect, useState, type ReactNode } from "react";
import type { Driver, ModuleData, Track, Transform } from "../core/types";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import { clamp } from "../core/math";
import { renderState } from "../core/renderState";
import { useStudio } from "./store";
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
  PROP_TEXT,
  baseValue,
  hasKeyframes,
  keyframesFor,
  moduleLabel,
  moduleProp,
  moduleStops,
  patchStop,
  positionSets,
  removeStop,
  SAME_STOP,
  secondsToT,
  stopAtTime,
  stopSeconds,
  type KeyProp,
  type KeyTarget,
  type Range,
} from "./modules";
import {
  entryId,
  formatSeconds,
  formatValue,
  indexAfterMove,
  keyframeLog,
  type LogEntry,
  type LogValue,
} from "./keyframeLog";

/** Muted chrome shared by every control in the panel, kept in one place so the
 *  inspector reads as one surface rather than a pile of inputs. */
const LABEL = "text-[10px] uppercase tracking-[0.04em] text-[#888]";
/** A label for one row inside a section — quieter than the section's own, so it
 *  groups the fields under it without competing with the heading above them. */
const SUBLABEL = "text-[9px] uppercase tracking-[0.04em] text-[#b0b0b0]";
const SECTION = "border-b border-[#e0e0e0] px-3 py-3";
const INPUT =
  "min-w-0 bg-transparent text-[11px] text-[#111] tabular-nums outline-none placeholder:text-[#c0c0c0]";
const BOX =
  "flex items-center gap-1.5 rounded-md border border-[#e0e0e0] px-2 h-[26px] focus-within:border-[#0d99ff]";
const GHOST_BTN =
  "rounded-md border border-[#e0e0e0] px-2 h-[26px] text-[11px] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111]";

/**
 * Always in the layout at a fixed width, so selecting an element changes what this
 * panel says and never how wide the frame is. One content slot, two occupants:
 * composition settings, and the element inspector with the module inspector nested
 * inside it. Naming is the timeline's job — an element is renamed on the track that
 * already carries its name.
 */
export function Inspector() {
  const composition = useStudio((s) => s.composition);
  const selectedId = useStudio((s) => s.selectedId);
  const track = composition.tracks.find((tr) => tr.layer.id === selectedId) ?? null;

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-l border-[#e0e0e0] bg-white"
      aria-label="inspector"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The composition is always there to edit, so it stays put and the element's
            own panel stacks under it rather than replacing it. */}
        <CompositionPanel />
        {track ? <ElementPanel track={track} /> : null}
      </div>
    </aside>
  );
}

/**
 * The composition's own settings, kept compact so an element's panel has room under
 * them.
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
      <p className={`${LABEL} mb-2`}>composition</p>
      {/* The right column carries the widest values — a resolution, a hex — so it
          takes the room the left one does not need. */}
      <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-1.5">
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
      <span className={`${LABEL} shrink-0`}>{label}</span>
      {/* The select is free to shrink: a native control sizes itself to its widest
          option, which walks the chevron straight out of the box. */}
      <select
        className="min-w-0 flex-1 bg-transparent text-right text-[11px] text-[#111] outline-none"
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

function ElementPanel({ track }: { track: Track }) {
  const selectedPart = useStudio((s) => s.selectedPart);
  const { layer, modules } = track;
  const activeModule =
    selectedPart?.kind === "module" && selectedPart.index < modules.length
      ? selectedPart.index
      : null;
  const activeKeyframes =
    selectedPart?.kind === "keyframes" && hasKeyframes(track, selectedPart.property)
      ? selectedPart.property
      : null;
  const authored = PROPS.filter((p) => keyframesFor(track, p));

  return (
    <>
      <BaseTransform track={track} activeKeyframes={activeKeyframes} />

      {/* Keyed on the element: the log's collapse and selection describe the rows on
          screen, so they start fresh when a different element puts different rows
          there. */}
      <KeyframeLog key={layer.id} track={track} />

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
  activeKeyframes: KeyTarget | null;
}) {
  const { id, base, separatePosition } = track.layer;
  const separate = Boolean(separatePosition);
  const set = (patch: Partial<Transform>) => useStudio.getState().setLayerBase(id, patch);

  // One scale field for two axes: it drives scaleX and carries scaleY along at the
  // ratio a non-uniform resize left behind.
  const ratio = base.scaleX === 0 ? 1 : base.scaleY / base.scaleX;

  const cell = (target: KeyTarget, field: ReactNode) => (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="min-w-0 flex-1">{field}</div>
      <KeyframeButton
        layerId={id}
        target={target}
        keyframed={hasKeyframes(track, target)}
        selected={activeKeyframes === target}
      />
    </div>
  );

  const x = (join?: Join) => (
    <NumberField label="x" value={base.x} onChange={(v) => set({ x: v })} join={join} />
  );
  const y = (join?: Join) => (
    <NumberField label="y" value={base.y} onChange={(v) => set({ y: v })} join={join} />
  );

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>transform</p>
      {/* Position is one property with two fields: one diamond keyframes the pair,
          and the toggle beside it is how you ask for the axes apart. Two fields on
          one row want saying what they are together. */}
      <p className={`${SUBLABEL} mb-1`}>position</p>
      <div className="mb-2 flex items-center gap-1.5">
        {separate ? (
          <>
            {cell("x", x())}
            {cell("y", y())}
          </>
        ) : (
          <>
            {/* One property, so one control: the two halves share an edge rather
                than sitting apart like the properties below them do. */}
            <div className="flex min-w-0 flex-1">
              <div className="min-w-0 flex-1">{x("left")}</div>
              <div className="min-w-0 flex-1">{y("right")}</div>
            </div>
            <KeyframeButton
              layerId={id}
              target="position"
              keyframed={hasKeyframes(track, "position")}
              selected={activeKeyframes === "position"}
            />
          </>
        )}
        <SeparateButton layerId={id} separate={separate} />
      </div>
      <div className="grid grid-cols-2 gap-x-1.5 gap-y-1">
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
  target,
  keyframed,
  selected,
}: {
  layerId: string;
  target: KeyTarget;
  keyframed: boolean;
  selected: boolean;
}) {
  const label = keyframed ? "edit keyframes" : "add keyframe";
  return (
    <button
      type="button"
      aria-label={`${label}: ${target}`}
      aria-pressed={selected}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        selected ? "bg-[#e8f4ff]" : "hover:bg-[#f5f5f5]"
      } ${keyframed ? PROP_TEXT[target] : "text-[#c0c0c0] hover:text-[#555]"}`}
      onClick={() => {
        const store = useStudio.getState();
        if (!keyframed) return store.addKeyframes(layerId, target);
        store.selectPart(layerId, selected ? null : { kind: "keyframes", property: target });
      }}
    >
      <DiamondIcon filled={keyframed} />
    </button>
  );
}

/** Pressed, x and y are two properties with two sets of keyframes; released, they are
 *  one. The keyframes survive the trip either way. */
function SeparateButton({ layerId, separate }: { layerId: string; separate: boolean }) {
  return (
    <button
      type="button"
      aria-label="separate dimensions"
      aria-pressed={separate}
      title="separate dimensions"
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        separate
          ? "bg-[#e8f4ff] text-[#0d99ff]"
          : "text-[#c0c0c0] hover:bg-[#f5f5f5] hover:text-[#555]"
      }`}
      onClick={() => useStudio.getState().setSeparatePosition(layerId, !separate)}
    >
      <SeparatorVerticalIcon />
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
        axes={[{ prop, stops }]}
        range={md.range}
        onChange={(next) => params({ stops: next[0] })}
      />
    </section>
  );
}

/**
 * Time, value, easing, one row per stop. Time is read in the same seconds the ruler
 * is labelled with, so a stop and the tick it sits under say the same number.
 */
/** One property inside a stop list. Two of them means a combined position, whose
 *  axes share every stop time and differ only in value. */
type Axis = { prop: KeyProp; stops: Stop[] };

function StopList({
  layerId,
  axes,
  range,
  onChange,
}: {
  layerId: string;
  axes: Axis[];
  range: Range;
  onChange: (stops: Stop[][]) => void;
}) {
  const duration = useStudio((s) => s.composition.duration);
  // Times, easings, and the count are shared, so the first axis speaks for the row.
  const stops = axes[0].stops;
  /** The same edit on every axis — what keeps them in lockstep. */
  const all = (fn: (axis: Axis) => Stop[]) => onChange(axes.map(fn));

  /** At the playhead, each axis holding whatever it reads there right now. */
  const addAtPlayhead = () => {
    const { composition, t } = useStudio.getState();
    const item = renderState(composition, t).find((it) => it.id === layerId);
    const at = clamp(secondsToT(t * duration, range, duration), 0, 1);
    all((axis) => {
      const v = item
        ? baseValue(item.state, axis.prop)
        : axis.stops[axis.stops.length - 1].v;
      return stopAtTime(axis.stops, at, v);
    });
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
        {stops.map((stop, i) => {
          // One axis fits beside the time; two need a line of their own, so the row
          // wraps rather than squeezing four controls into 236px.
          const values = axes.map((axis) => (
            <div key={axis.prop} className="min-w-0 flex-1">
              <NumberField
                label={axes.length > 1 ? axis.prop : "v"}
                title={`${axis.prop} value`}
                value={axis.stops[i].v}
                step={PROP_STEP[axis.prop]}
                onChange={(v) =>
                  onChange(
                    axes.map((other, k) =>
                      k === axes.indexOf(axis)
                        ? patchStop(other.stops, i, { v })
                        : other.stops,
                    ),
                  )
                }
              />
            </div>
          ));
          return (
            <li key={i} className="flex flex-wrap items-center gap-1">
              <div className="w-[68px] shrink-0">
                <NumberField
                  label="s"
                  title="time in seconds"
                  value={stopSeconds(stop.t, range, duration)}
                  step={0.1}
                  min={0}
                  onChange={(v) =>
                    all((axis) =>
                      patchStop(axis.stops, i, { t: secondsToT(v, range, duration) }),
                    )
                  }
                />
              </div>
              {axes.length === 1 ? values : null}
              <select
                className="h-[26px] w-[74px] shrink-0 rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none"
                aria-label="easing"
                value={stop.ease ?? "linear"}
                onChange={(e) =>
                  all((axis) =>
                    patchStop(axis.stops, i, { ease: e.target.value as Easing }),
                  )
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
                disabled={stops.length <= 1}
                className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-[#888] hover:bg-[#f0f0f0] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent"
                onClick={() => all((axis) => removeStop(axis.stops, i))}
              >
                <DiamondMinusIcon />
              </button>
              {axes.length > 1 ? (
                <div className="flex w-full items-center gap-1">{values}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Every keyframe on the element, in one chronological record.
 *
 * One log rather than a panel per property: motion is authored across properties at
 * the same moments, and reading it back means reading what happened when, not
 * spreadsheet after spreadsheet of the same five columns. Groups are how a property
 * is found inside that record; they are not separate lists.
 */
function KeyframeLog({ track }: { track: Track }) {
  const duration = useStudio((s) => s.composition.duration);
  // What the timeline has picked. A block there and a row here both mean "this is the
  // property I am working on", so the log answers to either.
  const selectedPart = useStudio((s) => s.selectedPart);
  const layerId = track.layer.id;
  const groups = keyframeLog(track, duration);

  // All three describe the rows on screen rather than the document, so none of them
  // is recorded, saved, or undone.
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [naming, setNaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const stopsOf = (property: KeyTarget): Stop[] => {
    const position = property === "position" ? positionSets(track) : null;
    return position ? position.x.stops : (track.keyframes?.[property]?.stops ?? []);
  };
  const rangeOf = (property: KeyTarget): Range => {
    const position = property === "position" ? positionSets(track) : null;
    return position ? position.x.range : (track.keyframes?.[property]?.range ?? [0, 1]);
  };

  /** One edit reaching both axes of a position, or the single set behind any other
   *  property — the two writers the store already has, chosen by the property. */
  const writeStops = (property: KeyTarget, fn: (stops: Stop[], axis: "x" | "y") => Stop[]) => {
    const store = useStudio.getState();
    const position = property === "position" ? positionSets(track) : null;
    if (position) {
      store.setPositionStops(layerId, {
        x: fn(position.x.stops, "x"),
        y: fn(position.y.stops, "y"),
      });
      return;
    }
    const set = track.keyframes?.[property];
    if (set) store.setKeyframeStops(layerId, property as KeyProp, fn(set.stops, "x"));
  };

  /**
   * Moving a keyframe in time re-sorts its set, which renumbers the rows around it.
   * The selection is a place in that list, so it moves with the row rather than
   * jumping to whoever took the old slot.
   */
  const followMove = (property: KeyTarget, from: number, to: number) => {
    if (from === to) return;
    setSelected((ids) =>
      ids.map((id) => {
        if (!id.startsWith(`${property}:`)) return id;
        const i = Number(id.slice(property.length + 1));
        if (i === from) return entryId(property, to);
        if (from < to && i > from && i <= to) return entryId(property, i - 1);
        if (to < from && i >= to && i < from) return entryId(property, i + 1);
        return id;
      }),
    );
  };

  const setEntryTime = (entry: LogEntry, seconds: number) => {
    const t = secondsToT(seconds, rangeOf(entry.property), duration);
    writeStops(entry.property, (stops) => patchStop(stops, entry.index, { t }));
    followMove(entry.property, entry.index, indexAfterMove(stopsOf(entry.property), entry.index, t));
  };

  /** A value on one side of the arrow: `to` is the stop itself, `from` is the stop
   *  before it, which is where the property was coming from. */
  const setEntryValue = (entry: LogEntry, side: "from" | "to", axis: "x" | "y", v: number) => {
    const index = side === "to" ? entry.index : entry.index - 1;
    if (index < 0) return;
    writeStops(entry.property, (stops, which) =>
      which === axis ? patchStop(stops, index, { v }) : stops,
    );
  };

  const removeEntry = (entry: LogEntry) => {
    writeStops(entry.property, (stops) => removeStop(stops, entry.index));
    setSelected((ids) => ids.filter((id) => id !== entry.id));
  };

  /**
   * Which property a new keyframe lands on.
   *
   * Whatever the studio is pointed at says what is being worked on: a row selected in
   * the log first, then a block picked on the timeline, and failing both the top of
   * the log. Never a property the element does not already animate — this button adds
   * a keyframe to motion that is already there. Starting a new kind of motion is what
   * the diamonds beside the transform fields are for, and it should take saying so.
   */
  const addTarget: KeyTarget | null = (() => {
    if (selected.length === 1) {
      const row = groups.find((g) => g.entries.some((e) => e.id === selected[0]));
      if (row) return row.property;
    }
    if (
      selectedPart?.kind === "keyframes" &&
      groups.some((g) => g.property === selectedPart.property)
    )
      return selectedPart.property;
    return groups[0]?.property ?? null;
  })();

  /**
   * A keyframe where the playhead is, holding what the property reads there — so it
   * changes nothing until it is edited, and lands under the time you are already
   * looking at.
   */
  const addAtPlayhead = () => {
    if (!addTarget) return;
    const store = useStudio.getState();
    const { duration: span } = store.composition;
    const current = store.composition.tracks.find((tr) => tr.layer.id === layerId);
    if (!current) return;

    const item = renderState(store.composition, store.t).find((it) => it.id === layerId);
    const last = (stops: Stop[]) => stops[stops.length - 1].v;
    /** Where the new row ends up once its set is back in time order. */
    const focus = (target: KeyTarget, stops: Stop[], at: number) => {
      const index = stops.findIndex((st) => Math.abs(st.t - at) < SAME_STOP);
      setCollapsed((ids) => ids.filter((id) => id !== target));
      setSelected(index < 0 ? [] : [entryId(target, index)]);
    };

    // Position writes both axes at one time, so its two stops stay one row.
    const position = addTarget === "position" ? positionSets(current) : null;
    if (position) {
      const at = clamp(secondsToT(store.t * span, position.x.range, span), 0, 1);
      const x = stopAtTime(position.x.stops, at, item ? item.state.x : last(position.x.stops));
      const y = stopAtTime(position.y.stops, at, item ? item.state.y : last(position.y.stops));
      store.setPositionStops(layerId, { x, y });
      focus(addTarget, x, at);
      return;
    }

    const set = current.keyframes?.[addTarget];
    if (!set) return;
    const at = clamp(secondsToT(store.t * span, set.range, span), 0, 1);
    const v = item ? baseValue(item.state, addTarget as KeyProp) : last(set.stops);
    const stops = stopAtTime(set.stops, at, v);
    store.setKeyframeStops(layerId, addTarget as KeyProp, stops);
    focus(addTarget, stops, at);
  };

  const saveModule = (name: string) => {
    // The library that would hold this does not exist yet, so the bundle is named and
    // acknowledged and the keyframes stay where they are.
    console.log("module saved (coming soon)", { name, layerId, entries: selected });
    setToast("module saved (coming soon)");
    setNaming(false);
    setSelected([]);
  };

  const anyOpen = groups.some((g) => !collapsed.includes(g.property));

  return (
    <section className={SECTION}>
      <div className="flex items-center gap-1">
        <p className={LABEL}>keyframes</p>
        <div className="ml-auto flex items-center gap-0.5">
          {groups.length > 0 ? (
            selected.length >= 2 ? (
              <button
                type="button"
                aria-label="save selection as module"
                title="save selection as module"
                aria-pressed={naming}
                className={`grid h-[20px] w-[20px] place-items-center rounded ${
                  naming ? "bg-[#e8f4ff] text-[#0d99ff]" : "text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
                }`}
                onClick={() => setNaming((open) => !open)}
              >
                +
              </button>
            ) : (
              <button
                type="button"
                aria-label={`add ${addTarget} keyframe at playhead`}
                title={`add ${addTarget} keyframe at playhead`}
                className="grid h-[20px] w-[20px] place-items-center rounded text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
                onClick={addAtPlayhead}
              >
                <DiamondPlusIcon />
              </button>
            )
          ) : null}
          {groups.length > 0 ? (
            <button
              type="button"
              aria-label={anyOpen ? "collapse all groups" : "expand all groups"}
              title={anyOpen ? "collapse all" : "expand all"}
              className="grid h-[20px] w-[20px] place-items-center rounded text-[#888] hover:bg-[#f0f0f0] hover:text-[#111]"
              onClick={() => setCollapsed(anyOpen ? groups.map((g) => g.property) : [])}
            >
              <ListCollapseIcon />
            </button>
          ) : null}
        </div>
      </div>

      {naming && selected.length >= 2 ? (
        <ModuleNameField onConfirm={saveModule} onCancel={() => setNaming(false)} />
      ) : null}

      {groups.length === 0 ? (
        <p className="mt-2 text-[11px] text-[#b0b0b0]">no keyframes yet</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-0.5">
          {groups.map((group) => {
            const open = !collapsed.includes(group.property);
            return (
              <li key={group.property}>
                <button
                  type="button"
                  aria-expanded={open}
                  className="flex h-[22px] w-full items-center gap-1.5 rounded px-1 text-left hover:bg-[#f5f5f5]"
                  onClick={() =>
                    setCollapsed((ids) =>
                      open ? [...ids, group.property] : ids.filter((id) => id !== group.property),
                    )
                  }
                >
                  <span className={`shrink-0 ${open ? "text-[#555]" : "text-[#b0b0b0]"}`}>
                    <ListCollapseIcon />
                  </span>
                  <span className={LABEL}>{group.property}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-[#b0b0b0]">
                    {group.entries.length}
                  </span>
                </button>
                {open ? (
                  <ul className="flex flex-col">
                    {group.entries.map((entry) => (
                      <LogRow
                        key={entry.id}
                        entry={entry}
                        selected={selected.includes(entry.id)}
                        removable={stopsOf(entry.property).length > 1}
                        onToggle={() => {
                          // Changing what is selected changes what a bundle would
                          // hold, so a half-typed name for the old one goes away.
                          setNaming(false);
                          setSelected((ids) =>
                            ids.includes(entry.id)
                              ? ids.filter((id) => id !== entry.id)
                              : [...ids, entry.id],
                          );
                        }}
                        onTime={(seconds) => setEntryTime(entry, seconds)}
                        onValue={(side, axis, v) => setEntryValue(entry, side, axis, v)}
                        onRemove={() => removeEntry(entry)}
                      />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {toast ? (
        <p role="status" className="mt-2 rounded bg-[#f5f5f5] px-2 py-1 text-[10px] text-[#555]">
          {toast}
        </p>
      ) : null}
    </section>
  );
}

/** Name the bundle, or leave it be. Inline rather than a dialog: the selection it
 *  describes is right underneath and stays visible while it is named. */
function ModuleNameField({
  onConfirm,
  onCancel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className={`${BOX} mt-2`}>
      <input
        autoFocus
        className={`${INPUT} w-full`}
        placeholder="name this module"
        aria-label="name this module"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <span className="shrink-0 text-[10px] text-[#b0b0b0]">↵</span>
    </div>
  );
}

/**
 * One keyframe: what it set, and when. The diamond is the same shape the property
 * buttons and the track blocks use, so a keyframe looks like a keyframe wherever it
 * turns up — filled here means this row is part of the current selection.
 */
function LogRow({
  entry,
  selected,
  removable,
  onToggle,
  onTime,
  onValue,
  onRemove,
}: {
  entry: LogEntry;
  selected: boolean;
  removable: boolean;
  onToggle: () => void;
  onTime: (seconds: number) => void;
  onValue: (side: "from" | "to", axis: "x" | "y", v: number) => void;
  onRemove: () => void;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const axes: ("x" | "y")[] = typeof entry.to === "number" ? ["x"] : ["x", "y"];
  const at = (v: LogValue, axis: "x" | "y") => (typeof v === "number" ? v : v[axis]);

  return (
    <li>
      <div
        className={`flex h-[24px] items-center gap-1.5 rounded px-1 ${
          selected ? "bg-[#e8f4ff]" : "hover:bg-[#f5f5f5]"
        }`}
      >
        <button
          type="button"
          aria-label={`select ${entry.property} keyframe at ${formatSeconds(entry.t)}`}
          aria-pressed={selected}
          className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded ${
            selected ? PROP_TEXT[entry.property] : "text-[#c0c0c0] hover:text-[#555]"
          }`}
          onClick={onToggle}
        >
          <DiamondIcon filled={selected} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-[#111]">
          {formatValue(entry.property, entry.to)}
        </span>
        {editingTime ? (
          <div className="w-[62px] shrink-0">
            <NumberField
              label="s"
              title="time in seconds"
              value={entry.t}
              step={0.1}
              min={0}
              autoFocus
              onChange={onTime}
              onDone={() => setEditingTime(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            title="edit time"
            className="shrink-0 rounded px-1 text-[10px] tabular-nums text-[#b0b0b0] hover:bg-[#f0f0f0] hover:text-[#555]"
            onClick={() => setEditingTime(true)}
          >
            {formatSeconds(entry.t)}
          </button>
        )}
      </div>

      {/* Fine-tuning belongs under the row it is tuning, not in a panel somewhere
          else that has to say which keyframe it means. */}
      {selected ? (
        <div className="mb-1 flex flex-col gap-1 rounded bg-[#fbfbfb] px-1 py-1.5">
          {axes.map((axis) => (
            <div key={axis} className="flex items-center gap-1">
              {axes.length > 1 ? (
                <span className={`${SUBLABEL} w-[8px] shrink-0`}>{axis}</span>
              ) : null}
              <div className="min-w-0 flex-1">
                <NumberField
                  label="from"
                  title={`value before this keyframe${axes.length > 1 ? ` (${axis})` : ""}`}
                  value={at(entry.from, axis)}
                  step={PROP_STEP[entry.property]}
                  // Nothing precedes the first keyframe — the curve holds this value
                  // up to it, so there is no earlier one to edit.
                  disabled={entry.index === 0}
                  onChange={(v) => onValue("from", axis, v)}
                />
              </div>
              <span className="shrink-0 text-[10px] text-[#b0b0b0]">→</span>
              <div className="min-w-0 flex-1">
                <NumberField
                  label="to"
                  title={`value at this keyframe${axes.length > 1 ? ` (${axis})` : ""}`}
                  value={at(entry.to, axis)}
                  step={PROP_STEP[entry.property]}
                  onChange={(v) => onValue("to", axis, v)}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            aria-label="remove keyframe"
            title="remove keyframe"
            disabled={!removable}
            className="self-end rounded px-1 text-[10px] text-[#888] hover:bg-[#f0f0f0] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent"
            onClick={onRemove}
          >
            remove
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Which side of a joined pair a field is, when two of them make one control. */
type Join = "left" | "right";

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
  join,
  disabled,
  autoFocus,
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

  return (
    <label
      className={`${BOX} ${joined} relative focus-within:z-10 ${
        disabled ? "opacity-60" : ""
      }`}
      title={title ?? label}
    >
      <span className={`${LABEL} shrink-0`}>{label}</span>
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

/** Lucide `separator-vertical` — the axes pulled apart from a single line. */
function SeparatorVerticalIcon() {
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
      <path d="M12 3v18" />
      <path d="m16 16 4-4-4-4" />
      <path d="m8 8-4 4 4 4" />
    </svg>
  );
}

/** Lucide `list-collapse` — a list folding into itself, which is what the toggle
 *  beside a group does to its rows. */
function ListCollapseIcon() {
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
      <path d="m3 10 2.5-2.5L3 5" />
      <path d="m3 19 2.5-2.5L3 14" />
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
    </svg>
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
