import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Lock } from "lucide-react";
import type { FillDef, StrokeDef, TextSource, Track, Transform } from "../core/types";
import type { EasingDef } from "../core/easing";
import { renderState } from "../core/renderState";
import { designSizeOf, isSvg, useStudio, type AlignEdge } from "./store";
import { FPS_CHOICES } from "./composition";
import { ResolutionPicker } from "./ResolutionPicker";
import {
  PROP_STEP,
  PROP_TEXT,
  fromDisplay,
  hasKeyframes,
  layerName,
  toDisplay,
  type DesignSize,
  type KeyTarget,
} from "./modules";
import { DistributorSection, ModuleStackSection } from "./ModuleStack";
import { EasingSection } from "./EasingControls";
import { Dropdown } from "./Dropdown";
import { ScrollArea } from "./ScrollArea";
import { stepFocus } from "./stepFocus";
import { ensureFontPreview, faceOf } from "./fontPreview";
import { getFont } from "../render/fontCache";
import { weightName } from "./text";
import {
  MIN_SEGMENT,
  easesAgree,
  findSegments,
  sharedEase,
  sharedLabel,
  type SegmentView,
} from "./segments";
import { BenchPanel } from "./ModuleShelf";
import {
  AlignBottomIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignMiddleIcon,
  AlignRightIcon,
  AlignTopIcon,
  DotsPatternIcon,
  GridPatternIcon,
  SplitIcon,
  TextAlignIcon,
} from "./icons";
import {
  BOX,
  ColorField,
  ColorInput,
  DiamondIcon,
  INPUT,
  LABEL,
  LockIcon,
  LockOpenIcon,
  NumberField,
  PANEL,
  PANEL_LABEL,
  PILL,
  SECTION,
  Segmented,
  SUBLABEL,
  type Join,
} from "./fields";

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
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${PANEL}`}
      aria-label={bench ? "module bench" : "inspector"}
    >
      <ScrollArea className="min-h-0 flex-1">
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
      </ScrollArea>
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
  const tracks = useStudio((s) => s.composition.tracks);
  // A locked element in a mixed selection is left out of what the shared panel writes.
  const editable = selectedIds.filter(
    (id) => !tracks.find((tr) => tr.layer.id === id)?.layer.locked,
  );
  return (
    <>
      {track?.layer.locked ? (
        <>
          <p className={`${SECTION} flex items-center gap-1.5 ${LABEL}`}>
            <Lock size={11} aria-hidden="true" />
            Locked
          </p>
          {/* Read-only: `disabled` covers the inputs, and the pointer block covers the
              drag-to-scrub fields that never check it. */}
          <fieldset disabled className="pointer-events-none m-0 min-w-0 border-0 p-0 opacity-60">
            <ElementPanel track={track} index={index} />
          </fieldset>
        </>
      ) : track ? (
        <ElementPanel track={track} index={index} />
      ) : selectedIds.length === 0 ? (
        <CompositionPanel />
      ) : null}
      {selectedIds.length > 1 && editable.length > 0 ? <SelectionPanel ids={editable} locked={selectedIds.length - editable.length} /> : null}
      {segments.length > 0 ? <SegmentPanel ids={segments} /> : null}
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
 * The composition's own settings, shown when nothing is selected.
 *
 * No duration field: length is not a setting to fill in before you can animate. It
 * follows from the work, and the ruler's end handle is there when you want to say
 * otherwise.
 */
function CompositionPanel() {
  const { fps, background } = useStudio((s) => s.composition);
  const pattern = useStudio((s) => s.pattern);

  return (
    <section className={SECTION}>
      <p className={`${PANEL_LABEL} mb-3`}>Composition</p>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-1.5">
        <div className="col-span-2 flex">
          <ColorInput
            outlined
            label="background"
            value={background ?? "#ffffff"}
            onChange={(hex) => useStudio.getState().setBackground(hex)}
          />
        </div>
        <ResolutionPicker />
        <SelectField
          pill
          label="FPS"
          title="Frames per second"
          value={String(fps)}
          onChange={(v) => useStudio.getState().setFps(Number(v))}
          options={FPS_CHOICES.map((f) => ({ value: String(f), label: String(f) }))}
        />
      </div>
      <div className="mt-3">
        <p className={`${LABEL} mb-2`}>Pattern</p>
        <Segmented
          outlined
          value={pattern}
          options={[
            { value: "off", label: "No pattern", content: <span>–</span> },
            {
              value: "dots",
              label: "Dots",
              content: (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <DotsPatternIcon size={12} />
                  Dots
                </span>
              ),
            },
            {
              value: "grid",
              label: "Grid",
              content: (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <GridPatternIcon size={12} />
                  Grid
                </span>
              ),
            },
          ]}
          onChange={(v) => useStudio.getState().setPattern(v)}
        />
      </div>
    </section>
  );
}

function SelectField({
  label,
  title,
  pill,
  value,
  options,
  onChange,
}: {
  label: string;
  title?: string;
  /** The taller free-standing control, rather than the dense field. */
  pill?: boolean;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value);

  return (
    <Dropdown
      title={title ?? label}
      className={`${pill ? PILL : BOX} w-full justify-between`}
      value={value}
      options={options}
      onChange={onChange}
    >
      <span className={`${LABEL} shrink-0`}>{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-primary">
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown size={12} aria-hidden="true" className="shrink-0" />
      </span>
    </Dropdown>
  );
}

function ElementPanel({ track, index }: { track: Track; index: number }) {
  const selectedPart = useStudio((s) => s.selectedPart);
  const composition = useStudio((s) => s.composition);
  const library = useStudio((s) => s.moduleLibrary);
  const t = useStudio((s) => s.t);
  const { layer } = track;
  /** What the element reads at the playhead, curves and modules included — so a field
   *  and the box on the canvas cannot disagree about how wide the thing is. */
  const state = useMemo(
    () =>
      renderState(composition, t, library).find((it) => it.id === layer.id)
        ?.state ?? layer.base,
    [composition, t, library, layer],
  );
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
        state={state}
        activeKeyframes={activeKeyframes}
      />

      <BaseTransform track={track} state={state} activeKeyframes={activeKeyframes} />

      {(track.layer.source.kind === "rect" || track.layer.source.kind === "ellipse") ? (
        <ShapeFillStrokeSection track={track} />
      ) : null}

      {track.layer.source.kind === "text" ? (
        <TextSection layerId={track.layer.id} source={track.layer.source} />
      ) : null}

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
function SelectionPanel({ ids, locked = 0 }: { ids: string[]; locked?: number }) {
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
      <p className={`${LABEL} mb-2`}>
        {ids.length + locked} elements selected{locked > 0 ? `, ${locked} locked` : ""}
      </p>

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
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md hover:bg-text-primary/5 ${
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
  state,
  activeKeyframes,
}: {
  track: Track;
  index: number;
  state: Transform;
  activeKeyframes: KeyTarget | null;
}) {
  const assets = useStudio((s) => s.assets);
  useStudio((s) => s.fontTick);
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
          to once the composition's settings are sitting right above them. */}
      <div className={`flex items-center gap-1 mb-2`}>
        <input
          className={`${LABEL} min-w-0 flex-1 truncate bg-transparent outline-none focus:text-text-primary`}
          value={name}
          title={name}
          onChange={(e) => useStudio.getState().renameLayer(layer.id, e.target.value)}
        />
      </div>

      <AlignToFrame layerId={layer.id} />

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

      {(layerSrc.kind === "rect" || layerSrc.kind === "ellipse") ? (
        <ShapeDimsInline track={track} state={state} cell={cell} />
      ) : (
        <>
          {size ? (
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

          <p className={`${SUBLABEL} mb-1`}>Opacity</p>
          <div className="grid grid-cols-2 gap-x-1.5">
            {cell(
              "opacity",
              <NumberField
                label="O"
                value={valueAt(track, state, "opacity", "opacity")}
                step={PROP_STEP.opacity}
                min={0}
                max={1}
                onChange={(v) =>
                  useStudio.getState().captureTransform(layer.id, { opacity: v })
                }
              />,
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ShapeDimsInline({ track, state, cell }: {
  track: Track;
  state: Transform;
  cell: (target: KeyTarget, field: ReactNode) => ReactNode;
}) {
  const { layer } = track;
  const src = layer.source;
  if (src.kind !== "rect" && src.kind !== "ellipse") return null;
  const size = { width: src.props.width, height: src.props.height };
  const set = (patch: Record<string, unknown>) =>
    useStudio.getState().setShapeProp(layer.id, patch);

  return (
    <>
      <div className="mb-1 flex items-center gap-1.5">
        {cell("scaleX", <SizeField axis="scaleX" track={track} state={state} size={size} />)}
        {cell("scaleY", <SizeField axis="scaleY" track={track} state={state} size={size} />)}
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
            value={valueAt(track, state, "opacity", "opacity")}
            step={PROP_STEP.opacity}
            min={0}
            max={1}
            onChange={(v) => useStudio.getState().captureTransform(layer.id, { opacity: v })}
          />,
        )}
      </div>
    </>
  );
}

function ShapeFillStrokeSection({ track }: { track: Track }) {
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

  return (
    <>
      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Fill</p>
        <div className="mb-2 flex">
          <ColorField
            label="fill"
            color={props.fill.color}
            opacity={props.fill.opacity}
            onColor={(color) => setFill({ color })}
            onOpacity={(opacity) => setFill({ opacity })}
          />
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
            <div className="flex">
              <ColorField
                label="stroke"
                color={props.stroke.color}
                opacity={props.stroke.opacity}
                onColor={(color) => setStroke({ color })}
                onOpacity={(opacity) => setStroke({ opacity })}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-1.5">
              <NumberField label="W" value={props.stroke.width} step={0.5} min={0} onChange={(v) => setStroke({ width: v })} />
              <NumberField label="Dash" value={props.stroke.dashOffset} step={1} min={0} onChange={(v) => setStroke({ dashOffset: v })} />
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

const ALIGN_GROUPS: { edge: AlignEdge; label: string; icon: ReactNode }[][] = [
  [
    { edge: "left", label: "Align left", icon: <AlignLeftIcon /> },
    { edge: "center", label: "Align centre", icon: <AlignCenterIcon /> },
    { edge: "right", label: "Align right", icon: <AlignRightIcon /> },
  ],
  [
    { edge: "top", label: "Align top", icon: <AlignTopIcon /> },
    { edge: "middle", label: "Align middle", icon: <AlignMiddleIcon /> },
    { edge: "bottom", label: "Align bottom", icon: <AlignBottomIcon /> },
  ],
];

/** Lines the element up with the frame: across its width, then down its height. */
function AlignToFrame({ layerId }: { layerId: string }) {
  return (
    <>
      <p className={`${SUBLABEL} mb-1`}>Align to frame</p>
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        {ALIGN_GROUPS.map((group) => (
          <div
            key={group[0].edge}
            className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-lg bg-text-primary/5 [&_svg]:size-(--align-icon) [&_svg]:[stroke-width:var(--align-stroke)]"
          >
            {group.map(({ edge, label, icon }) => (
              <button
                key={edge}
                type="button"
                aria-label={label}
                title={label}
                className="grid h-(--align-height) place-items-center text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
                onClick={() => useStudio.getState().alignLayer(layerId, edge)}
              >
                {icon}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
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
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md ${
        locked ? "text-accent" : "text-text-muted/60 hover:text-text-primary/70"
      } hover:bg-text-primary/5`}
      onClick={() => useStudio.getState().toggleLayerLock(layerId)}
    >
      {locked ? <LockIcon size={13} /> : <LockOpenIcon size={13} />}
    </button>
  );
}

