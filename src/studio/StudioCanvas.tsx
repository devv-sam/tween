import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SceneItem, Transform } from "../core/types";
import { renderState } from "../core/renderState";
import { ensureImage, getCachedImage } from "../render/images";
import { IMAGE_ACCEPT } from "./files";
import { paintComposition } from "../render/paint";
import { useStudio } from "./store";
import {
  CORNERS,
  HANDLES,
  HANDLE_CURSOR,
  HANDLE_SIZE,
  LOCK_OFFSET,
  angleTo,
  boxSize,
  containsPoint,
  cornerPoints,
  gripAtScreen,
  handlePositions,
  hitTest,
  normalizeAngle,
  regionAngle,
  resizeFrom,
  rotateCursor,
  rotateFrom,
  withinLock,
  type Handle,
} from "./selection";
import {
  compositionToScreen,
  contentScale,
  frameOrigin,
  frameSize,
  screenToComposition,
  type Point,
  type Size,
} from "./view";

/** An in-flight move, resize, or rotate. `handle` is set only when resizing. */
type Drag = {
  id: string;
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  handle: Handle | null;
  startBase: Transform;
  startRendered: Transform;
  size: Size;
  from: Point;
  /** Pointer angle about the element's centre when a rotate drag began. */
  startAngle: number;
  /** Cursor orientation for the region grabbed, carried so it turns with the element. */
  cursorAngle: number;
  lockAspect: boolean;
};

const centreOf = (state: Transform): Point => ({ x: state.x, y: state.y });

const NUDGE = 1;
const NUDGE_COARSE = 10;
const BADGE_GAP = 10;

