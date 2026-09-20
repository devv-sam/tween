import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Transform } from "../core/types";
import type { Stop } from "../core/curve";
import { clamp } from "../core/math";
import { renderState } from "../core/renderState";
import { Preview } from "../render/preview";
import { designSizeOf, useStudio } from "./store";
import { ChevronIcon, GHOST_BTN, NumberField } from "./fields";
import { entryId } from "./keyframeLog";
import {
  PROP_COLOR,
  PROP_STEP,
  PROP_TEXT,
  SAME_STOP,
  baseValue,
  fromDisplay,
  hasSpan,
  layerName,
  positionSets,
  samePart,
  secondsToT,
  slideRange,
  slideStops,
  stopAtTime,
  toDisplay,
  stretchStops,
  trackBlocks,
  trackSpan,
  trimRange,
  type BlockView,
  type DesignSize,
  type KeyProp,
  type TrackProp,
  type Range,
} from "./modules";
import {
  linkedFamilies,
  linkedMotion,
  motionKey,
  railCaps,
  type LinkGroup,
  type RailCap,
} from "./linked";
import {
  MAX_DURATION,
  MIN_DURATION,
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
  const collapsed = useStudio((s) => s.collapsedTracks);
  const selectedIds = useStudio((s) => s.selectedIds);

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
  // The set of curves being pointed at, by the key they all share. Held here rather
  // than per row, because the point of it is to light up the rows somewhere else.
  const [hotLink, setHotLink] = useState<string | null>(null);
  const enterLink = (key: string) => setHotLink(key);
  // Only the row that lit it puts it out. Moving from a gutter row onto its own lane
  // fires the leave after the enter, and unguarded that would blink the set off.
  const leaveLink = (key: string) =>
    setHotLink((lit) => (lit === key ? null : lit));

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
  /** One frame as a share of the composition, which is the step a retime moves by. */
  const frameT = 1 / Math.max(1, Math.round(duration * composition.fps));
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

  // Only what animates: being on the canvas is not a reason to hold a lane here.
  const rows = composition.tracks
    .map((track, i) => {
      const asset =
        track.layer.source.kind === "image"
          ? assets.find((a) => a.id === track.layer.source.value)
          : undefined;
      const blocks = trackBlocks(track);
      return {
        track,
        id: track.layer.id,
        name: layerName(track.layer, asset?.name, i),
        size: designSizeOf(assets, track.layer),
        given: track.layer.name ?? "",
        blocks,
        open: blocks.length > 0 && !collapsed.includes(track.layer.id),
      };
    })
    .filter((row) => row.blocks.length > 0);

  // Which curves are running in lockstep, read back off the composition every render
  // rather than recorded when they were made. Cheap enough at this size, and it can
  // never be out of date with what the rows are actually drawing.
  const groups = linkedMotion(rows);
  const groupByKey = new Map(groups.map((g) => [g.key, g]));
  const families = linkedFamilies(groups);
  const linkOf = (block: BlockView): LinkGroup | undefined =>
    groupByKey.get(motionKey(block));

  /** The gutter, flattened: one entry per row it draws, in the order it draws them,
   *  so the rail can see which rows sit next to which. An entry with no block is the
   *  element's own row, and `last` is where the branch line under an element stops. */
  const gutter = rows.flatMap((row) => [
    { row, block: null as BlockView | null, last: false },
    ...(row.open
      ? row.blocks.map((block, i) => ({
          row,
          block,
          last: i === row.blocks.length - 1,
        }))
      : []),
  ]);
  const caps = railCaps(
    gutter.map((it) => ({ id: it.row.id })),
    families,
  );

  // Delete here takes away motion, never the element — so the event is stopped even
  // when nothing was picked, or the canvas' handler would find an element to remove.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    e.stopPropagation();
    const store = useStudio.getState();
    if (store.selectedKeys.length > 0) store.removeSelectedKeys();
    else if (store.selectedPart) store.removeSelectedPart();
  };

  return (
    <div className="timeline" aria-label="timeline" onKeyDown={onKeyDown}>
      {/* `rtl` is what puts the scrollbar on the gutter's side; children stay `ltr`. */}
      <div className="timeline-body [direction:rtl] [scrollbar-color:#d8d8d8_transparent] [scrollbar-width:thin] [&>*]:[direction:ltr]">
        {/* Pinned inside the scroller, not above it, so the head and the rows are
            measured against the same box and ticks stay over their keyframes. */}
        <div className="timeline-head" style={{ height: RULER_HEIGHT }}>
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
              onSeek={(seconds) => seek(clamp(seconds / duration, 0, 1))}
              onToggleUnit={() => setUnit((u) => (u === "s" ? "ms" : "s"))}
            />
          </div>

          <div
            className="timeline-ruler"
            ref={areaRef}
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
              title="drag to set duration, double-click to trim"
              aria-label={`Duration ${clampDuration(duration).toFixed(1)}s, drag to set duration, double-click to trim to the last keyframe`}
              onPointerDown={onDurationDown}
              onDoubleClick={() => useStudio.getState().trimDurationToContent()}
              onPointerMove={onDurationMove}
              onPointerUp={onDurationUp}
              onPointerCancel={onDurationUp}
            />
            <span
              className="playhead-grab"
              role="slider"
              tabIndex={0}
              aria-label="playhead"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={Number((t * duration).toFixed(2))}
              aria-valuetext={`${formatTime(t * duration, unit)}${unit}`}
              style={{ transform: `translateX(${playheadX}px)` }}
              onPointerDown={beginScrub}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
              onPointerCancel={endScrub}
            />
          </div>
        </div>

        <div className="timeline-rows">
          <div className="timeline-gutter">
            {gutter.map((item, i) =>
              item.block === null ? (
                <TrackLabel
                  key={item.row.id}
                  layerId={item.row.id}
                  name={item.row.name}
                  given={item.row.given}
                  blocks={item.row.blocks.length}
                  open={item.row.open}
                  selected={selectedIds.includes(item.row.id)}
                  rail={caps[i]}
                />
              ) : (
                <PropertyLabel
                  key={`${item.row.id}:${blockKey(item.block)}`}
                  layerId={item.row.id}
                  block={item.block}
                  state={states.get(item.row.id)}
                  size={item.row.size}
                  rail={caps[i]}
                  last={item.last}
                  link={linkOf(item.block)}
                  hot={hotLink === motionKey(item.block)}
                  onEnter={enterLink}
                  onLeave={leaveLink}
                />
              ),
            )}
          </div>

          <div className="timeline-area">
            <div className="timeline-lanes">
              {rows.map((row) => (
                <Fragment key={row.id}>
                  {/* An element has no motion of its own — what it has is the rows
                      underneath, and this is the handle for all of them at once. */}
                  <div
                    className={`timeline-lane is-track${
                      selectedIds.includes(row.id) ? " is-selected" : ""
                    }`}
                    style={{ height: TRACK_HEIGHT }}
                  >
                    <MainBar
                      layerId={row.id}
                      blocks={row.blocks}
                      width={width}
                      selected={selectedIds.includes(row.id)}
                      name={row.name}
                      frame={frameT}
                    />
                  </div>
                  {row.open
                    ? row.blocks.map((block, i) => (
                        <div
                          key={blockKey(block)}
                          className={`timeline-lane is-property${
                            hotLink === motionKey(block) ? " is-linked-hot" : ""
                          }${i === row.blocks.length - 1 ? " is-last" : ""}`}
                          style={{ height: PROPERTY_HEIGHT }}
                          // Pointing at one bar says what it runs with, before anything
                          // is touched — and touching it is what breaks the link.
                          onPointerEnter={() => enterLink(motionKey(block))}
                          onPointerLeave={() => leaveLink(motionKey(block))}
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

            {/* Full height of the rows, not of the window onto them, so any scroll
                position still has the line crossing it. */}
            <span
              className="playhead-line"
              aria-hidden="true"
              style={{ transform: `translateX(${playheadX}px)` }}
            />
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
  rail,
}: {
  layerId: string;
  name: string;
  given: string;
  blocks: number;
  open: boolean;
  selected: boolean;
  /** Where this row sits in the run of elements it runs alongside, or null when it
   *  runs alone. */
  rail: RailCap | null;
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
      <Rail cap={rail} />
      <button
        type="button"
        className={`timeline-twisty${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label={
          open
            ? `collapse ${name}, ${blocks} animated ${blocks === 1 ? "property" : "properties"}`
            : `expand ${name}, ${blocks} animated ${blocks === 1 ? "property" : "properties"}`
        }
        title={open ? "collapse" : "expand"}
        onClick={() => useStudio.getState().toggleTrackExpanded(layerId)}
      >
        <ChevronIcon />
      </button>
      {draft === null ? (
        <button
          type="button"
          className="timeline-track-name"
          aria-pressed={selected}
          // Shift adds or takes back out, the same as it does on the canvas: the
          // gutter and the frame are two views of one selection.
          onClick={(e) => {
            const store = useStudio.getState();
            if (e.shiftKey) store.toggleSelectedId(layerId);
            else store.setSelectedIds([layerId]);
          }}
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
      {!open && draft === null ? (
        <span
          className="timeline-track-count"
          title={`${blocks} animated ${blocks === 1 ? "property" : "properties"}`}
        >
          {blocks}
        </span>
      ) : null}
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
  size,
  rail,
  last,
  link,
  hot,
  onEnter,
  onLeave,
}: {
  layerId: string;
  block: BlockView;
  state: Transform | undefined;
  /** The element at scale 1 — what turns a stored width factor into the pixels the
   *  row shows, so this number and the inspector's agree. */
  size: DesignSize | undefined;
  rail: RailCap | null;
  /** Last in its element's run of properties, where the branch line ends. */
  last: boolean;
  /** The other elements running this same curve, when there are any. */
  link: LinkGroup | undefined;
  /** This curve's set is the one being pointed at, here or on another row. */
  hot: boolean;
  onEnter: (key: string) => void;
  onLeave: (key: string) => void;
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
    return toDisplay(target, baseValue(state, target as KeyProp), size);
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
    const set = track.keyframes?.[target];
    if (!set) return;
    const local = clamp(secondsToT(store.t * span, set.range, span), 0, 1);
    store.setKeyframeStops(
      layerId,
      target as KeyProp | TrackProp,
      stopAtTime(set.stops, local, fromDisplay(target, v, size)),
    );
  };

  return (
    <div
      className={`timeline-property-label${selected ? " is-selected" : ""}${
        hot ? " is-linked-hot" : ""
      }`}
      style={{ height: PROPERTY_HEIGHT }}
      onPointerEnter={() => onEnter(motionKey(block))}
      onPointerLeave={() => onLeave(motionKey(block))}
    >
      <Rail cap={rail} />
      {/* The indent alone is too quiet to say this row belongs to the one above. */}
      <span
        className={`timeline-branch${last ? " is-last" : ""}`}
        aria-hidden="true"
      />
      {/* Never toggles off: that left the element picked and nothing else, so a
          Delete aimed at the property took the element with it. */}
      <button
        type="button"
        className="timeline-property-name"
        aria-pressed={selected}
        title={`${block.label} — click to select`}
        onClick={() => useStudio.getState().selectPart(layerId, block.part)}
      >
        {block.label}
      </button>
      {link ? <LinkMark group={link} /> : null}
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

/**
 * The element's own bar: every curve under it, held as one thing.
 *
 * The rows below are a single performance, so the handle for retiming all of it
 * belongs on the element rather than on any one property. Dragging the body slides
 * every curve by the same amount and leaves the spread between them untouched;
 * dragging an end stretches the whole performance about the other end. The property
 * rows stay editable on their own — this is the coarse handle, not the only one.
 *
 * It is drawn folded or open. Folded it is the only thing left saying when the
 * element moves, and open it is still the thing you reach for first.
 */
function MainBar({
  layerId,
  blocks,
  width,
  selected,
  name,
  frame,
}: {
  layerId: string;
  blocks: BlockView[];
  width: number;
  selected: boolean;
  name: string;
  /** One frame, as a share of the composition — what a retime steps by. */
  frame: number;
}) {
  const dragRef = useRef<MainDrag | null>(null);
  const span = trackSpan(blocks);
  // Nothing under the element has a span yet, so there is nothing for this to be the
  // handle of. It appears with the first skeleton, not with the first keyframe.
  if (span === null || !hasSpan(blocks)) return null;
  const left = timeToX(span[0], width);
  const right = timeToX(span[1], width);

  const edgeAt = (e: ReactPointerEvent<HTMLElement>): "start" | "end" | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width < EDGE_GRAB * 3) return null;
    if (e.clientX - rect.left <= EDGE_GRAB) return "start";
    if (rect.right - e.clientX <= EDGE_GRAB) return "end";
    return null;
  };

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const store = useStudio.getState();
    if (e.shiftKey) store.toggleSelectedId(layerId);
    else store.setSelectedIds([layerId]);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    // The span is read once: it moves as the drag writes, and re-reading it would
    // feed the result back into the next frame's delta.
    dragRef.current = {
      pointerId: e.pointerId,
      fromX: e.clientX,
      span,
      edge: edgeAt(e),
      from: blocks,
    };
  };

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      e.currentTarget.style.cursor = edgeAt(e) ? "ew-resize" : "grab";
      return;
    }
    if (drag.pointerId !== e.pointerId || spanPx(width) < 1) return;
    // Retiming lands on frames. Nothing finer survives the export — frames are
    // sampled at whole steps — so the sub-frame precision only costs control.
    const snap = (v: number) => Math.round(v / frame) * frame;
    const delta = (e.clientX - drag.fromX) / spanPx(width);
    const store = useStudio.getState();
    if (drag.edge === null) {
      store.slideTrack(layerId, drag.from, snap(delta));
      return;
    }
    const held = drag.edge === "start" ? drag.span[0] : drag.span[1];
    const anchor = drag.edge === "start" ? drag.span[1] : drag.span[0];
    store.stretchTrack(layerId, drag.from, anchor, held, snap(held + delta));
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
      aria-label={`${name} timing — drag to move every property, drag an end to stretch them`}
      aria-pressed={selected}
      className={`absolute top-1/2 flex -translate-y-1/2 touch-none items-center justify-between rounded-[5px] px-1.5 ${
        selected ? "bg-[#1f78cf] ring-2 ring-[#9dcaf2]" : "bg-[#3186d6]"
      } hover:bg-[#2b7ecd]`}
      style={{ left, width: Math.max(4, right - left), height: MAIN_HEIGHT }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* The two ends, said plainly — this bar can be stretched as well as moved. */}
      <span className="pointer-events-none h-[11px] w-[2px] rounded-full bg-white/85" />
      <span className="pointer-events-none h-[11px] w-[2px] rounded-full bg-white/85" />
    </div>
  );
}

/** What a press on the element's bar grabbed, and the state it started from. The
 *  blocks are frozen here: a drag says how far it has come from where it began, so
 *  every frame has to be measured against that and not against what the last frame
 *  already wrote. */
type MainDrag = {
  pointerId: number;
  fromX: number;
  span: Range;
  edge: "start" | "end" | null;
  from: BlockView[];
};

/**
 * The bracket down the left of the gutter, tying together the elements that are
 * running the same motion.
 *
 * Only the ends are shaped: it starts at the middle of the first row it covers and
 * stops at the middle of the last, so it reads as something holding those rows
 * together rather than as a border one of them happens to have. An element whose
 * partners are elsewhere on the timeline gets the stub — there is nothing next to it
 * to run a line to, and a line to a row that is not in the family would be a lie.
 */
function Rail({ cap }: { cap: RailCap | null }) {
  if (cap === null) return null;
  return <span className={`timeline-rail is-${cap}`} aria-hidden="true" />;
}

/**
 * The mark on a property that says this curve is not the only one of its kind.
 *
 * In the property's own colour, so which thing is in lockstep is readable without
 * opening anything, and clicking it picks the whole set — which is how you get back
 * to authoring them together after going in to tweak one.
 */
function LinkMark({ group }: { group: LinkGroup }) {
  const others = group.members.length - 1;
  return (
    <button
      type="button"
      className={`timeline-link ${PROP_TEXT[group.property]}`}
      title={`runs with ${others} other element${others === 1 ? "" : "s"} — click to pick them all`}
      aria-label={`${group.property} runs the same on ${group.members.length} elements, pick them all`}
      onClick={() => useStudio.getState().setSelectedIds(group.members)}
    >
      <LinkIcon />
    </button>
  );
}

function LinkIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4.9 7.1 7.1 4.9M5 2.6l.9-.9a2.3 2.3 0 0 1 3.3 3.3l-.9.9M7 9.4l-.9.9a2.3 2.3 0 0 1-3.3-3.3l.9-.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
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

/** The line between the first keyframe and the last, and the diamonds riding it.
 *  A property is drawn as a skeleton: the element's own bar is the handle for the
 *  set, so a single curve only has to show where its moments are. */
const RAIL_HEIGHT = 2;
const DIAMOND = 9;
/** The element's own bar — the one that moves every curve under it. */
const MAIN_HEIGHT = 22;

/**
 * An element's property, drawn as what it actually is: a row of moments.
 *
 * One keyframe is a diamond and nothing else — there is no span yet, because nothing
 * has been animated. A second keyframe makes a span, and the hairline between them
 * says so. Retiming one property on its own still happens here; retiming the
 * element's whole performance is the bar on the row above.
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

  // TODO revisit: double-click on a lane used to drop a keyframe holding whatever
  // the property already read there. Taken out for now — it fired on the way to
  // other things and there was no way to see it coming. Adding a keyframe at the
  // playhead still works from the inspector's diamond.

  return (
    <div className="absolute inset-0">
      {/* Only once there are two: a line is the span between keyframes, and one
          keyframe has no span. Grabbable, but kept to a hairline — the weight on
          this row belongs to the diamonds. */}
      {stretched ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`${block.label} keyframes`}
          aria-pressed={selected}
          className={`absolute top-1/2 flex -translate-y-1/2 touch-none items-center ${PROP_TEXT[prop]}`}
          style={{
            left: xOf(stops[0].t),
            width: Math.max(2, xOf(stops[last].t) - xOf(stops[0].t)),
            height: DIAMOND + 4,
          }}
          onPointerDown={(e) => beginDrag(e, { kind: "body", index: -1 })}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span
            className={`pointer-events-none w-full rounded-full bg-current ${
              selected ? "opacity-100" : "opacity-55"
            }`}
            style={{ height: RAIL_HEIGHT }}
          />
        </div>
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
        height: MAIN_HEIGHT - 6,
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
 * Current time and composition length, both typed as well as read, with the unit
 * switch set apart because it changes what the two numbers mean.
 */
function Readout({
  time,
  duration,
  unit,
  onSeek,
  onToggleUnit,
}: {
  time: number;
  duration: number;
  unit: Unit;
  /** Seconds, absolute. Normalizing against the duration is the caller's job. */
  onSeek: (seconds: number) => void;
  onToggleUnit: () => void;
}) {
  const name = unit === "s" ? "seconds" : "milliseconds";
  const ms = unit === "ms";
  // One scale for both fields: what is typed is in the unit on show, what is stored
  // is always seconds.
  const scale = ms ? 1000 : 1;
  const shape = ms
    ? { step: 10, precision: 0 }
    : { step: 0.1, precision: 2 };

  return (
    <div className="flex min-w-0 items-center gap-1 text-[11px]">
      <div className="flex min-w-0">
        <div className="w-[52px]">
          <NumberField
            label=""
            ariaLabel={`current time in ${name}`}
            title="current time — type to move the playhead"
            join="left"
            tight
            value={time * scale}
            min={0}
            max={duration * scale}
            {...shape}
            onChange={(v) => onSeek(v / scale)}
          />
        </div>
        <div className="w-[52px]">
          <NumberField
            label=""
            ariaLabel={`duration in ${name}`}
            title="duration — type to set how long the composition runs"
            join="right"
            tight
            value={duration * scale}
            min={MIN_DURATION * scale}
            max={MAX_DURATION * scale}
            {...shape}
            onChange={(v) => useStudio.getState().setDuration(v / scale)}
          />
        </div>
      </div>
      <button
        type="button"
        className={`${GHOST_BTN} shrink-0 tabular-nums`}
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
