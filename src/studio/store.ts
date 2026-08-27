import { create } from "zustand";
import type { Composition } from "../core/types";
import {
  DEFAULT_FRAME,
  atFit,
  clampPan,
  clampZoom,
  fitZoom,
  isPannable,
  zoomAround,
  type Point,
  type Size,
  type View,
} from "./view";

const emptyComposition = (): Composition => ({
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  tracks: [],
});

type StudioState = {
  composition: Composition;
  frame: Size;
  t: number;
  viewport: Size;
  view: View;
  fitLocked: boolean;
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  zoomToFit: () => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  composition: emptyComposition(),
  frame: DEFAULT_FRAME,
  t: 0,
  viewport: { width: 0, height: 0 },
  view: { zoom: 1, panX: 0, panY: 0 },
  fitLocked: true,

  setViewport: (viewport) => {
    const { frame, view, fitLocked } = get();
    const fit = fitZoom(viewport, frame);
    const zoom = fitLocked ? fit : clampZoom(view.zoom, fit);
    const pan = clampPan({ x: view.panX, y: view.panY }, zoom, viewport, frame);
    set({
      viewport,
      view: { zoom, panX: pan.x, panY: pan.y },
      fitLocked: fitLocked || atFit({ zoom, panX: pan.x, panY: pan.y }, viewport, frame),
    });
  },

  zoomAroundPoint: (screen, nextZoom) => {
    const { viewport, frame, view } = get();
    if (viewport.width < 1 || viewport.height < 1) return;
    const fitted = zoomAround(screen, nextZoom, viewport, frame, view);
    const locked = atFit(fitted, viewport, frame);
    set({
      view: locked ? { zoom: fitted.zoom, panX: 0, panY: 0 } : fitted,
      fitLocked: locked,
    });
  },

  panBy: (dx, dy) => {
    const { viewport, frame, view } = get();
    if (!isPannable(view.zoom, viewport, frame)) return;
    const pan = clampPan(
      { x: view.panX + dx, y: view.panY + dy },
      view.zoom,
      viewport,
      frame,
    );
    set({ view: { zoom: view.zoom, panX: pan.x, panY: pan.y }, fitLocked: false });
  },

  zoomToFit: () => {
    const { viewport, frame } = get();
    if (viewport.width < 1) return;
    set({
      view: { zoom: fitZoom(viewport, frame), panX: 0, panY: 0 },
      fitLocked: true,
    });
  },
}));
