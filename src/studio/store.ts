import { create } from "zustand";
import type { Composition } from "../core/types";
import {
  DEFAULT_FRAME,
  DEFAULT_VIEW_SCALE,
  clampPan,
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
  setViewport: (viewport: Size) => void;
  zoomAroundPoint: (screen: Point, nextZoom: number) => void;
  panBy: (dx: number, dy: number) => void;
  resetZoom: () => void;
};

export const useStudio = create<StudioState>((set, get) => ({
  composition: emptyComposition(),
  frame: DEFAULT_FRAME,
  t: 0,
  viewport: { width: 0, height: 0 },
  view: { scale: DEFAULT_VIEW_SCALE, zoom: 1, panX: 0, panY: 0 },

  setViewport: (viewport) => {
    const { frame, view } = get();
    const pan = clampPan({ x: view.panX, y: view.panY }, view, frame);
    set({ viewport, view: { ...view, panX: pan.x, panY: pan.y } });
  },

  zoomAroundPoint: (screen, nextZoom) => {
    const { viewport, frame, view } = get();
    if (viewport.width < 1 || viewport.height < 1) return;
    set({ view: zoomAround(screen, nextZoom, viewport, frame, view) });
  },

  panBy: (dx, dy) => {
    const { frame, view } = get();
    if (!isPannable(view, frame)) return;
    const pan = clampPan({ x: view.panX + dx, y: view.panY + dy }, view, frame);
    set({ view: { ...view, panX: pan.x, panY: pan.y } });
  },

  resetZoom: () => {
    const { view } = get();
    set({ view: { ...view, zoom: 1, panX: 0, panY: 0 } });
  },
}));
