import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Transform } from "../core/types";
import type { Stop } from "../core/curve";
import { sampleStops } from "../core/curve";
import { clamp } from "../core/math";
import { renderState } from "../core/renderState";
import { Preview } from "../render/preview";
import { useStudio } from "./store";
import { ChevronIcon, NumberField } from "./fields";
import { entryId } from "./keyframeLog";
import {
  PROP_COLOR,
  PROP_STEP,
  PROP_TEXT,
  SAME_STOP,
  baseValue,
  layerName,
  positionSets,
  samePart,
  secondsToT,
  slideRange,
  slideStops,
  stopAtTime,
  stretchStops,
  trackBlocks,
  trimRange,
  type BlockView,
  type KeyProp,
  type Range,
} from "./modules";
import {
  PROPERTY_HEIGHT,
  RULER_HEIGHT,
  TRACK_HEIGHT,
  clampDuration,
  formatTime,
  spanPx,
  ticks,
  timeToX,
  xToTime,
  type Unit,
} from "./ruler";

export function Timeline() {
  const composition = useStudio((s) => s.composition);
  const assets = useStudio((s) => s.assets);
  const t = useStudio((s) => s.t);
  const playing = useStudio((s) => s.playing);
  const loop = useStudio((s) => s.loop);
  const expanded = useStudio((s) => s.expandedTracks);
  const selectedId = useStudio((s) => s.selectedId);
  const driver = composition.driver.kind;

  const areaRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<Preview | null>(null);
  const scrubRef = useRef<number | null>(null);
  const durationRef = useRef<{
    pointerId: number;
    fromX: number;
    startDuration: number;
    perPx: number;
  } | null>(null);
  const [width, setWidth] = useState(0);
  const [unit, setUnit] = useState<Unit>("s");

  const { duration } = composition;

  // One clock for the whole studio: `Preview` owns the rAF loop and writes every
  // tick into the store, which is what the canvas renders from.
  useEffect(() => {
    const preview = new Preview(null, useStudio.getState().composition);
    preview.t = useStudio.getState().t;
    preview.loop = useStudio.getState().loop;
    preview.onTick = (next) => useStudio.getState().setT(next);
    preview.onEnd = () => useStudio.getState().setPlaying(false);
    previewRef.current = preview;
    return () => {
      preview.pause();
      preview.onTick = undefined;
      preview.onEnd = undefined;
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewRef.current?.setComposition(composition);
  }, [composition]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.loop = loop;
  }, [loop]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    if (playing) preview.play();
    else preview.pause();
  }, [playing]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marks = useMemo(() => ticks(duration, width, unit), [duration, width, unit]);
  const playheadX = timeToX(t, width);

  /** Every seek goes through the preview, so its clock and the store never diverge. */
  const seek = (next: number) => {
    const preview = previewRef.current;
    if (preview) preview.seek(next);
    else useStudio.getState().setT(next);
  };

  const scrubTo = (clientX: number) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    seek(xToTime(clientX - rect.left, rect.width));
  };

  const beginScrub = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    scrubRef.current = e.pointerId;
    scrubTo(e.clientX);
  };

  const moveScrub = (e: ReactPointerEvent<HTMLElement>) => {
    if (scrubRef.current !== e.pointerId) return;
    scrubTo(e.clientX);
  };

  const endScrub = (e: ReactPointerEvent<HTMLElement>) => {
    if (scrubRef.current !== e.pointerId) return;
    scrubRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onDurationDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    // Seconds per pixel is read once, so the drag keeps the feel it started with
    // even as the ruler rescales underneath it.
    durationRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      startDuration: duration,
      perPx: spanPx(width) > 0 ? duration / spanPx(width) : 0,
    };
  };

  const onDurationMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = durationRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    useStudio
      .getState()
      .setDuration(drag.startDuration + (e.clientX - drag.fromX) * drag.perPx);
  };

  const onDurationUp = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = durationRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    durationRef.current = null;
    // The trim was one edit, however many frames it took.
    useStudio.getState().sealHistory();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // What every element reads at the playhead right now, evaluated once for the whole
  // strip rather than per property row.
  const states = useMemo(() => {
    const out = new Map<string, Transform>();
    for (const item of renderState(composition, t)) out.set(item.id, item.state);
    return out;
  }, [composition, t]);

  const rows = composition.tracks.map((track, i) => {
    const asset =
      track.layer.source.kind === "image"
        ? assets.find((a) => a.id === track.layer.source.value)
        : undefined;
    const blocks = trackBlocks(track);
    return {
      track,
      id: track.layer.id,
      name: layerName(track.layer, asset?.name, i),
      given: track.layer.name ?? "",
      blocks,
      open: expanded.includes(track.layer.id) && blocks.length > 0,
    };
  });

  return (
    <div className="timeline" aria-label="timeline">
      <div className="timeline-transport">
        <button
          type="button"
          className="transport-btn"
          aria-label={playing ? "pause" : "play"}
          title={playing ? "pause" : "play"}
          aria-pressed={playing}
          onClick={() => useStudio.getState().setPlaying(!playing)}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className={`transport-btn${loop ? " is-on" : ""}`}
          aria-label="loop"
          title="loop"
          aria-pressed={loop}
          onClick={() => useStudio.getState().toggleLoop()}
        >
          <LoopIcon />
        </button>
        <Readout
          time={t * duration}
          duration={duration}
          unit={unit}
          onToggleUnit={() => setUnit((u) => (u === "s" ? "ms" : "s"))}
        />
        <span className="transport-spacer" />
        <button
          type="button"
          className="driver-pill"
          title={`driver: ${driver}`}
          onClick={() =>
            useStudio.getState().setDriver(driver === "time" ? "input" : "time")
          }
        >
          {driver}
        </button>
      </div>

      <div className="timeline-body">
        <div className="timeline-gutter">
          <div className="timeline-gutter-head" style={{ height: RULER_HEIGHT }} />
          {rows.map((row) => (
            <Fragment key={row.id}>
              <TrackLabel
                layerId={row.id}
                name={row.name}
                given={row.given}
                blocks={row.blocks.length}
                open={row.open}
                selected={row.id === selectedId}
              />
              {row.open
                ? row.blocks.map((block) => (
                    <PropertyLabel
                      key={blockKey(block)}
                      layerId={row.id}
                      block={block}
                      state={states.get(row.id)}
                    />
                  ))
                : null}
            </Fragment>
          ))}
        </div>

        <div className="timeline-area" ref={areaRef}>
          <div
            className="timeline-ruler"
            style={{ height: RULER_HEIGHT }}
            onPointerDown={beginScrub}
            onPointerMove={moveScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          >
            {marks.map((mark) => (
              <div
                key={mark.x}
                className={`ruler-tick${mark.label ? " is-major" : ""}`}
                style={{ left: mark.x }}
              >
                {mark.label ? (
                  <span className="ruler-label">{mark.label}</span>
                ) : null}
              </div>
            ))}
            {/* Sits on the ruler's end, which is where the composition stops. */}
            <button
              type="button"
              className="duration-handle"
              title="drag to set duration"
              aria-label={`Duration ${clampDuration(duration).toFixed(1)}s, drag to set duration`}
              onPointerDown={onDurationDown}
              onPointerMove={onDurationMove}
              onPointerUp={onDurationUp}
              onPointerCancel={onDurationUp}
            />
          </div>

          <div className="timeline-lanes">
            {rows.map((row) => (
              <Fragment key={row.id}>
                {/* The element's own lane stays clear whether or not it is open. An
                    element is not a property and has no motion of its own to draw;
                    what it has is the rows underneath. */}
                <div
                  className={`relative border-b border-[#f0f0f0] ${
                    row.id === selectedId ? "bg-[#eef4fb]" : "bg-[#fafafa]"
                  }`}
                  style={{ height: TRACK_HEIGHT }}
                />
                {row.open
                  ? row.blocks.map((block) => (
                      <div
                        key={blockKey(block)}
                        className="relative border-b border-[#f0f0f0] bg-white"
                        style={{ height: PROPERTY_HEIGHT }}
                      >
                        {block.standalone ? (
                          <KeyframeTrack layerId={row.id} block={block} width={width} />
                        ) : (
                          <ModuleBlock layerId={row.id} block={block} width={width} />
                        )}
                      </div>
                    ))
                  : null}
              </Fragment>
            ))}
          </div>

          <div
            className="timeline-playhead"
            style={{ transform: `translateX(${playheadX}px)` }}
          >
            <span
              className="playhead-grab"
              role="slider"
              tabIndex={0}
              aria-label="playhead"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={Number((t * duration).toFixed(2))}
              aria-valuetext={`${formatTime(t * duration, unit)}${unit}`}
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
            />
            <span className="playhead-line" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A block's identity inside its element: the property it animates, or the module's
 *  place on the stack. The gutter row and the lane beside it share it. */
const blockKey = (block: BlockView): string =>
  block.part.kind === "keyframes"
    ? `keyframes:${block.part.property}`
    : `module:${block.part.index}`;

/**
 * An element's name, in the gutter beside its lane. This is the only place a name is
 * edited: the track already says what the element is called, so double-clicking it is
 * where a rename belongs. Enter or clicking away keeps the new name, Escape drops it,
 * and an empty name falls back to the asset's filename.
 */
function TrackLabel({
  layerId,
  name,
  given,
  blocks,
  open,
  selected,
}: {
  layerId: string;
  name: string;
  given: string;
  blocks: number;
  open: boolean;
  selected: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === given.trim()) return;
    useStudio.getState().renameLayer(layerId, draft.trim());
    useStudio.getState().sealHistory();
  };

  return (
    <div
      className={`timeline-track-label${selected ? " is-selected" : ""}`}
      style={{ height: TRACK_HEIGHT }}
      title={draft === null ? `${name} — double-click to rename` : undefined}
      onDoubleClick={() => setDraft(given)}
    >
      {/* The twisty keeps its slot whether or not there is anything under it, so the
          names stay in one column down the gutter. */}
      {blocks > 0 ? (
        <button
          type="button"
          className={`timeline-twisty${open ? " is-open" : ""}`}
          aria-expanded={open}
          aria-label={open ? `collapse ${name}` : `expand ${name}`}
          title={open ? "collapse" : "expand"}
          onClick={() => useStudio.getState().toggleTrackExpanded(layerId)}
        >
          <ChevronIcon />
        </button>
      ) : (
        <span className="timeline-twisty is-empty" aria-hidden="true" />
      )}
      {draft === null ? (
        <button
          type="button"
          className="timeline-track-name"
          aria-pressed={selected}
          onClick={() => useStudio.getState().select(layerId)}
        >
          {name}
        </button>
      ) : (
        <input
          autoFocus
          className="min-w-0 flex-1 rounded-[3px] border border-[#0d99ff] bg-white px-1 py-px text-[11px] text-[#111] outline-none"
          aria-label="element name"
          value={draft}
          placeholder={name}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            // Escape leaves the name alone — nothing was written until now.
            if (e.key === "Escape") setDraft(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}

/**
 * One property of an element, in the gutter beside the row its block is drawn on.
 *
 * Everything on the row answers to the playhead: the diamond says whether there is a
 * keyframe under it and puts one there or takes it away, and the value says what the
 * property reads there and writes a keyframe when it is changed. A keyframed property
 * has no value apart from its curve, so editing one here is authoring a keyframe —
 * there is nothing else the number could mean.
 */
function PropertyLabel({
  layerId,
  block,
  state,
}: {
  layerId: string;
  block: BlockView;
  state: Transform | undefined;
}) {
  const selected = useStudio(
    (s) => s.selectedId === layerId && samePart(s.selectedPart, block.part),
  );
  const target = block.prop;
  const axes: ("x" | "y")[] = target === "position" ? ["x", "y"] : ["x"];

  /** What the property reads at the playhead — the curve's own answer, so the row
   *  agrees with the frame on the canvas. */
  const read = (axis: "x" | "y"): number => {
    if (!state) return 0;
    if (target === "position") return axis === "x" ? state.x : state.y;
    return baseValue(state, target as KeyProp);
  };

  /** One write for both jobs: the edited axis takes the new value and every other
   *  axis takes what it already reads, which is what keeps a position in lockstep. */
  const write = (axis: "x" | "y", v: number) => {
    const store = useStudio.getState();
    const track = store.composition.tracks.find((tr) => tr.layer.id === layerId);
    if (!track) return;
    const span = store.composition.duration;
    const position = target === "position" ? positionSets(track) : null;
    if (position) {
      const local = clamp(secondsToT(store.t * span, position.x.range, span), 0, 1);
      store.setPositionStops(layerId, {
        x: stopAtTime(position.x.stops, local, axis === "x" ? v : read("x")),
        y: stopAtTime(position.y.stops, local, axis === "y" ? v : read("y")),
      });
      return;
    }
    const set = track.keyframes?.[target as KeyProp];
    if (!set) return;
    const local = clamp(secondsToT(store.t * span, set.range, span), 0, 1);
    store.setKeyframeStops(layerId, target as KeyProp, stopAtTime(set.stops, local, v));
  };

  return (
    <div
      className={`timeline-property-label${selected ? " is-selected" : ""}`}
      style={{ height: PROPERTY_HEIGHT }}
    >
      <button
        type="button"
        className="timeline-property-name"
        aria-pressed={selected}
        title={`${block.label} — click to select`}
        onClick={() =>
          useStudio.getState().selectPart(layerId, selected ? null : block.part)
        }
      >
        {block.label}
      </button>
      {/* A module is a packaged curve, not a property with a value to key here. */}
      {block.standalone ? (
        <div className="flex min-w-0 shrink-0 items-center gap-0.5">
          {axes.map((axis) => (
            <div key={axis} className={axes.length > 1 ? "w-[42px]" : "w-[58px]"}>
              <NumberField
                label=""
                title={`${block.label}${axes.length > 1 ? ` ${axis}` : ""} at the playhead — editing it writes a keyframe there`}
                value={read(axis)}
                step={PROP_STEP[target]}
                compact
                onChange={(v) => write(axis, v)}
              />
            </div>
          ))}
        </div>
      ) : (
        <span className="ml-auto pr-1 text-[10px] text-[#b0b0b0]">module</span>
      )}
    </div>
  );
}

/** Edge grab width, in px. Wide enough to hit, narrow enough to leave a body. */
const EDGE_GRAB = 6;

/** One frozen empty selection, so a block with nothing picked reads the same array
 *  every render rather than a new one the store would call a change. */
const EMPTY_KEYS: string[] = [];

/** Past this many pixels a press was a drag; under it, it was a click on whatever it
 *  landed on. */
const DRAG_SLOP = 3;

/** The bar between the first keyframe and the last, and the diamonds riding it. */
const BAR_HEIGHT = 10;
const DIAMOND = 9;

/**
 * An element's property, drawn as what it actually is: a row of moments.
 *
 * One keyframe is a diamond and nothing else — there is no span yet, because nothing
 * has been animated. A second keyframe is what makes a span, so that is when the bar
 * between them is drawn, and from then on the bar is the motion: drag its body to
 * move the whole thing in time, drag an end to stretch it. A block spanning the whole
 * composition from a single keyframe said an animation was there before one was.
 */
function KeyframeTrack({
  layerId,
  block,
  width,
}: {
  layerId: string;
  block: BlockView;
  width: number;
}) {
  const selected = useStudio(
    (s) => s.selectedId === layerId && samePart(s.selectedPart, block.part),
  );
  const picked = useStudio((s) => (s.selectedId === layerId ? s.selectedKeys : EMPTY_KEYS));
  const dragRef = useRef<StopDrag | null>(null);
  const prop = block.prop;
  const [from, to] = block.range;
  const span = to - from;

  /** A stop's time over the whole composition. Stops are stored as a share of their
   *  own block, and the ruler measures the composition. */
  const absolute = (t: number): number => from + t * span;
  const xOf = (t: number): number => timeToX(absolute(t), width);

  const stops = block.stops;
  const last = stops.length - 1;
  const stretched = stops.length > 1;

  const writeStops = (next: Stop[]) => {
    const store = useStudio.getState();
    if (block.part.kind !== "keyframes") return;
    const property = block.part.property;
    if (property === "position") {
      const track = store.composition.tracks.find((tr) => tr.layer.id === layerId);
      const position = track ? positionSets(track) : null;
      if (!position) return;
      // Times are shared between the axes; only the values differ, so y takes x's
      // new times and keeps its own values.
      store.setPositionStops(layerId, {
        x: next,
        y: next.map((st, i) => ({ ...st, v: position.y.stops[i]?.v ?? st.v })),
      });
      return;
    }
    store.setKeyframeStops(layerId, property as KeyProp, next);
  };

  /** Pixels to a share of this block, which is what a stop's time is measured in. */
  const perPx = (dx: number): number => {
    const across = spanPx(width) * span;
    return across < 1 ? 0 : dx / across;
  };

  const beginDrag = (e: ReactPointerEvent<HTMLElement>, grab: StopDrag["grab"]) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    useStudio.getState().selectPart(layerId, block.part);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      grab,
      start: stops,
      moved: false,
    };
  };

  const onDragMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.fromX;
    if (!drag.moved && Math.abs(dx) < DRAG_SLOP) return;
    drag.moved = true;
    const delta = perPx(dx);
    const grab = drag.grab;
    if (grab.kind === "body") {
      writeStops(slideStops(drag.start, delta));
      return;
    }
    if (grab.kind === "end") {
      // The far end is the anchor: the set keeps its shape and changes its span.
      const anchor = drag.start[grab.index === 0 ? drag.start.length - 1 : 0].t;
      const held = drag.start[grab.index].t;
      writeStops(stretchStops(drag.start, anchor, held, held + delta));
      return;
    }
    // A keyframe in the middle moves alone, and stays between its neighbours — a
    // drag past one is a slip, not a request to reorder the curve.
    const i = grab.index;
    const lo = drag.start[i - 1].t + SAME_STOP;
    const hi = drag.start[i + 1].t - SAME_STOP;
    writeStops(
      drag.start.map((st, k) =>
        k === i ? { ...st, t: clamp(st.t + delta, lo, hi) } : st,
      ),
    );
  };

  const onDragEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // A press that never moved was a click on whatever it landed on.
    if (!drag.moved && drag.grab.kind !== "body") {
      const store = useStudio.getState();
      store.selectKey(layerId, entryId(prop, drag.grab.index), e.shiftKey || e.metaKey);
      return;
    }
    // One drag, one undo step — closed here so the next drag starts a new one.
    useStudio.getState().sealHistory();
  };

  /** A keyframe holding what the property already reads, at the time double-clicked.
   *  The one way to write a pause into a curve without touching its values. */
  const addAt = (clientX: number, lane: HTMLElement) => {
    const store = useStudio.getState();
    const rect = lane.getBoundingClientRect();
    const t = xToTime(clientX - rect.left, rect.width);
    const local = clamp(span <= 0 ? 0 : (t - from) / span, 0, 1);
    writeStops(stopAtTime(stops, local, sampleStops(stops, local)));
    store.sealHistory();
  };

  return (
    <div
      className="absolute inset-0"
      onDoubleClick={(e) => addAt(e.clientX, e.currentTarget)}
    >
      {/* Only once there are two: a bar is the span between keyframes, and one
          keyframe has no span. */}
      {stretched ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${block.label} keyframes`}
          aria-pressed={selected}
          className={`absolute top-1/2 -translate-y-1/2 touch-none rounded-full border ${
            PROP_TEXT[prop]
          } ${selected ? "border-current bg-current" : "border-current bg-transparent"}`}
          style={{
            left: xOf(stops[0].t),
            width: Math.max(2, xOf(stops[last].t) - xOf(stops[0].t)),
            height: BAR_HEIGHT,
          }}
          onPointerDown={(e) => beginDrag(e, { kind: "body", index: -1 })}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
      ) : null}

      {stops.map((stop, i) => {
        const on = picked.includes(entryId(prop, i));
        const end = stretched && (i === 0 || i === last);
        return (
          <button
            key={i}
            type="button"
            aria-label={`${block.label} keyframe ${i + 1} of ${stops.length}`}
            aria-pressed={on}
            // Picked reads on both grounds: filled, it stands out against the white
            // lane, and the halo keeps it visible on a selected bar of its own colour.
            className={`absolute top-1/2 touch-none border p-0 ${PROP_TEXT[prop]} ${
              on ? "border-current bg-current ring-2 ring-white" : "border-current bg-white"
            }`}
            style={{
              left: xOf(stop.t),
              width: DIAMOND,
              height: DIAMOND,
              // Rotated, so the translate has to happen before the turn does.
              transform: "translate(-50%, -50%) rotate(45deg)",
            }}
            onPointerDown={(e) =>
              beginDrag(e, { kind: end ? "end" : "middle", index: i })
            }
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          />
        );
      })}
    </div>
  );
}

/** What a press on a keyframe track grabbed. `body` is the bar between the ends. */
type StopDrag = {
  pointerId: number;
  fromX: number;
  grab: { kind: "body" | "end" | "middle"; index: number };
  start: Stop[];
  moved: boolean;
};

/** Which edge of a module a drag grabbed. The body slides the window; an edge trims it. */
type BlockDrag = { pointerId: number; fromX: number; start: Range; edge: "start" | "end" | null };

/**
 * A module's window, drawn in its property's row.
 *
 * A module is a span by nature — a packaged curve with a start and an end — so it
 * stays a solid block with its stops marked on it, and keeps the trim and slide it
 * always had. What it is not is a list of moments to pick apart: its stops are its
 * parameters, and they are edited where the module is.
 */
function ModuleBlock({
  layerId,
  block,
  width,
}: {
  layerId: string;
  block: BlockView;
  width: number;
}) {
  const selected = useStudio(
    (s) => s.selectedId === layerId && samePart(s.selectedPart, block.part),
  );
  const dragRef = useRef<BlockDrag | null>(null);
  const prop = block.prop;
  const left = timeToX(block.range[0], width);
  const right = timeToX(block.range[1], width);

  const writeRange = (range: Range) => {
    if (block.part.kind === "module") {
      useStudio.getState().setModuleRange(layerId, block.part.index, range);
    }
  };

  const edgeAt = (e: ReactPointerEvent<HTMLElement>): "start" | "end" | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left <= EDGE_GRAB) return "start";
    if (rect.right - e.clientX <= EDGE_GRAB) return "end";
    return null;
  };

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    useStudio.getState().selectPart(layerId, block.part);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      start: block.range,
      edge: edgeAt(e),
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      e.currentTarget.style.cursor = edgeAt(e) ? "ew-resize" : "default";
      return;
    }
    if (drag.pointerId !== e.pointerId || spanPx(width) < 1) return;
    const delta = (e.clientX - drag.fromX) / spanPx(width);
    const next = drag.edge
      ? trimRange(drag.start, drag.edge, drag.start[drag.edge === "start" ? 0 : 1] + delta)
      : slideRange(drag.start, delta);
    writeRange(next);
  };

  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    useStudio.getState().sealHistory();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${block.label} module`}
      aria-pressed={selected}
      className={`absolute top-1/2 -translate-y-1/2 touch-none overflow-hidden rounded-[4px] border ${
        PROP_COLOR[prop]
      } ${selected ? "ring-2 ring-current" : ""}`}
      style={{
        left,
        width: Math.max(2, right - left),
        height: BAR_HEIGHT + 6,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-current opacity-25" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-current opacity-25" />
      {block.stops.map((stop, i) => (
        <span
          key={i}
          className="pointer-events-none absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-current bg-white"
          style={{ left: `calc(${stop.t * 100}% + ${(0.5 - stop.t) * 9}px)` }}
        />
      ))}
    </div>
  );
}

/**
 * Current time, composition length, and the unit both read in — one control, with
 * the unit switch set apart because it changes what the other two mean.
 */
function Readout({
  time,
  duration,
  unit,
  onToggleUnit,
}: {
  time: number;
  duration: number;
  unit: Unit;
  onToggleUnit: () => void;
}) {
  const name = unit === "s" ? "seconds" : "milliseconds";
  return (
    <div className="transport-readout">
      <div className="readout-fields">
        <span className="readout-cell" title="current time">
          {formatTime(time, unit)}
        </span>
        <span className="readout-cell is-muted" title="duration">
          {formatTime(duration, unit)}
        </span>
      </div>
      <button
        type="button"
        className="readout-unit"
        title={name}
        aria-label={`readout unit: ${name}`}
        onClick={onToggleUnit}
      >
        {unit}
      </button>
    </div>
  );
}

/** Lucide `play` / `pause` / `repeat`, inlined to match the rest of the studio chrome. */
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5 19 12 7 19.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
