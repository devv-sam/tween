import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { AssetsPanel } from "./AssetsPanel";
import { CanvasControls } from "./CanvasControls";
import { EffectsPanel } from "./EffectsPanel";
import { Inspector } from "./Inspector";
import { ResizeHandle } from "./ResizeHandle";
import { ScenePanel } from "./ScenePanel";
import { StudioCanvas } from "./StudioCanvas";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { clamp } from "../core/math";
import { useStudio } from "./store";
import { readNumber, writeNumber } from "./prefs";

/** Panel sizes in px; `fallback` is what a panel opens at until it has been dragged. */
const SCENE_WIDTH = { key: "tween:width:scene", fallback: 333, min: 280, max: 520 };
const INSPECTOR_WIDTH = { key: "tween:width:inspector", fallback: 347, min: 300, max: 480 };
const ASSETS_HEIGHT = { key: "tween:height:assets", fallback: 318, min: 160, max: 640 };
const EFFECTS_HEIGHT = { key: "tween:height:effects", fallback: 296, min: 200, max: 640 };
const TIMELINE_HEIGHT = { key: "tween:height:timeline", fallback: 200, min: 150, max: 640 };
/** What the panel above keeps when the one below it is dragged up as far as it goes.
 *  The `max-h` calcs on the panels below are these numbers again, as classes. */
const SCENE_MIN_HEIGHT = 200;
const CANVAS_MIN_HEIGHT = 240;

/** What was saved, held to today's limits: they have been raised since it was written. */
const saved = (l: { key: string; fallback: number; min: number; max: number }) =>
  clamp(readNumber(l.key, l.fallback), l.min, l.max);

// Opt-in while the look is settled: add `?dials` to the URL in dev.
const DevDials =
  import.meta.env.DEV && new URLSearchParams(location.search).has("dials")
    ? lazy(() => import("./DevDials"))
    : null;

/** What the two panels in a column share: its height less the gap between them. */
const roomOf = (column: HTMLElement | null) =>
  column ? column.clientHeight - parseFloat(getComputedStyle(column).getPropertyValue("--gap")) : 0;

/** Keeps `size` inside the room a column has left once `above` is spared. */
const fitBelow = (column: HTMLElement | null, above: number, size: number) =>
  column ? Math.min(size, roomOf(column) - above) : size;

export function Studio() {
  // The scene's rows are drawn by the timeline, which owns the selection, the
  // reorder and the clock; this is the box it draws them into.
  const [sceneHost, setSceneHost] = useState<HTMLDivElement | null>(null);
  const [sceneWidth, setSceneWidth] = useState(() => saved(SCENE_WIDTH));
  const [inspectorWidth, setInspectorWidth] = useState(() => saved(INSPECTOR_WIDTH));
  const [assetsHeight, setAssetsHeight] = useState(() => saved(ASSETS_HEIGHT));
  const [effectsHeight, setEffectsHeight] = useState(() => saved(EFFECTS_HEIGHT));
  const [timelineHeight, setTimelineHeight] = useState(() => saved(TIMELINE_HEIGHT));
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => writeNumber(SCENE_WIDTH.key, sceneWidth), [sceneWidth]);
  useEffect(() => writeNumber(INSPECTOR_WIDTH.key, inspectorWidth), [inspectorWidth]);
  useEffect(() => writeNumber(ASSETS_HEIGHT.key, assetsHeight), [assetsHeight]);
  useEffect(() => writeNumber(EFFECTS_HEIGHT.key, effectsHeight), [effectsHeight]);
  useEffect(() => writeNumber(TIMELINE_HEIGHT.key, timelineHeight), [timelineHeight]);
  useEffect(() => {
    void useStudio.getState().fetchFonts();
  }, []);

  return (
    <div className="studio">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <div ref={mainRef} className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 pt-(--edge) pl-(--edge)">
            <div
              ref={leftRef}
              className="flex max-w-[40%] shrink-0 flex-col"
              style={{ width: sceneWidth }}
            >
              <ScenePanel onHost={setSceneHost} />
              <ResizeHandle
                label="Resize assets height"
                axis="y"
                value={assetsHeight}
                limits={ASSETS_HEIGHT}
                grows="up"
                ratio={{ room: () => roomOf(leftRef.current), side: "after" }}
                onResize={(h) => setAssetsHeight(fitBelow(leftRef.current, SCENE_MIN_HEIGHT, h))}
              />
              <AssetsPanel height={assetsHeight} />
            </div>
            <ResizeHandle
              label="Resize scene width"
              axis="x"
              value={sceneWidth}
              limits={SCENE_WIDTH}
              grows="right"
              onResize={setSceneWidth}
            />
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
              <StudioCanvas />
              <CanvasControls />
              <Toolbar />
            </div>
          </div>
          <ResizeHandle
            label="Resize timeline"
            axis="y"
            value={timelineHeight}
            limits={TIMELINE_HEIGHT}
            grows="up"
            ratio={{ room: () => roomOf(mainRef.current), side: "inside" }}
            onResize={(h) => setTimelineHeight(fitBelow(mainRef.current, CANVAS_MIN_HEIGHT, h))}
          />
          <div
            className="flex max-h-[calc(100%_-_240px_-_var(--gap))] shrink-0 flex-col"
            style={{ height: timelineHeight }}
          >
            <Timeline sceneHost={sceneHost} />
          </div>
        </div>
        <ResizeHandle
          label="Resize inspector"
          axis="x"
          value={inspectorWidth}
          limits={INSPECTOR_WIDTH}
          grows="left"
          onResize={setInspectorWidth}
        />
        <div
          ref={rightRef}
          className="mt-(--edge) mr-(--edge) mb-(--edge) flex max-w-[40%] shrink-0 flex-col"
          style={{ width: inspectorWidth }}
        >
          <Inspector />
          <ResizeHandle
            label="Resize effects height"
            axis="y"
            value={effectsHeight}
            limits={EFFECTS_HEIGHT}
            grows="up"
            ratio={{ room: () => roomOf(rightRef.current), side: "before" }}
            onResize={(h) => setEffectsHeight(fitBelow(rightRef.current, SCENE_MIN_HEIGHT, h))}
          />
          <EffectsPanel height={effectsHeight} />
        </div>
      </div>
      {DevDials ? (
        <Suspense fallback={null}>
          <DevDials
            sizes={{
              leftWidth: sceneWidth,
              rightWidth: inspectorWidth,
              assetsHeight,
              effectsHeight,
              timelineHeight,
            }}
            onSize={(key, value) =>
              ({
                leftWidth: setSceneWidth,
                rightWidth: setInspectorWidth,
                assetsHeight: setAssetsHeight,
                effectsHeight: setEffectsHeight,
                timelineHeight: setTimelineHeight,
              })[key](value)
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
