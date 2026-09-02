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
  RULER_HEIGHT,
  TRACK_HEIGHT,
  clampDuration,
  formatClock,
  formatMillis,
  ticks,
  timeToX,
  xToTime,
} from "./ruler";

/** The pill is an affordance for the module increment — `input` drives nothing yet. */
type DriverPill = "time" | "input";

/** The readout's unit. `s` is the clock; `ms` is the raw number the exporter counts in. */
type Unit = "s" | "ms";

export function Timeline() {
  const composition = useStudio((s) => s.composition);
  const assets = useStudio((s) => s.assets);
  const t = useStudio((s) => s.t);
  const playing = useStudio((s) => s.playing);
  const loop = useStudio((s) => s.loop);

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
  const [driver, setDriver] = useState<DriverPill>("time");
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

  const marks = useMemo(() => ticks(duration, width), [duration, width]);
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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const rows = composition.tracks.map((track, i) => {
    const asset =
      track.layer.source.kind === "image"
        ? assets.find((a) => a.id === track.layer.source.value)
        : undefined;
    return { id: track.layer.id, name: asset?.name ?? `Element ${i + 1}` };
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
        <span className="transport-readout">
          <span className="transport-clock">{read(t * duration, unit)}</span>
          <span className="transport-duration">{read(duration, unit)}</span>
          <button
            type="button"
            className="unit-toggle"
            title={unit === "s" ? "seconds" : "milliseconds"}
            aria-label={`readout unit: ${unit === "s" ? "seconds" : "milliseconds"}`}
            onClick={() => setUnit((u) => (u === "s" ? "ms" : "s"))}
          >
            {unit}
          </button>
        </span>
        <span className="transport-spacer" />
        <button
          type="button"
          className="driver-pill"
          title={`driver: ${driver}`}
          onClick={() => setDriver((d) => (d === "time" ? "input" : "time"))}
        >
          {driver}
        </button>
      </div>

      <div className="timeline-body">
        <div className="timeline-gutter">
          <div className="timeline-gutter-head" style={{ height: RULER_HEIGHT }} />
          {rows.map((row) => (
            <div
              key={row.id}
              className="timeline-track-label"
              style={{ height: TRACK_HEIGHT }}
              title={row.name}
            >
              {row.name}
            </div>
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
                className="timeline-lane"
                style={{ height: TRACK_HEIGHT }}
              />
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
              aria-valuetext={formatClock(t * duration)}
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

const read = (seconds: number, unit: Unit) =>
  unit === "s" ? formatClock(seconds) : formatMillis(seconds);

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
