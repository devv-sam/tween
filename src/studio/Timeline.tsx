import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Preview } from "../render/preview";
import { useStudio } from "./store";
import {
  BLOCK_HEIGHT,
  PROP_COLOR,
  PROP_OUTLINE,
  blockTop,
  layerName,
  rowHeight,
  samePart,
  slideRange,
  trackBlocks,
  trimRange,
  type BlockView,
  type Range,
} from "./modules";
import {
  RULER_HEIGHT,
  TRACK_HEIGHT,
  clampDuration,
  formatTime,
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
      perPx: width > 0 ? duration / width : 0,
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

  const rows = composition.tracks.map((track, i) => {
    const asset =
      track.layer.source.kind === "image"
        ? assets.find((a) => a.id === track.layer.source.value)
        : undefined;
    const blocks = trackBlocks(track);
    return {
      id: track.layer.id,
      name: layerName(track.layer, asset?.name, i),
      given: track.layer.name ?? "",
      blocks,
      height: rowHeight(blocks.length, TRACK_HEIGHT),
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
            <TrackLabel
              key={row.id}
              layerId={row.id}
              name={row.name}
              given={row.given}
              height={row.height}
            />
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
              <div
                key={row.id}
                className="relative border-b border-[#f0f0f0] bg-[#fafafa]"
                style={{ height: row.height }}
              >
                {row.blocks.map((block, i) => (
                  <TrackBlock
                    key={`${block.part.kind}:${
                      block.part.kind === "keyframes" ? block.part.property : block.part.index
                    }`}
                    layerId={row.id}
                    index={i}
                    count={row.blocks.length}
                    block={block}
                    width={width}
                  />
                ))}
              </div>
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
  height,
}: {
  layerId: string;
  name: string;
  given: string;
  height: number;
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
      className="timeline-track-label"
      style={{ height }}
      title={draft === null ? `${name} — double-click to rename` : undefined}
      onDoubleClick={() => setDraft(given)}
    >
      {draft === null ? (
        name
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

/** Which part of a block a drag grabbed. The body slides the window; an edge trims it. */
type BlockDrag = { pointerId: number; fromX: number; start: Range; edge: "start" | "end" | null };

/** Edge grab width, in px. Wide enough to hit, narrow enough to leave a body. */
const EDGE_GRAB = 6;

/**
 * One block's window, drawn in its element's lane. The block is the only editor for
 * that window: dragging its body slides it, dragging an edge trims it. Standalone
 * keyframes and modules take the same drags and differ only in how they are drawn.
 */
function TrackBlock({
  layerId,
  index,
  count,
  block,
  width,
}: {
  layerId: string;
  index: number;
  count: number;
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
    const store = useStudio.getState();
    if (block.part.kind === "keyframes") {
      store.setKeyframeRange(layerId, block.part.property, range);
    } else {
      store.setModuleRange(layerId, block.part.index, range);
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
      e.currentTarget.style.cursor = edgeAt(e) ? "ew-resize" : "grab";
      return;
    }
    if (drag.pointerId !== e.pointerId || width < 1) return;
    const delta = (e.clientX - drag.fromX) / width;
    const next = drag.edge
      ? trimRange(drag.start, drag.edge, drag.start[drag.edge === "start" ? 0 : 1] + delta)
      : slideRange(drag.start, delta);
    writeRange(next);
  };

  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    // One drag, one undo step — closed here so the next drag starts a new one.
    useStudio.getState().sealHistory();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${block.label} ${block.standalone ? "keyframes" : "module"}`}
      aria-pressed={selected}
      title={`${block.label} — drag to move, drag an edge to trim`}
      className={`absolute cursor-grab touch-none overflow-hidden rounded-[4px] border ${
        block.standalone ? `border-dashed ${PROP_OUTLINE[prop]}` : PROP_COLOR[prop]
      } ${selected ? "ring-1 ring-[#0d99ff]" : ""}`}
      style={{
        left,
        width: Math.max(2, right - left),
        top: blockTop(index, count, TRACK_HEIGHT),
        height: BLOCK_HEIGHT,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-current opacity-25" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-current opacity-25" />
      <span className="pointer-events-none block truncate px-2 text-[10px] leading-4">
        {block.label}
      </span>
      {block.stops.map((stop, i) => (
        // A stop's t is a share of this block, so its diamond rides the block as it is
        // trimmed. The nudge keeps the end diamonds off the rounded corners.
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
