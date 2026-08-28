import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ensureImage, getCachedImage } from "../render/images";
import { IMAGE_ACCEPT } from "./files";
import { paintComposition } from "../render/paint";
import { useStudio } from "./store";
import {
  contentScale,
  frameOrigin,
  frameSize,
  screenToComposition,
} from "./view";

export function StudioCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const composition = useStudio((s) => s.composition);
  const assets = useStudio((s) => s.assets);
  const frame = useStudio((s) => s.frame);
  const t = useStudio((s) => s.t);
  const viewport = useStudio((s) => s.viewport);
  const view = useStudio((s) => s.view);
  const dpr = useDevicePixelRatio();
  const [imagesReady, setImagesReady] = useState(0);

  const origin = frameOrigin(viewport, frame, view);
  const size = frameSize(frame, view.scale);
  const scale = contentScale(view);
  const empty = assets.length === 0;

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
        resetZoom,
        zoomAroundPoint,
      } = useStudio.getState();
      const center = { x: vp.width / 2, y: vp.height / 2 };
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

  return (
    <div
      ref={viewportRef}
      className="studio-viewport"
      aria-label="Studio canvas"
      tabIndex={0}
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
                void useStudio.getState().importImages([...e.currentTarget.files]);
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
          <p>Drop elements here to get started.</p>
        </div>
      ) : null}
    </div>
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