const valueAt = (
  track: Track,
  state: Transform,
  target: KeyTarget,
  prop: keyof Transform,
): number => (hasKeyframes(track, target) ? state[prop] : track.layer.base[prop]);

/**
 * What is being done to the element: where it sits and which way it faces.
 *
 * Size and opacity used to live here too. They moved up to the element's own section
 * — they describe the thing rather than the motion, and a panel that says so is a
 * panel you can read without knowing which is which.
 */
function BaseTransform({
  track,
  state,
  activeKeyframes,
}: {
  track: Track;
  state: Transform;
  activeKeyframes: KeyTarget | null;
}) {
  const { id, separatePosition } = track.layer;
  const separate = Boolean(separatePosition);
  const set = (patch: Partial<Transform>) =>
    useStudio.getState().captureTransform(id, patch);
  const posX = valueAt(track, state, separate ? "x" : "position", "x");
  const posY = valueAt(track, state, separate ? "y" : "position", "y");

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
      value={posX}
      onChange={(v) => set(separate ? { x: v } : { x: v, y: posY })}
      join={join}
    />
  );
  const y = (join?: Join) => (
    <NumberField
      label="Y"
      value={posY}
      onChange={(v) => set(separate ? { y: v } : { x: posX, y: v })}
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
            value={valueAt(track, state, "rotation", "rotation")}
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
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md ${
        separate
          ? "bg-accent/10 text-accent"
          : "text-text-muted/60 hover:bg-text-primary/5 hover:text-text-primary/70"
      }`}
      onClick={() =>
        useStudio.getState().setSeparatePosition(layerId, !separate)
      }
    >
      <SplitIcon size={14} />
    </button>
  );
}

function TextSection({ layerId, source }: { layerId: string; source: TextSource }) {
  const fonts = useStudio((s) => s.fonts);
  const [fontSearch, setFontSearch] = useState("");
  const [fontOpen, setFontOpen] = useState(false);
  const fontBtnRef = useRef<HTMLButtonElement>(null);
  const fontListRef = useRef<HTMLDivElement>(null);
  // Only the last pick of each kind applies, however late an earlier one arrives.
  const latest = useRef({ font: 0, weight: 0 });
  const hoverTimer = useRef<number>(undefined);

  const set = (patch: Partial<TextSource>) =>
    useStudio.getState().setTextProp(layerId, patch);

  const filtered = fontSearch
    ? fonts.filter((f) => f.family.toLowerCase().includes(fontSearch.toLowerCase()))
    : fonts;

  const shown = filtered.slice(0, 50);
  useEffect(() => {
    ensureFontPreview(source.fontFamily);
    if (fontOpen) shown.forEach((f) => ensureFontPreview(f.family));
  }, [fontOpen, source.fontFamily, fontSearch, fonts]);

  const weights = fonts.find((f) => f.family === source.fontFamily)?.variants ?? [];
  const weightOptions = weights
    .map((v) => {
      const n = v === "regular" ? 400 : v === "italic" ? 400 : parseInt(v, 10);
      return isNaN(n) ? null : n;
    })
    .filter((n): n is number => n !== null)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);

  return (
    <>
      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Font</p>
        <div className="relative mb-1">
          <button
            ref={fontBtnRef}
            type="button"
            className={`${BOX} w-full justify-between`}
            onClick={() => setFontOpen(!fontOpen)}
            onKeyDown={(e) => {
              if (!fontOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setFontOpen(true);
              }
            }}
          >
            <span
              className="min-w-0 truncate text-[12px] text-text-primary"
              style={{ fontFamily: faceOf(source.fontFamily) }}
            >
              {source.fontFamily}
            </span>
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`shrink-0 text-text-muted transition-transform ${fontOpen ? "rotate-180" : ""}`}
            />
          </button>
          {fontOpen ? (
            <div
              ref={fontListRef}
              className="absolute left-0 top-full z-20 mt-0.5 flex max-h-[200px] w-full flex-col overflow-hidden rounded-md border border-border bg-bg shadow-lg"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setFontOpen(false);
                  fontBtnRef.current?.focus();
                } else stepFocus(e, fontListRef.current, "input, button");
              }}
            >
              <input
                autoFocus
                className={`${INPUT} border-b border-border px-2 py-1`}
                placeholder="Search fonts…"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
              />
              <div className="overflow-y-auto">
                {shown.map((f) => (
                  <button
                    key={f.family}
                    type="button"
                    className={`block w-full px-2 py-1 text-left text-[13px] outline-none hover:bg-text-primary/5 focus-visible:bg-text-primary/10 ${
                      f.family === source.fontFamily ? "bg-accent/10 text-accent" : "text-text-primary"
                    }`}
                    onPointerEnter={() => {
                      window.clearTimeout(hoverTimer.current);
                      // Rows swept past on the way down are not fetched.
                      hoverTimer.current = window.setTimeout(
                        () => void getFont(f.family, source.fontWeight).catch(() => {}),
                        150,
                      );
                    }}
                    onPointerLeave={() => window.clearTimeout(hoverTimer.current)}
                    onClick={() => {
                      // The font is applied once it has arrived, so the element and these
                      // fields change once, not through a stretch with no font at all.
                      const pick = ++latest.current.font;
                      void getFont(f.family, source.fontWeight)
                        .catch(() => {})
                        .then(() => {
                          if (latest.current.font === pick) set({ fontFamily: f.family });
                        });
                      setFontOpen(false);
                      setFontSearch("");
                    }}
                  >
                    <span style={{ fontFamily: faceOf(f.family) }}>{f.family}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {weightOptions.length > 1 ? (
          <div className="mb-1">
            <SelectField
              label="Weight"
              value={String(source.fontWeight)}
              onChange={(v) => {
                const pick = ++latest.current.weight;
                void getFont(source.fontFamily, Number(v))
                  .catch(() => {})
                  .then(() => {
                    if (latest.current.weight === pick) set({ fontWeight: Number(v) });
                  });
              }}
              options={weightOptions.map((w) => ({
                value: String(w),
                label: weightName(w),
              }))}
            />
          </div>
        ) : null}

        <div className="mb-1 grid grid-cols-2 gap-x-1.5">
          <NumberField
            label="Size"
            value={source.fontSize}
            step={1}
            min={1}
            onChange={(v) => set({ fontSize: v })}
          />
          <NumberField
            label="LH"
            title="Line height"
            value={source.lineHeight}
            step={0.05}
            min={0.5}
            max={4}
            onChange={(v) => set({ lineHeight: v })}
          />
        </div>
        <div className="mb-1 grid grid-cols-2 gap-x-1.5">
          <NumberField
            label="LS"
            title="Letter spacing"
            value={source.letterSpacing}
            step={0.5}
            onChange={(v) => set({ letterSpacing: v })}
          />
        </div>

        <p className={`${SUBLABEL} mb-1 mt-2`}>Align</p>
        <div className="mb-1">
          <Segmented
            value={source.align}
            options={(["left", "center", "right"] as const).map((a) => ({
              value: a,
              label: `Align ${a}`,
              content: <TextAlignIcon align={a} />,
            }))}
            onChange={(align) => set({ align })}
          />
        </div>
      </section>

      <section className={SECTION}>
        <p className={`${SUBLABEL} mb-1`}>Fill</p>
        <div className="mb-1 flex">
          <ColorField
            label="fill"
            color={source.fill.color}
            opacity={source.fill.opacity}
            onColor={(color) => set({ fill: { ...source.fill, color } })}
            onOpacity={(opacity) => set({ fill: { ...source.fill, opacity } })}
          />
        </div>
      </section>

      <section className={SECTION}>
        <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <input
            type="checkbox"
            checked={source.perCharacter}
            className="accent-accent"
            onChange={(e) => set({ perCharacter: e.target.checked })}
          />
          Per character
        </label>
        {source.perCharacter ? (
          <p className="mt-1 text-[10px] text-text-muted/60">
            Each character is a clone instance
          </p>
        ) : null}
      </section>
    </>
  );
}
