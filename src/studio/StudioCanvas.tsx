import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { paintComposition } from "../render/paint";
import { useStudio } from "./store";
import { atFit, frameOrigin } from "./view";

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
      const { viewport: vp, view: v, zoomToFit, zoomAroundPoint } = useStudio.getState();
      const center = { x: vp.width / 2, y: vp.height / 2 };
      if (e.key === "0" || e.key === "f" || e.key === "F") {
        e.preventDefault();
        zoomToFit();
      } else if (e.key === "1") {
        e.preventDefault();
        zoomAroundPoint(center, 1);
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
      dpr * view.zoom,
      0,
      0,
      dpr * view.zoom,
      origin.x * dpr,
      origin.y * dpr,
    );
    paintComposition(ctx, composition, t, frame.width, frame.height);
  }, [composition, t, frame, view, viewport, dpr, origin.x, origin.y]);

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (!el) return;
    const { viewport: vp, frame: fr, view: v, zoomToFit, zoomAroundPoint } = useStudio.getState();
    if (atFit(v, vp, fr)) {
      const rect = el.getBoundingClientRect();
      zoomAroundPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top }, 1);
    } else {
      zoomToFit();
    }
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
            width: frame.width,
            height: frame.height,
            transform: `translate(${origin.x}px, ${origin.y}px) scale(${view.zoom})`,
          }}
        >
          <div className="studio-frame">
            <div className="studio-grid" />
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="studio-render" />
      <StudioHud />
    </div>
  );
}

function StudioHud() {
  const frame = useStudio((s) => s.frame);
  const zoom = useStudio((s) => s.view.zoom);
  const fitLocked = useStudio((s) => s.fitLocked);
  const zoomToFit = useStudio((s) => s.zoomToFit);

  const zoomTo100 = () => {
    const { viewport, zoomAroundPoint } = useStudio.getState();
    zoomAroundPoint({ x: viewport.width / 2, y: viewport.height / 2 }, 1);
  };

  return (
    <div
      className="studio-hud"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span className="studio-hud-frame">
        {frame.width} × {frame.height}
      </span>
      <button type="button" aria-pressed={fitLocked} onClick={zoomToFit}>
        Fit
      </button>
      <button type="button" onClick={zoomTo100}>
        {Math.round(zoom * 100)}%
      </button>
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