export function StudioCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const composition = useStudio((s) => s.composition);
  const assets = useStudio((s) => s.assets);
  const frame = useStudio((s) => s.frame);
  const t = useStudio((s) => s.t);
  const viewport = useStudio((s) => s.viewport);
  const view = useStudio((s) => s.view);
  const selectedId = useStudio((s) => s.selectedId);
  const dpr = useDevicePixelRatio();
  const [imagesReady, setImagesReady] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  // The lock only shows while the pointer is on the element, so idle chrome stays quiet.
  const [hovering, setHovering] = useState(false);
  // While rotating, the badge reports the angle instead of the box size.
  const [rotating, setRotating] = useState(false);

  const origin = frameOrigin(viewport, frame, view);
  const size = frameSize(frame, view.scale);
  const scale = contentScale(view);
  const empty = assets.length === 0;

  /** Evaluated scene, for hit testing and selection chrome. Painting evaluates its own. */
  const scene = useMemo(() => renderState(composition, t), [composition, t]);

  const sizeOf = useMemo(() => {
    const byId = new Map(
      assets.map((a) => [a.id, { width: a.naturalW, height: a.naturalH }]),
    );
    return (item: SceneItem): Size | undefined =>
      item.source.kind === "image" ? byId.get(item.source.value) : undefined;
  }, [assets]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const item = scene.find((it) => it.id === selectedId);
    if (!item) return null;
    const intrinsic = sizeOf(item);
    if (!intrinsic) return null;
    const track = composition.tracks.find((tr) => tr.layer.id === selectedId);
    return {
      item,
      size: intrinsic,
      lockAspect: Boolean(track?.layer.lockAspect),
    };
  }, [scene, selectedId, sizeOf, composition]);

  useEffect(() => setHovering(false), [selectedId]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      useStudio.getState().setViewport({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const { view: v, zoomAroundPoint } = useStudio.getState();
      const delta =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);
      zoomAroundPoint(screen, v.zoom * Math.exp(-delta * 0.0018));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const mapPoint = (e: DragEvent) => {
      const rect = el.getBoundingClientRect();
      const { viewport: vp, frame: fr, view: v } = useStudio.getState();
      return screenToComposition(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        vp,
        fr,
        v,
      );
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e: DragEvent) => {
      const { importImages, placeElement } = useStudio.getState();
      const assetId = e.dataTransfer?.getData("application/x-tween-asset");
      const files = e.dataTransfer?.files;
      if (!assetId && !files?.length) return;
      e.preventDefault();
      const at = mapPoint(e);
      if (assetId) {
        placeElement(assetId, at);
        return;
      }
      if (files?.length) void importImages(files);
    };

    el.addEventListener("dragover", onDragOver, true);
    el.addEventListener("drop", onDrop, true);
    return () => {
      el.removeEventListener("dragover", onDragOver, true);
      el.removeEventListener("drop", onDrop, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const {
        viewport: vp,
        view: v,
        selectedId: sel,
        resetZoom,
        zoomAroundPoint,
        select,
        nudgeSelected,
        deleteSelected,
      } = useStudio.getState();
      const center = { x: vp.width / 2, y: vp.height / 2 };

      if (e.key === "Escape") {
        if (sel) select(null);
        return;
      }
      if (sel && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (sel && e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
        const by =
          e.key === "ArrowLeft"
            ? { x: -step, y: 0 }
            : e.key === "ArrowRight"
              ? { x: step, y: 0 }
              : e.key === "ArrowUp"
                ? { x: 0, y: -step }
                : { x: 0, y: step };
        e.preventDefault();
        nudgeSelected(by.x, by.y);
        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomAroundPoint(center, v.zoom * 1.15);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomAroundPoint(center, v.zoom / 1.15);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const asset of assets) {
      if (getCachedImage(asset.id)) continue;
      void ensureImage(asset.id, asset.src).then(() => {
        if (!cancelled) setImagesReady((n) => n + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [assets]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width < 1 || viewport.height < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bw = Math.max(1, Math.round(viewport.width * dpr));
    const bh = Math.max(1, Math.round(viewport.height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      dpr * scale,
      (origin.x + view.panX) * dpr,
      (origin.y + view.panY) * dpr,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, frame.width, frame.height);
    ctx.clip();
    paintComposition(ctx, composition, t, frame.width, frame.height, (id) => {
      const img = getCachedImage(id);
      if (!img || img.naturalWidth < 1) return undefined;
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    });
    ctx.restore();
  }, [
    composition,
    assets,
    t,
    frame,
    view,
    viewport,
    dpr,
    origin.x,
    origin.y,
    scale,
    imagesReady,
  ]);

  const screenAt = (e: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const baseOf = (id: string): Transform | undefined =>
    useStudio.getState().composition.tracks.find((tr) => tr.layer.id === id)
      ?.layer.base;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const screen = screenAt(e);
    const point = screenToComposition(screen, viewport, frame, view);
    const { selectedId: sel, select } = useStudio.getState();

    const begin = (
      item: SceneItem,
      itemSize: Size,
      mode: Drag["mode"],
      handle: Handle | null,
      near: Handle | null = null,
    ) => {
      const base = baseOf(item.id);
      if (!base) return false;
      const track = useStudio
        .getState()
        .composition.tracks.find((tr) => tr.layer.id === item.id);
      dragRef.current = {
        id: item.id,
        pointerId: e.pointerId,
        mode,
        handle,
        startBase: { ...base },
        startRendered: { ...item.state },
        size: itemSize,
        from: point,
        startAngle: angleTo(centreOf(item.state), point),
        cursorAngle: near ? regionAngle(item.state, itemSize, near) : 0,
        lockAspect: Boolean(track?.layer.lockAspect),
      };
      // Capture keeps the drag alive past the viewport edge. If the pointer is
      // already gone the drag would strand, so drop it rather than leave it stuck.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        dragRef.current = null;
        return false;
      }
      return true;
    };

    if (selected) {
      const grip = gripAtScreen(
        selected.item.state,
        selected.size,
        screen,
        viewport,
        frame,
        view,
      );
      if (grip) {
        setHovering(true);
        if (grip.kind === "resize") {
          setCursor(HANDLE_CURSOR[grip.handle]);
          if (begin(selected.item, selected.size, "resize", grip.handle)) return;
        } else {
          setCursor(
            rotateCursor(regionAngle(selected.item.state, selected.size, grip.near)),
          );
          if (begin(selected.item, selected.size, "rotate", null, grip.near)) {
            setRotating(true);
            return;
          }
        }
      }
    }

    const id = hitTest(scene, sizeOf, point);
    if (!id) {
      if (sel) select(null);
      return;
    }
    if (id !== sel) select(id);
    const item = scene.find((it) => it.id === id);
    const itemSize = item && sizeOf(item);
    if (!item || !itemSize) return;
    setCursor("move");
    setHovering(true);
    begin(item, itemSize, "move", null);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const screen = screenAt(e);
    const drag = dragRef.current;

    if (!drag) {
      if (!selected) {
        setCursor(null);
        setHovering(false);
        return;
      }
      const grip = gripAtScreen(
        selected.item.state,
        selected.size,
        screen,
        viewport,
        frame,
        view,
      );
      if (grip) {
        setCursor(
          grip.kind === "resize"
            ? HANDLE_CURSOR[grip.handle]
            : rotateCursor(
                regionAngle(selected.item.state, selected.size, grip.near),
              ),
        );
        setHovering(true);
        return;
      }
      const point = screenToComposition(screen, viewport, frame, view);
      const inside = containsPoint(selected.item.state, selected.size, point);
      setCursor(inside ? "move" : null);
      // The lock sits outside the bounds, so its own area counts as hovering too —
      // otherwise it would vanish as the pointer crossed the gap to reach it.
      setHovering(inside || (chrome !== null && withinLock(screen, chrome.lock)));
      return;
    }

    const point = screenToComposition(screen, viewport, frame, view);
    const { setLayerBase } = useStudio.getState();

    if (drag.mode === "rotate") {
      const nextRotation = rotateFrom(
        drag.startRendered,
        point,
        drag.startAngle,
        e.shiftKey,
      );
      // Glue the cursor to the region it grabbed as the element turns under it.
      setCursor(
        rotateCursor(
          drag.cursorAngle + (nextRotation - drag.startRendered.rotation),
        ),
      );
      setLayerBase(drag.id, {
        rotation:
          drag.startBase.rotation + (nextRotation - drag.startRendered.rotation),
      });
      return;
    }

    if (!drag.handle) {
      setLayerBase(drag.id, {
        x: drag.startBase.x + (point.x - drag.from.x),
        y: drag.startBase.y + (point.y - drag.from.y),
      });
      return;
    }

    // Shift flips the lock for the duration of the drag, the usual canvas convention.
    const lock = drag.lockAspect !== e.shiftKey;
    // Handles sit on the rendered box, but the edit lands on `base`. Applying the
    // result as a delta keeps any offset an active module contributed.
    const next = resizeFrom(
      drag.startRendered,
      drag.size,
      drag.handle,
      point,
      lock,
    );
    const rx =
      drag.startRendered.scaleX > 0
        ? next.scaleX / drag.startRendered.scaleX
        : 1;
    const ry =
      drag.startRendered.scaleY > 0
        ? next.scaleY / drag.startRendered.scaleY
        : 1;
    setLayerBase(drag.id, {
      x: drag.startBase.x + (next.x - drag.startRendered.x),
      y: drag.startBase.y + (next.y - drag.startRendered.y),
      scaleX: drag.startBase.scaleX * rx,
      scaleY: drag.startBase.scaleY * ry,
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setRotating(false);
    if (e.currentTarget.hasPointerCapture(drag.pointerId)) {
      e.currentTarget.releasePointerCapture(drag.pointerId);
    }
  };

  const chrome = useMemo(() => {
    if (!selected) return null;
    const toScreen = (p: Point) =>
      compositionToScreen(p, viewport, frame, view);
    const outline = cornerPoints(selected.item.state, selected.size).map(
      toScreen,
    );
    const at = handlePositions(selected.item.state, selected.size);
    const handles = {} as Record<Handle, Point>;
    for (const k of HANDLES) handles[k] = toScreen(at[k]);
    return {
      outline,
      handles,
      lock: {
        x: handles.ne.x + LOCK_OFFSET.x,
        y: handles.ne.y + LOCK_OFFSET.y,
      },
      badge: {
        x: (outline[0].x + outline[1].x + outline[2].x + outline[3].x) / 4,
        y: Math.max(...outline.map((p) => p.y)) + BADGE_GAP,
        size: boxSize(selected.item.state, selected.size),
      },
    };
  }, [selected, viewport, frame, view]);

  return (
    <div
      ref={viewportRef}
      className="studio-viewport"
      aria-label="Studio canvas"
      tabIndex={0}
      style={cursor ? { cursor } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (dragRef.current) return;
        setCursor(null);
        setHovering(false);
      }}
      onDoubleClick={() => useStudio.getState().resetZoom()}
    >
      {viewport.width > 0 ? (
        <div
          className="studio-world"
          style={{
            width: size.width,
            height: size.height,
            transform: `translate(${origin.x}px, ${origin.y}px)`,
          }}
        >
          <div
            className="studio-frame"
            style={{
              width: frame.width,
              height: frame.height,
              transform: `translate(${view.panX}px, ${view.panY}px) scale(${scale})`,
            }}
          >
            <div className="studio-grid" />
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="studio-render" />
      {selected && chrome ? (
        <>
          <svg
            className="studio-selection"
            width={viewport.width}
            height={viewport.height}
            aria-hidden="true"
          >
            <polygon
              className="studio-selection-outline"
              points={chrome.outline.map((p) => `${p.x},${p.y}`).join(" ")}
            />
            {/* Corners only. Sides stay draggable — they just have no drawn handle. */}
            {CORNERS.map((k) => {
              const p = chrome.handles[k];
              return (
                <rect
                  key={k}
                  className="studio-handle"
                  x={p.x - HANDLE_SIZE / 2}
                  y={p.y - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  transform={`rotate(${selected.item.state.rotation} ${p.x} ${p.y})`}
                />
              );
            })}
          </svg>
          {/* Hidden while rotating: pinned to a corner, it would swing around the box. */}
          {hovering && !rotating ? (
          <button
            type="button"
            className={`studio-lock${selected.lockAspect ? " is-locked" : ""}`}
            aria-pressed={selected.lockAspect}
            aria-label={
              selected.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"
            }
            title={
              selected.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"
            }
            style={{
              transform: `translate(${chrome.lock.x}px, ${chrome.lock.y}px) translate(-50%, -50%)`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() =>
              useStudio.getState().toggleLayerLock(selected.item.id)
            }
          >
            {selected.lockAspect ? <LockIcon /> : <LockOpenIcon />}
          </button>
          ) : null}
          <div
            className="studio-badge"
            style={{
              transform: `translate(${chrome.badge.x}px, ${chrome.badge.y}px) translate(-50%, 0)`,
            }}
          >
            {rotating
              ? `${Math.round(normalizeAngle(selected.item.state.rotation))}°`
              : `${Math.round(chrome.badge.size.width)} × ${Math.round(chrome.badge.size.height)}`}
          </div>
        </>
      ) : null}
      {empty && viewport.width > 0 ? (
        <div
          className="studio-empty"
          style={{
            transform: `translate(${origin.x + size.width / 2}px, ${origin.y + size.height / 2}px) translate(-50%, -50%)`,
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <input
            ref={fileRef}
            className="elements-file"
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            onChange={(e) => {
              if (e.currentTarget.files?.length) {
                void useStudio
                  .getState()
                  .importImages([...e.currentTarget.files]);
              }
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="studio-empty-btn"
            onClick={() => fileRef.current?.click()}
          >
            <EmptyIcon />
            Add elements
          </button>
          <p>or drop them here to get started.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Lucide `lock` / `lock-open`, inlined so two glyphs don't pull in an icon package. */
function LockIcon() {
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
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LockOpenIcon() {
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
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M2.5 11.5 6 8l2.5 2.5 2-2 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="10.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  useEffect(() => {
    let mql: MediaQueryList;
    const onChange = () => {
      mql.removeEventListener("change", onChange);
      setDpr(window.devicePixelRatio || 1);
      listen();
    };
    const listen = () => {
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onChange);
    };
    listen();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return dpr;
}
