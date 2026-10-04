import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FillDef, StrokeDef, Track, Transform } from "../core/types";
import type { Stop } from "../core/curve";
import type { EasingDef } from "../core/easing";
import { renderState } from "../core/renderState";
import { designSizeOf, isSvg, useStudio } from "./store";
import {
  FPS_CHOICES,
  RESOLUTIONS,
  normalizeHex,
  resolutionFor,
  resolutionKey,
} from "./composition";
import {
  PROP_STEP,
  PROP_TEXT,
  fromDisplay,
  hasKeyframes,
  layerName,
  propLabel,
  patchStop,
  positionSets,
  secondsToT,
  toDisplay,
  type DesignSize,
  type KeyProp,
  type KeyTarget,
  type Range,
} from "./modules";
import { DistributorSection, ModuleStackSection } from "./ModuleStack";
import { Toolbar } from "./Toolbar";
import { EaseSelect, EasingSection } from "./EasingControls";
import {
  MIN_SEGMENT,
  easesAgree,
  findSegments,
  sharedEase,
  sharedLabel,
  type SegmentView,
} from "./segments";
import { BenchPanel } from "./ModuleShelf";
import { ZOOM_PRESETS, zoomPercent } from "./view";
import {
  BOX,
  DiamondIcon,
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
  const bench = useStudio((s) => s.bench);
  const index = composition.tracks.findIndex(
    (tr) => tr.layer.id === selectedId,
  );
  const track = index < 0 ? null : composition.tracks[index];

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col border-l border-border bg-bg"
      aria-label={bench ? "module bench" : "inspector"}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The bench takes the panel rather than floating over it: a module is being
            written against the proxy on the frame, and the element that happened to
            be picked has nothing to do with it. */}
        {bench ? (
          <BenchPanel bench={bench} />
        ) : (
          <ElementPanels
            track={track}
            index={index}
            selectedIds={selectedIds}
          />
        )}
      </div>
    </aside>
  );
}

function ElementPanels({
  track,
  index,
  selectedIds,
}: {
  track: Track | null;
  index: number;
  selectedIds: string[];
}) {
  const segments = useStudio((s) => s.selectedSegments);
  return (
    <>
      <Toolbar />
      {track ? <ElementPanel track={track} index={index} /> : null}
      {selectedIds.length > 1 ? <SelectionPanel ids={selectedIds} /> : null}
      {segments.length > 0 ? <SegmentPanel ids={segments} /> : null}
      <CompositionPanel />
    </>
  );
}

/**
 * The span between two keyframes, opened up.
 *
 * A stop is a moment and a segment is the motion between two of them, which is where
 * the duration, the curve and the destination actually live — so this is where they
 * are edited. Several at once shows only what is honestly shared: one curve written
 * to all of them, and the blend when they are all the same property.
 */
function SegmentPanel({ ids }: { ids: string[] }) {
  const composition = useStudio((s) => s.composition);
  const picked = findSegments(composition.tracks, ids, composition.duration);
  const one = picked.length === 1 ? picked[0] : null;
  const label = sharedLabel(picked);

  if (picked.length === 0) return null;

  const write = (ease: EasingDef) =>
    useStudio.getState().setSegmentEasing(ids, ease);

  return (
    <section className={SECTION}>
      <div className="flex items-baseline gap-1.5">
        <p className={LABEL}>{one ? "Segment" : `${picked.length} segments`}</p>
        <span className="min-w-0 flex-1 truncate text-[10px] capitalize text-text-muted/60">
          {label}
        </span>
        <button
          type="button"
          className="rounded px-1 text-[10px] text-text-muted/60 hover:bg-text-primary/5 hover:text-text-primary/70"
          onClick={() => useStudio.getState().setSelectedSegments([])}
        >
          Clear
        </button>
      </div>

      {one ? <SegmentTimes segment={one} /> : null}

      <EasingSection
        ease={sharedEase(picked)}
        mixed={!easesAgree(picked)}
        onChange={write}
        note={one ? undefined : `Applying to ${picked.length} segments`}
      />
    </section>
  );
}

