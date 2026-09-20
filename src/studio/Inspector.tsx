import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Driver, ModuleData, Track, Transform } from "../core/types";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import { clamp } from "../core/math";
import { renderState } from "../core/renderState";
import { designSizeOf, isSvg, useStudio } from "./store";
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
  fromDisplay,
  hasKeyframes,
  layerName,
  propLabel,
  moduleLabel,
  moduleProp,
  moduleStops,
  patchStop,
  positionSets,
  removeStop,
  secondsToT,
  stopAtTime,
  stopSeconds,
  toDisplay,
  type DesignSize,
  type KeyProp,
  type KeyTarget,
  type Range,
} from "./modules";
import {
  BOX,
  DiamondIcon,
  DiamondMinusIcon,
  DiamondPlusIcon,
  GHOST_BTN,
  INPUT,
  LABEL,
  LockIcon,
  LockOpenIcon,
  NumberField,
  SECTION,
  SUBLABEL,
  type Join,
} from "./fields";
import {
  entryId,
  indexAfterMove,
  keyframeLog,
  type LogEntry,
  type LogValue,
} from "./keyframeLog";

export function Inspector() {
  const composition = useStudio((s) => s.composition);
  const selectedId = useStudio((s) => s.selectedId);
  const selectedIds = useStudio((s) => s.selectedIds);
  const index = composition.tracks.findIndex((tr) => tr.layer.id === selectedId);
  const track = index < 0 ? null : composition.tracks[index];

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-l border-[#e0e0e0] bg-white"
      aria-label="inspector"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The composition is always there to edit, so it stays put and the element's
            own panel stacks under it rather than replacing it. */}
        <CompositionPanel />
        {/* One element opens its own panel; several open the little that can honestly
            be said about several at once. `selectedId` is null while more than one is
            picked, so the two are never both on screen. */}
        {track ? <ElementPanel track={track} index={index} /> : null}
        {selectedIds.length > 1 ? <SelectionPanel ids={selectedIds} /> : null}
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

function ElementPanel({ track, index }: { track: Track; index: number }) {
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

  return (
    <>
      {/* What the element is, before anything animates it. The transform below is
          what happens to it; this is the thing being happened to. */}
      <ElementSection track={track} index={index} activeKeyframes={activeKeyframes} />

      <BaseTransform track={track} activeKeyframes={activeKeyframes} />

      {/* The list of keyframes is on the timeline, under the element it belongs to.
          What is left here is the editor for whichever one is picked. */}
      <KeyframeEditor track={track} />

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

    </>
  );
}

/**
 * What can be said about several elements at once.
 *
 * The same properties one element shows, read across all of them: a field says the
 * value when they agree on it and "Mixed" when they do not, typing settles them all
 * on what was typed, and the arrows step each from wherever it already is, so a
 * spread the author built survives being nudged.
 *
 * Every row keys, and keys the same way one element's does — each element keeps its
 * own curve, because a selection is a way of authoring several at once and not a
 * thing with keyframes of its own. There is still no keyframe log here: a stop
 * belongs to one element's curve, and there is no one curve to list.
 */
function SelectionPanel({ ids }: { ids: string[] }) {
  const composition = useStudio((s) => s.composition);
  const t = useStudio((s) => s.t);
  // Re-read whenever the frame or the selection changes: what the fields report is
  // what is on the canvas, not what the base transforms happen to say.
  const read = useMemo(
    () => {
      const store = useStudio.getState();
      return {
        x: store.sharedTransform(ids, "x"),
        y: store.sharedTransform(ids, "y"),
        rotation: store.sharedTransform(ids, "rotation"),
        opacity: store.sharedOpacity(ids),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, composition, t],
  );

  const keyed = (target: KeyTarget) =>
    ids.every((id) => {
      const track = composition.tracks.find((tr) => tr.layer.id === id);
      return track ? hasKeyframes(track, target) : false;
    });

  const axis = (prop: "x" | "y", join: Join) => (
    <NumberField
      label={prop}
      title={
        read[prop] === null
          ? `these sit at different ${prop} positions — type one to settle them all on it`
          : prop
      }
      value={read[prop] ?? 0}
      mixed={read[prop] === null}
      join={join}
      onChange={(v) => useStudio.getState().setSelectionTransform(ids, prop, v)}
      onStep={(by) => useStudio.getState().nudgeSelectionTransform(ids, prop, by)}
    />
  );

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>{ids.length} elements selected</p>

      {/* Position is one property with two fields here too, and one diamond keys the
          pair. The axes are not split apart: that is a per-element choice, and the
          place to make it is the element. */}
      <p className={`${SUBLABEL} mb-1`}>position</p>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">{axis("x", "left")}</div>
          <div className="min-w-0 flex-1">{axis("y", "right")}</div>
        </div>
        <SelectionKeyButton ids={ids} target="position" keyframed={keyed("position")} />
      </div>

      <p className={`${SUBLABEL} mb-1`}>rotation</p>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberField
            label="r"
            title={
              read.rotation === null
                ? "these are turned differently — type one angle to settle them all on it"
                : "rotation in degrees"
            }
            value={read.rotation ?? 0}
            mixed={read.rotation === null}
            onChange={(v) => useStudio.getState().setSelectionTransform(ids, "rotation", v)}
            onStep={(by) =>
              useStudio.getState().nudgeSelectionTransform(ids, "rotation", by)
            }
          />
        </div>
        <SelectionKeyButton ids={ids} target="rotation" keyframed={keyed("rotation")} />
      </div>

      <p className={`${SUBLABEL} mb-1`}>opacity</p>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberField
            label="o"
            title={
              read.opacity === null
                ? "these have different opacities — type one to settle them all on it"
                : "opacity"
            }
            value={read.opacity ?? 1}
            mixed={read.opacity === null}
            step={PROP_STEP.opacity}
            min={0}
            max={1}
            onChange={(v) => useStudio.getState().setOpacity(ids, v)}
            onStep={(by) => useStudio.getState().nudgeOpacity(ids, by)}
          />
        </div>
        <SelectionKeyButton ids={ids} target="opacity" keyframed={keyed("opacity")} />
      </div>
    </section>
  );
}

/**
 * The diamond, for a whole selection. Filled once every picked element carries the
 * property, hollow while any of them still does not — and a press means the same
 * thing either way: everyone has motion on this, and everyone has a keyframe here.
 *
 * Unlike one element's, it never opens an editor. There are several curves behind it
 * and no single one to open; the stops are edited on the element, where they live.
 */
function SelectionKeyButton({
  ids,
  target,
  keyframed,
}: {
  ids: string[];
  target: KeyTarget;
  keyframed: boolean;
}) {
  const label = keyframed ? "keyframe here" : "add keyframe";
  return (
    <button
      type="button"
      aria-label={`${label}: ${target}, ${ids.length} elements`}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md hover:bg-[#f5f5f5] ${
        keyframed ? PROP_TEXT[target] : "text-[#c0c0c0] hover:text-[#555]"
      }`}
      onClick={() => useStudio.getState().keySelection(ids, target)}
    >
      <DiamondIcon filled={keyframed} />
    </button>
  );
}

/**
 * One property in the panel: its field, and the diamond that keys it. Motion is
 * authored beside the value it moves rather than in a second list of the same
 * properties, so every row that can be animated is built the same way.
 */
function KeyCell({
  layerId,
  target,
  track,
  activeKeyframes,
  children,
}: {
  layerId: string;
  target: KeyTarget;
  track: Track;
  activeKeyframes: KeyTarget | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="min-w-0 flex-1">{children}</div>
      <KeyframeButton
        layerId={layerId}
        target={target}
        keyframed={hasKeyframes(track, target)}
        selected={activeKeyframes === target}
      />
    </div>
  );
}

/**
 * The element itself: what it is called, how big it is, and how much of it shows.
 *
 * Size sits apart from the transform on purpose. Width and height are what the
 * element *is* — the thing you drew — while position and rotation are what is being
 * done to it. They were the same number until now only because the engine stores a
 * size as a scale factor, which is an implementation detail and not a unit anyone
 * thinks in. This section shows pixels, and the section below it shows motion.
 *
 * Both are keyable all the same: an element that stretches on one axis is motion the
 * old uniform scale could not express.
 */
function ElementSection({
  track,
  index,
  activeKeyframes,
}: {
  track: Track;
  index: number;
  activeKeyframes: KeyTarget | null;
}) {
  const assets = useStudio((s) => s.assets);
  const composition = useStudio((s) => s.composition);
  const t = useStudio((s) => s.t);
  const { layer } = track;
  const asset =
    layer.source.kind === "image"
      ? assets.find((a) => a.id === layer.source.value)
      : undefined;
  const size = designSizeOf(assets, layer);
  // Only an element that *is* one part of a drawing has a node to name. What is left
  // of a file after parts came off it is still that file, however much it lost.
  const part =
    asset && isSvg(asset) && asset.takenFrom !== undefined && asset.nodes.length === 1
      ? asset
      : null;
  const name = layerName(layer, asset?.name, index);

  /** What the element reads at the playhead, curves and modules included — so a field
   *  and the box on the canvas cannot disagree about how wide the thing is. */
  const state = useMemo(
    () =>
      renderState(composition, t).find((it) => it.id === layer.id)?.state ?? layer.base,
    [composition, t, layer],
  );

  const cell = (target: KeyTarget, field: ReactNode) => (
    <KeyCell
      layerId={layer.id}
      target={target}
      track={track}
      activeKeyframes={activeKeyframes}
    >
      {field}
    </KeyCell>
  );

  return (
    <section className={SECTION}>
      {/* The element's own name, so there is no doubt which one these fields belong
          to once the composition's settings are sitting right above them. The two
          centring buttons ride the same line: they act on the whole element rather
          than on any one field under it, which is what the heading names. */}
      <div className="mb-2 flex items-center gap-1">
        <p className={`${LABEL} min-w-0 flex-1 truncate`} title={name}>
          {name}
        </p>
        <CentreButton layerId={layer.id} axis="x" />
        <CentreButton layerId={layer.id} axis="y" />
      </div>

      {/* Which part of which drawing this is. Read-only: it says where this came
          from, and nothing about the drawing is edited from here. */}
      {part ? (
        <>
          <p className={`${SUBLABEL} mb-1`}>node</p>
          <div className={`${BOX} mb-2 justify-between`} title={part.name}>
            <span className="min-w-0 truncate text-[11px] text-[#555]">{part.name}</span>
          </div>
        </>
      ) : null}

      {size ? (
        <>
          <p className={`${SUBLABEL} mb-1`}>dimensions</p>
          <div className="mb-2 flex items-center gap-1.5">
            {cell("scaleX", <SizeField axis="scaleX" track={track} state={state} size={size} />)}
            {cell("scaleY", <SizeField axis="scaleY" track={track} state={state} size={size} />)}
            <LockButton layerId={layer.id} locked={Boolean(layer.lockAspect)} />
          </div>
        </>
      ) : null}

      <p className={`${SUBLABEL} mb-1`}>opacity</p>
      <div className="grid grid-cols-2 gap-x-1.5">
        {cell(
          "opacity",
          <NumberField
            label="o"
            title="opacity"
            value={layer.base.opacity}
            step={PROP_STEP.opacity}
            min={0}
            max={1}
            onChange={(v) => useStudio.getState().setLayerBase(layer.id, { opacity: v })}
          />,
        )}
      </div>
    </section>
  );
}

/**
 * Put the element on one of the frame's centre lines.
 *
 * The icon is the line it aligns to, so the vertical one centres across the width and
 * the horizontal one centres down the height — the same two lines a drag already draws
 * when it passes through the middle, reachable without the drag.
 */
function CentreButton({ layerId, axis }: { layerId: string; axis: "x" | "y" }) {
  const label =
    axis === "x" ? "align centre on the vertical axis" : "align centre on the horizontal axis";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-[#c0c0c0] hover:bg-[#f5f5f5] hover:text-[#555]"
      onClick={() => useStudio.getState().centreLayer(layerId, axis)}
    >
      {axis === "x" ? <AlignCentreVerticalIcon /> : <AlignCentreHorizontalIcon />}
    </button>
  );
}

/** Lucide `align-center-vertical` — boxes gathered onto a vertical line. */
function AlignCentreVerticalIcon() {
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
      <path d="M12 2v20" />
      <path d="M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4" />
      <path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" />
      <path d="M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1" />
      <path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

/** Lucide `align-center-horizontal` — boxes gathered onto a horizontal line. */
function AlignCentreHorizontalIcon() {
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
      <path d="M2 12h20" />
      <path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" />
      <path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" />
      <path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" />
      <path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * One axis of the element's size, in pixels.
 *
 * The engine stores a scale factor, so the pixels are the factor times the asset's
 * own size; typing a width divides back out. With the ratio locked the other axis
 * follows by the same factor, which is the same rule a corner handle on the canvas
 * obeys — one lock, two places to use it.
 */
function SizeField({
  axis,
  track,
  state,
  size,
}: {
  axis: "scaleX" | "scaleY";
  track: Track;
  state: Transform;
  size: DesignSize;
}) {
  const other = axis === "scaleX" ? "scaleY" : "scaleX";
  const locked = Boolean(track.layer.lockAspect);

  const write = (px: number) => {
    const next = fromDisplay(axis, px, size);
    const patch: Partial<Transform> = { [axis]: next };
    // A ratio is only a ratio while there is something to take it of: an element
    // already flattened to nothing has no proportion left to keep.
    if (locked && state[axis] !== 0) patch[other] = state[other] * (next / state[axis]);
    useStudio.getState().captureTransform(track.layer.id, patch);
  };

  return (
    <NumberField
      label={axis === "scaleX" ? "w" : "h"}
      title={axis === "scaleX" ? "width in pixels" : "height in pixels"}
      value={toDisplay(axis, state[axis], size)}
      step={PROP_STEP[axis]}
      min={0}
      precision={0}
      onChange={write}
    />
  );
}

/**
 * The aspect lock, the same one the canvas puts beside a selection. Either place
 * toggles it, and a resize from either place obeys it.
 *
 * Built like the separate-position button below it rather than like a field: both are
 * a switch riding at the end of a row, saying how the numbers beside them behave, so
 * neither should read as another value to fill in.
 */
function LockButton({ layerId, locked }: { layerId: string; locked: boolean }) {
  const label = locked ? "unlock aspect ratio" : "lock aspect ratio";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={locked}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        locked
          ? "bg-[#e8f4ff] text-[#0d99ff]"
          : "text-[#c0c0c0] hover:bg-[#f5f5f5] hover:text-[#555]"
      }`}
      onClick={() => useStudio.getState().toggleLayerLock(layerId)}
    >
      {locked ? <LockIcon size={13} /> : <LockOpenIcon size={13} />}
    </button>
  );
}

