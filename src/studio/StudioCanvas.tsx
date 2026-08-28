import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { paintComposition } from "../render/paint";
import { useStudio } from "./store";
import { contentScale, frameOrigin, frameSize } from "./view";

export function StudioCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const composition = useStudio((s) => s.composition);
  const frame = useStudio((s) => s.frame);
  const t = useStudio((s) => s.t);
  const viewport = useStudio((s) => s.viewport);
  const view = useStudio((s) => s.view);
  const dpr = useDevicePixelRatio();

  const origin = frameOrigin(viewport, frame, view);
  const size = frameSize(frame, view.scale);
  const scale = contentScale(view);

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
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);
      zoomAroundPoint(screen, v.zoom * Math.exp(-delta * 0.0018));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const { viewport: vp, view: v, resetZoom, zoomAroundPoint } = useStudio.getState();
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
    paintComposition(ctx, composition, t, frame.width, frame.height);
    ctx.restore();
  }, [composition, t, frame, view, viewport, dpr, origin.x, origin.y, scale]);

  const onDoubleClick = () => {
    useStudio.getState().resetZoom();
  };

  return (
    <div
      ref={viewportRef}
      className="studio-viewport"
      aria-label="Studio canvas"
      tabIndex={0}
      onDoubleClick={onDoubleClick}
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
    </div>
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