function SegmentTimes({ segment }: { segment: SegmentView }) {
  return (
    <div className="mt-2">
      <p className={LABEL}>Time</p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField
          label="Start"
          title="Seconds"
          value={segment.from}
          step={0.05}
          min={0}
          max={segment.to - MIN_SEGMENT}
          onChange={(v) => useStudio.getState().setSegmentStart(segment.id, v)}
        />
        <NumberField
          label="End"
          title="Seconds"
          value={segment.to}
          step={0.05}
          min={segment.from + MIN_SEGMENT}
          onChange={(v) =>
            useStudio.getState().setSegmentDuration(segment.id, v - segment.from)
          }
        />
      </div>
    </div>
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
  const { fps, background } = useStudio((s) => s.composition);
  const frame = useStudio((s) => s.frame);

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>Composition</p>
      {/* The right column carries the widest values — a resolution, a hex — so it
          takes the room the left one does not need. */}
      <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-1.5">
        <SelectField
          label="FPS"
          value={String(fps)}
          onChange={(v) => useStudio.getState().setFps(Number(v))}
          options={FPS_CHOICES.map((f) => ({
            value: String(f),
            label: String(f),
          }))}
        />

        <ZoomField />

        <BackgroundField value={background ?? "#ffffff"} />

        <SelectField
          label="Res"
          title="Resolution"
          value={resolutionKey(frame)}
          onChange={(v) => {
            const size = resolutionFor(v);
            if (size) useStudio.getState().setResolution(size);
          }}
          options={RESOLUTIONS.map((r) => ({
            value: resolutionKey(r.size),
            label: r.label,
          }))}
        />
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
    <div className={BOX} title="Background">
      <input
        type="color"
        aria-label="background colour"
        className="h-[16px] w-[20px] shrink-0 cursor-pointer rounded-[3px] border border-border bg-transparent p-0"
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

function ZoomField() {
  const zoom = useStudio((s) => s.view.zoom);
  const current = zoomPercent(zoom);
  const percents = [
    ...new Set([...ZOOM_PRESETS.map(zoomPercent), current]),
  ].sort((a, b) => a - b);

  return (
    <SelectField
      label="Zoom"
      value={String(current)}
      onChange={(v) => {
        const { viewport, zoomAroundPoint } = useStudio.getState();
        zoomAroundPoint(
          { x: viewport.width / 2, y: viewport.height / 2 },
          Number(v) / 100,
        );
      }}
      options={percents.map((p) => ({ value: String(p), label: `${p}%` }))}
    />
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
    <label className={`${BOX} justify-between`} title={title}>
      <span className={`${LABEL} shrink-0`}>{label}</span>
      {/* The select is free to shrink: a native control sizes itself to its widest
          option, which walks the chevron straight out of the box. */}
      <select
        className="min-w-0 flex-1 bg-transparent text-right text-[11px] text-text-primary outline-none"
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
  const { layer } = track;
  const activeKeyframes =
    selectedPart?.kind === "keyframes" &&
    hasKeyframes(track, selectedPart.property)
      ? selectedPart.property
      : null;

  return (
    <>
      {/* What the element is, before anything animates it. The transform below is
          what happens to it; this is the thing being happened to. */}
      <ElementSection
        track={track}
        index={index}
        activeKeyframes={activeKeyframes}
      />

      {(track.layer.source.kind === "rect" || track.layer.source.kind === "ellipse") ? (
        <ShapeSection track={track} activeKeyframes={activeKeyframes} />
      ) : null}

      <BaseTransform track={track} activeKeyframes={activeKeyframes} />

      {/* The list of keyframes is on the timeline, under the element it belongs to.
          What is left here is the editor for whichever one is picked. */}
      <KeyframeEditor track={track} />

      <DistributorSection
        distributor={layer.distributor}
        onChange={(d) => useStudio.getState().setDistributor(layer.id, d)}
      />

      <ModuleStackSection track={track} />
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
      label={prop.toUpperCase()}
      title={read[prop] === null ? "Type to set all" : undefined}
      value={read[prop] ?? 0}
      mixed={read[prop] === null}
      join={join}
      onChange={(v) => useStudio.getState().setSelectionTransform(ids, prop, v)}
      onStep={(by) =>
        useStudio.getState().nudgeSelectionTransform(ids, prop, by)
      }
    />
  );

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>{ids.length} elements selected</p>

      {/* Position is one property with two fields here too, and one diamond keys the
          pair. The axes are not split apart: that is a per-element choice, and the
          place to make it is the element. */}
      <p className={`${SUBLABEL} mb-1`}>Position</p>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">{axis("x", "left")}</div>
          <div className="min-w-0 flex-1">{axis("y", "right")}</div>
        </div>
        <SelectionKeyButton
          ids={ids}
          target="position"
          keyframed={keyed("position")}
        />
      </div>

      <p className={`${SUBLABEL} mb-1`}>Rotation</p>
      <div className="mb-2 flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberField
            label="R"
            title={read.rotation === null ? "Type to set all" : undefined}
            value={read.rotation ?? 0}
            mixed={read.rotation === null}
            onChange={(v) =>
              useStudio.getState().setSelectionTransform(ids, "rotation", v)
            }
            onStep={(by) =>
              useStudio.getState().nudgeSelectionTransform(ids, "rotation", by)
            }
          />
        </div>
        <SelectionKeyButton
          ids={ids}
          target="rotation"
          keyframed={keyed("rotation")}
        />
      </div>

      <p className={`${SUBLABEL} mb-1`}>Opacity</p>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <NumberField
            label="O"
            title={read.opacity === null ? "Type to set all" : undefined}
            value={read.opacity ?? 1}
            mixed={read.opacity === null}
            step={PROP_STEP.opacity}
            min={0}
            max={1}
            onChange={(v) => useStudio.getState().setOpacity(ids, v)}
            onStep={(by) => useStudio.getState().nudgeOpacity(ids, by)}
          />
        </div>
        <SelectionKeyButton
          ids={ids}
          target="opacity"
          keyframed={keyed("opacity")}
        />
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
  const label = keyframed ? "Keyframe here" : "Add keyframe";
  return (
    <button
      type="button"
      aria-label={`${label}: ${target}, ${ids.length} elements`}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md hover:bg-text-primary/5 ${
        keyframed
          ? PROP_TEXT[target]
          : "text-text-muted/60 hover:text-text-primary/70"
      }`}
      onClick={() => useStudio.getState().keySelection(ids, target)}
    >
      <DiamondIcon filled={keyframed} size={10} />
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
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
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
  const library = useStudio((s) => s.moduleLibrary);
  const t = useStudio((s) => s.t);
  const { layer } = track;
  const layerSrc = layer.source;
  const asset =
    layerSrc.kind === "image"
      ? assets.find((a) => a.id === layerSrc.value)
      : undefined;
  const size = designSizeOf(assets, layer);
  // Only an element that *is* one part of a drawing has a node to name. What is left
  // of a file after parts came off it is still that file, however much it lost.
  const part =
    asset &&
    isSvg(asset) &&
    asset.takenFrom !== undefined &&
    asset.nodes.length === 1
      ? asset
      : null;
  const name = layerName(layer, asset?.name, index);

  /** What the element reads at the playhead, curves and modules included — so a field
   *  and the box on the canvas cannot disagree about how wide the thing is. */
  const state = useMemo(
    () =>
      renderState(composition, t, library).find((it) => it.id === layer.id)
        ?.state ?? layer.base,
    [composition, t, library, layer],
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
      <div className={`flex items-center gap-1 ${layerSrc.kind === "rect" || layerSrc.kind === "ellipse" ? "" : "mb-2"}`}>
        <input
          className={`${LABEL} min-w-0 flex-1 truncate bg-transparent outline-none focus:text-text-primary`}
          value={name}
          title={name}
          onChange={(e) => useStudio.getState().renameLayer(layer.id, e.target.value)}
        />
        <CentreButton layerId={layer.id} axis="x" />
        <CentreButton layerId={layer.id} axis="y" />
      </div>

      {/* Which part of which drawing this is. Read-only: it says where this came
          from, and nothing about the drawing is edited from here. */}
      {part ? (
        <>
          <p className={`${SUBLABEL} mb-1`}>Node</p>
          <div className={`${BOX} mb-2 justify-between`} title={part.name}>
            <span className="min-w-0 truncate text-[11px] text-text-primary/70">
              {part.name}
            </span>
          </div>
        </>
      ) : null}

      {size && layerSrc.kind !== "rect" && layerSrc.kind !== "ellipse" ? (
        <>
          <p className={`${SUBLABEL} mb-1`}>Dimensions</p>
          <div className="mb-2 flex items-center gap-1.5">
            {cell(
              "scaleX",
              <SizeField
                axis="scaleX"
                track={track}
                state={state}
                size={size}
              />,
            )}
            {cell(
              "scaleY",
              <SizeField
                axis="scaleY"
                track={track}
                state={state}
                size={size}
              />,
            )}
            <LockButton layerId={layer.id} locked={Boolean(layer.lockAspect)} />
          </div>
        </>
      ) : null}

      {layerSrc.kind !== "rect" && layerSrc.kind !== "ellipse" ? (
        <>
          <p className={`${SUBLABEL} mb-1`}>Opacity</p>
          <div className="grid grid-cols-2 gap-x-1.5">
            {cell(
              "opacity",
              <NumberField
                label="O"
                value={layer.base.opacity}
                step={PROP_STEP.opacity}
                min={0}
                max={1}
                onChange={(v) =>
                  useStudio.getState().setLayerBase(layer.id, { opacity: v })
                }
              />,
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

function ShapeSection({ track, activeKeyframes }: { track: Track; activeKeyframes: KeyTarget | null }) {
  const { layer } = track;
  const src = layer.source;
  if (src.kind !== "rect" && src.kind !== "ellipse") return null;
  const props = src.props;
  const set = (patch: Record<string, unknown>) =>
    useStudio.getState().setShapeProp(layer.id, patch);
  const setFill = (patch: Partial<FillDef>) =>
    set({ fill: { ...props.fill, ...patch } });
  const setStroke = (patch: Partial<StrokeDef>) =>
    set({ stroke: { ...props.stroke, ...patch } });

  const cell = (target: KeyTarget, field: ReactNode) => (
    <KeyCell layerId={layer.id} target={target} track={track} activeKeyframes={activeKeyframes}>
      {field}
    </KeyCell>
  );

  return (
    <>
      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Shape</p>
        <div className="mb-1 flex items-center gap-1.5">
          {cell("scaleX", <NumberField label="W" value={props.width} step={1} min={1} onChange={(v) => set({ width: v })} />)}
          {cell("scaleY", <NumberField label="H" value={props.height} step={1} min={1} onChange={(v) => set({ height: v })} />)}
          <LockButton layerId={layer.id} locked={Boolean(layer.lockAspect)} />
        </div>
        <div className="mb-1 grid grid-cols-2 gap-x-1.5 gap-y-1">
          {src.kind === "rect" ? (
            <NumberField label="R" value={src.props.cornerRadius} step={1} min={0} onChange={(v) => set({ cornerRadius: v })} />
          ) : (
            <>
              <NumberField label="Sweep" value={src.props.sweepAngle} step={1} min={0} max={360} onChange={(v) => set({ sweepAngle: v })} />
              <NumberField label="Start" value={src.props.startAngle} step={1} min={0} max={360} onChange={(v) => set({ startAngle: v })} />
            </>
          )}
          {cell(
            "opacity",
            <NumberField
              label="O"
              value={layer.base.opacity}
              step={PROP_STEP.opacity}
              min={0}
              max={1}
              onChange={(v) => useStudio.getState().setLayerBase(layer.id, { opacity: v })}
            />,
          )}
        </div>
      </section>

      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Fill</p>
        <div className="mb-2 flex items-center gap-1.5">
          <input
            type="color"
            value={props.fill.color}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0"
            onChange={(e) => setFill({ color: e.target.value })}
          />
          <input
            className={INPUT}
            value={props.fill.color}
            onChange={(e) => {
              const v = normalizeHex(e.target.value);
              if (v) setFill({ color: v });
            }}
          />
          <NumberField label="A" value={props.fill.opacity} step={0.01} min={0} max={1} onChange={(v) => setFill({ opacity: v })} />
        </div>
      </section>

      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Stroke</p>
        <div className="mb-1 flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[11px] text-text-muted">
            <input
              type="checkbox"
              checked={props.stroke.enabled}
              className="accent-accent"
              onChange={(e) => setStroke({ enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        {props.stroke.enabled ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={props.stroke.color}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-0"
                onChange={(e) => setStroke({ color: e.target.value })}
              />
              <input
                className={INPUT}
                value={props.stroke.color}
                onChange={(e) => {
                  const v = normalizeHex(e.target.value);
                  if (v) setStroke({ color: v });
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-1.5">
              <NumberField label="W" value={props.stroke.width} step={0.5} min={0} onChange={(v) => setStroke({ width: v })} />
              <NumberField label="A" value={props.stroke.opacity} step={0.01} min={0} max={1} onChange={(v) => setStroke({ opacity: v })} />
              <NumberField label="Dash" value={props.stroke.dashOffset} step={1} min={0} onChange={(v) => setStroke({ dashOffset: v })} />
            </div>
          </div>
        ) : null}
      </section>
    </>
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
    axis === "x"
      ? "Centre horizontally"
      : "Centre vertically";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-text-muted/60 hover:bg-text-primary/5 hover:text-text-primary/70"
      onClick={() => useStudio.getState().centreLayer(layerId, axis)}
    >
      {axis === "x" ? (
        <AlignCentreVerticalIcon />
      ) : (
        <AlignCentreHorizontalIcon />
      )}
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
    if (locked && state[axis] !== 0)
      patch[other] = state[other] * (next / state[axis]);
    useStudio.getState().captureTransform(track.layer.id, patch);
  };

  return (
    <NumberField
      label={axis === "scaleX" ? "W" : "H"}
      value={toDisplay(axis, state[axis], size)}
      step={PROP_STEP[axis]}
      min={0}
      precision={0}
      onChange={write}
    />
  );
}

/**
 * The aspect lock. A resize from the panel or from the canvas obeys it.
 *
 * Built like the separate-position button below it rather than like a field: both are
 * a switch riding at the end of a row, saying how the numbers beside them behave, so
 * neither should read as another value to fill in.
 */
function LockButton({ layerId, locked }: { layerId: string; locked: boolean }) {
  const label = locked ? "Unlock aspect ratio" : "Lock aspect ratio";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={locked}
      title={label}
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        locked ? "text-accent" : "text-text-muted/60 hover:text-text-primary/70"
      } hover:bg-text-primary/5`}
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
  const set = (patch: Partial<Transform>) =>
    useStudio.getState().setLayerBase(id, patch);

  const cell = (target: KeyTarget, field: ReactNode) => (
    <KeyCell
      layerId={id}
      target={target}
      track={track}
      activeKeyframes={activeKeyframes}
    >
      {field}
    </KeyCell>
  );

  const x = (join?: Join) => (
    <NumberField
      label="X"
      value={base.x}
      onChange={(v) => set({ x: v })}
      join={join}
    />
  );
  const y = (join?: Join) => (
    <NumberField
      label="Y"
      value={base.y}
      onChange={(v) => set({ y: v })}
      join={join}
    />
  );

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>Transform</p>
      {/* Position is one property with two fields: one diamond keyframes the pair,
          and the toggle beside it is how you ask for the axes apart. Two fields on
          one row want saying what they are together. */}
      <p className={`${SUBLABEL} mb-1`}>Position</p>
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

      <p className={`${SUBLABEL} mb-1`}>Rotation</p>
      <div className="grid grid-cols-2 gap-x-1.5">
        {cell(
          "rotation",
          <NumberField
            label="R"
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
  const label = keyframed ? "Edit keyframes" : "Add keyframe";
  return (
    <button
      type="button"
      aria-label={`${label}: ${target}`}
      aria-pressed={selected}
      title={label}
      className={`grid h-3 w-3 shrink-0 place-items-center rounded ${keyframed ? PROP_TEXT[target] : "text-text-muted/60 hover:text-text-primary/70"}`}
      onClick={() => {
        const store = useStudio.getState();
        if (!keyframed) return store.addKeyframes(layerId, target);
        store.selectPart(
          layerId,
          selected ? null : { kind: "keyframes", property: target },
        );
      }}
    >
      <DiamondIcon filled={keyframed} size={10} />
    </button>
  );
}

/** Pressed, x and y are two properties with two sets of keyframes; released, they are
 *  one. The keyframes survive the trip either way. */
function SeparateButton({
  layerId,
  separate,
}: {
  layerId: string;
  separate: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="separate dimensions"
      aria-pressed={separate}
      title="Separate dimensions"
      className={`grid h-[26px] w-[20px] shrink-0 place-items-center rounded-md ${
        separate
          ? "bg-accent/10 text-accent"
          : "text-text-muted/60 hover:bg-text-primary/5 hover:text-text-primary/70"
      }`}
      onClick={() =>
        useStudio.getState().setSeparatePosition(layerId, !separate)
      }
    >
      <SeparatorVerticalIcon />
    </button>
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
    return position
      ? position.x.stops
      : (track.keyframes?.[property]?.stops ?? []);
  };
  const rangeOf = (property: KeyTarget): Range => {
    const position = property === "position" ? positionSets(track) : null;
    return position
      ? position.x.range
      : (track.keyframes?.[property]?.range ?? [0, 1]);
  };

  /** One edit reaching both axes of a position, or the single set behind any other
   *  property — the two writers the store already has, chosen by the property. */
  const writeStops = (
    property: KeyTarget,
    fn: (stops: Stop[], axis: "x" | "y") => Stop[],
  ) => {
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
    if (set)
      store.setKeyframeStops(layerId, property as KeyProp, fn(set.stops, "x"));
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
    followMove(
      entry.property,
      entry.index,
      indexAfterMove(stopsOf(entry.property), entry.index, t),
    );
  };

  const setEntryEase = (entry: LogEntry, ease: EasingDef) =>
    writeStops(entry.property, (stops) =>
      patchStop(stops, entry.index, { ease }),
    );

  /** A value on one side of the arrow: `to` is the keyframe itself, `from` is the one
   *  before it, which is where the property was coming from. */
  const setEntryValue = (
    entry: LogEntry,
    side: "from" | "to",
    axis: "x" | "y",
    v: number,
  ) => {
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
    console.log("module saved (coming soon)", {
      name,
      layerId,
      entries: selectedKeys,
    });
    setToast("Module saved (coming soon)");
    setNaming(false);
    useStudio.getState().setSelectedKeys([]);
  };

  if (empty) return null;

  return (
    <section className={SECTION}>
      <div className="flex items-center gap-1">
        <p className={LABEL}>Keyframe</p>
        <button
          type="button"
          className="ml-auto rounded px-1 text-[10px] text-text-muted/60 hover:bg-text-primary/5 hover:text-text-primary/70"
          onClick={() => useStudio.getState().setSelectedKeys([])}
        >
          Clear
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
          <p className="mt-2 text-[11px] text-text-primary/70">
            {picked.length} keyframes picked
          </p>
          {naming ? (
            <ModuleNameField
              onConfirm={saveModule}
              onCancel={() => setNaming(false)}
            />
          ) : (
            <button
              type="button"
              className={`${GHOST_BTN} mt-2 w-full`}
              onClick={() => setNaming(true)}
            >
              Save as module
            </button>
          )}
        </>
      )}

      {toast ? (
        <p
          role="status"
          className="mt-2 rounded bg-text-primary/5 px-2 py-1 text-[10px] text-text-primary/70"
        >
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
        placeholder="Name this module"
        aria-label="name this module"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) onConfirm(name.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <span className="shrink-0 text-[10px] text-text-muted/60">↵</span>
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
  onEase: (ease: EasingDef) => void;
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
        <span className="min-w-0 flex-1 truncate text-[11px] capitalize text-text-primary">
          {propLabel(entry.property)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="w-[76px] shrink-0">
          <NumberField
            label="s"
            title="Time"
            value={entry.t}
            step={0.1}
            min={0}
            onChange={onTime}
          />
        </div>
        <EaseSelect
          className="min-w-0 flex-1"
          ease={entry.ease}
          onChange={onEase}
        />
      </div>

      {axes.map((axis) => (
        <div key={axis} className="flex items-center gap-1">
          {axes.length > 1 ? (
            <span className={`${SUBLABEL} w-[8px] shrink-0`}>{axis.toUpperCase()}</span>
          ) : null}
          <div className="min-w-0 flex-1">
            <NumberField
              label="From"
              value={at(entry.from, axis)}
              step={PROP_STEP[entry.property]}
              // Nothing precedes the first keyframe — the curve holds this value up
              // to it, so there is no earlier one to edit.
              disabled={entry.index === 0}
              onChange={(v) => onValue("from", axis, v)}
            />
          </div>
          <span className="shrink-0 text-[10px] text-text-muted/60">→</span>
          <div className="min-w-0 flex-1">
            <NumberField
              label="To"
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
        title={last ? "Stops animating this property" : undefined}
        className="self-end rounded px-1 text-[10px] text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
        onClick={onRemove}
      >
        Remove
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