/**
 * What is being done to the element: where it sits and which way it faces.
 *
 * Size and opacity used to live here too. They moved up to the element's own section
 * — they describe the thing rather than the motion, and a panel that says so is a
 * panel you can read without knowing which is which.
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

  const cell = (target: KeyTarget, field: ReactNode) => (
    <KeyCell layerId={id} target={target} track={track} activeKeyframes={activeKeyframes}>
      {field}
    </KeyCell>
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

      <p className={`${SUBLABEL} mb-1`}>rotation</p>
      <div className="grid grid-cols-2 gap-x-1.5">
        {cell(
          "rotation",
          <NumberField
            label="r"
            title="rotation in degrees"
            value={base.rotation}
            onChange={(v) => set({ rotation: v })}
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
  const clones = useStudio((s) => {
    const d = s.composition.tracks.find((tr) => tr.layer.id === layerId)?.layer.distributor;
    return d && d.type !== "none" ? d.count : 1;
  });
  const delay = typeof md.params.delay === "number" ? md.params.delay : 0;
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

      {/* Only a cloner has anything to stagger — on a single element the field would
          be a control with nothing on the other end of it. */}
      {clones > 1 ? (
        <>
          <div className="mt-1.5">
            <NumberField
              label="delay"
              title="clone delay"
              value={delay}
              step={0.01}
              min={0}
              max={1}
              onChange={(v) => params({ delay: v })}
            />
          </div>
          <p className="mt-1 text-[10px] text-[#b0b0b0]">
            staggers clones across time. 0 = simultaneous
          </p>
        </>
      ) : null}

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
 * The editor for whichever keyframe the timeline has picked.
 *
 * The list itself lives on the timeline now, under the element it belongs to, where a
 * keyframe can be read against the ruler that gives it its time. What is left here is
 * the part a row on a strip cannot hold: the values on either side of it, the easing
 * carrying into it, and the time typed rather than dragged. One keyframe at a time,
 * because the panel is pointed at one — and several picked at once means a bundle,
 * which is named rather than edited.
 */
function KeyframeEditor({ track }: { track: Track }) {
  const duration = useStudio((s) => s.composition.duration);
  const selectedKeys = useStudio((s) => s.selectedKeys);
  const assets = useStudio((s) => s.assets);
  const layerId = track.layer.id;
  // A width keyframe is stored as a scale factor; the fields below read and write
  // pixels, the same as the dimensions row does.
  const size = designSizeOf(assets, track.layer);

  const [naming, setNaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const entries = keyframeLog(track, duration).flatMap((g) => g.entries);
  const picked = entries.filter((e) => selectedKeys.includes(e.id));
  const one = picked.length === 1 ? picked[0] : null;
  const empty = picked.length === 0;

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
   * Moving a keyframe in time re-sorts its set, which renumbers the keyframes around
   * it. What is picked is a place in that order, so it moves with the keyframe rather
   * than jumping to whoever took the old slot.
   */
  const followMove = (property: KeyTarget, from: number, to: number) => {
    if (from === to) return;
    const store = useStudio.getState();
    store.setSelectedKeys(
      store.selectedKeys.map((id) => {
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

  const setEntryEase = (entry: LogEntry, ease: Easing) =>
    writeStops(entry.property, (stops) => patchStop(stops, entry.index, { ease }));

  /** A value on one side of the arrow: `to` is the keyframe itself, `from` is the one
   *  before it, which is where the property was coming from. */
  const setEntryValue = (entry: LogEntry, side: "from" | "to", axis: "x" | "y", v: number) => {
    const index = side === "to" ? entry.index : entry.index - 1;
    if (index < 0) return;
    const stored = fromDisplay(entry.property, v, size);
    writeStops(entry.property, (stops, which) =>
      which === axis ? patchStop(stops, index, { v: stored }) : stops,
    );
  };

  /** The same removal backspace performs, so the button and the key cannot disagree
   *  about what taking a keyframe out means. */
  const removePicked = () => useStudio.getState().removeSelectedKeys();

  const saveModule = (name: string) => {
    // The library that would hold this does not exist yet, so the bundle is named and
    // acknowledged and the keyframes stay where they are.
    console.log("module saved (coming soon)", { name, layerId, entries: selectedKeys });
    setToast("module saved (coming soon)");
    setNaming(false);
    useStudio.getState().setSelectedKeys([]);
  };

  if (empty) return null;

  return (
    <section className={SECTION}>
      <div className="flex items-center gap-1">
        <p className={LABEL}>keyframe</p>
        <button
          type="button"
          className="ml-auto rounded px-1 text-[10px] text-[#b0b0b0] hover:bg-[#f0f0f0] hover:text-[#555]"
          title="clear the selection"
          onClick={() => useStudio.getState().setSelectedKeys([])}
        >
          clear
        </button>
      </div>

      {one ? (
        <KeyframeFields
          entry={one}
          size={size}
          last={stopsOf(one.property).length <= 1}
          onTime={(seconds) => setEntryTime(one, seconds)}
          onEase={(ease) => setEntryEase(one, ease)}
          onValue={(side, axis, v) => setEntryValue(one, side, axis, v)}
          onRemove={removePicked}
        />
      ) : (
        <>
          <p className="mt-2 text-[11px] text-[#555]">
            {picked.length} keyframes picked
          </p>
          {naming ? (
            <ModuleNameField onConfirm={saveModule} onCancel={() => setNaming(false)} />
          ) : (
            <button
              type="button"
              className={`${GHOST_BTN} mt-2 w-full`}
              onClick={() => setNaming(true)}
            >
              save as module
            </button>
          )}
        </>
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
 * The picked keyframe, opened up: what the property was coming from, what this
 * keyframe sets it to, how it eases in, and when it happens. The timeline says which
 * keyframe this is; everything here is what cannot be said on a strip.
 */
function KeyframeFields({
  entry,
  size,
  last,
  onTime,
  onEase,
  onValue,
  onRemove,
}: {
  entry: LogEntry;
  /** The element at scale 1, so a size keyframe reads in pixels here too. */
  size: DesignSize | undefined;
  /** The property's only keyframe, so removing it is removing the motion. */
  last: boolean;
  onTime: (seconds: number) => void;
  onEase: (ease: Easing) => void;
  onValue: (side: "from" | "to", axis: "x" | "y", v: number) => void;
  onRemove: () => void;
}) {
  const axes: ("x" | "y")[] = typeof entry.to === "number" ? ["x"] : ["x", "y"];
  const at = (v: LogValue, axis: "x" | "y") =>
    toDisplay(entry.property, typeof v === "number" ? v : v[axis], size);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`${PROP_TEXT[entry.property]} shrink-0`}>
          <DiamondIcon filled />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] capitalize text-[#111]">
          {propLabel(entry.property)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="w-[76px] shrink-0">
          <NumberField
            label="s"
            title="time in seconds"
            value={entry.t}
            step={0.1}
            min={0}
            onChange={onTime}
          />
        </div>
        <select
          className="h-[26px] min-w-0 flex-1 rounded-md border border-[#e0e0e0] bg-transparent px-1 text-[10px] text-[#555] outline-none"
          aria-label="easing"
          title="easing into this keyframe"
          value={entry.ease ?? "linear"}
          onChange={(e) => onEase(e.target.value as Easing)}
        >
          {EASINGS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

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
              // Nothing precedes the first keyframe — the curve holds this value up
              // to it, so there is no earlier one to edit.
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
        title={
          last
            ? `remove the only ${propLabel(entry.property)} keyframe — the property stops animating`
            : "remove keyframe — backspace does the same"
        }
        className="self-end rounded px-1 text-[10px] text-[#888] hover:bg-[#f0f0f0] hover:text-[#111]"
        onClick={onRemove}
      >
        remove
      </button>
    </div>
  );
}

/** Lucide `separator-vertical` — one field parting into two, which is what the
 *  button beside a position does to its axes. */
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
