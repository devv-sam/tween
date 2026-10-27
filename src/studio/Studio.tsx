import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { clamp } from "../core/math";
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
import { useStudio } from "./store";
import { readNumber, writeNumber } from "./prefs";

/** Panel sizes. `share` is the fraction of the window a panel opens at the first time. */
const SCENE_WIDTH = { key: "tween:width:scene", share: 0.21, min: 220, max: 520 };
const INSPECTOR_WIDTH = { key: "tween:width:inspector", share: 0.18, min: 220, max: 480 };
const ASSETS_HEIGHT = { key: "tween:height:assets", share: 0.3, min: 120, max: 640 };
const EFFECTS_HEIGHT = { key: "tween:height:effects", share: 0.33, min: 120, max: 640 };
const TIMELINE_HEIGHT = { key: "tween:height:timeline", share: 0.33, min: 120, max: 640 };
/** What the panel above keeps when the one below it is dragged up as far as it goes. */
const SCENE_MIN_HEIGHT = 96;
const CANVAS_MIN_HEIGHT = 160;

const initial = (l: { key: string; share: number; min: number; max: number }, span: number) =>
  readNumber(l.key, clamp(Math.round(span * l.share), l.min, l.max));

const DevDials = import.meta.env.DEV ? lazy(() => import("./DevDials")) : null;

/** Keeps `size` inside the room a column has left once `above` and a gap are spared. */
const fitBelow = (column: HTMLElement | null, above: number, size: number) =>
  column
    ? Math.min(
        size,
        column.clientHeight -
          above -
          parseFloat(getComputedStyle(column).getPropertyValue("--gap")),
      )
    : size;

export function Studio() {
  // The scene's rows are drawn by the timeline, which owns the selection, the
  // reorder and the clock; this is the box it draws them into.
  const [sceneHost, setSceneHost] = useState<HTMLDivElement | null>(null);
  const [sceneWidth, setSceneWidth] = useState(() => initial(SCENE_WIDTH, innerWidth));
  const [inspectorWidth, setInspectorWidth] = useState(() => initial(INSPECTOR_WIDTH, innerWidth));
  const [assetsHeight, setAssetsHeight] = useState(() => initial(ASSETS_HEIGHT, innerHeight));
  const [effectsHeight, setEffectsHeight] = useState(() => initial(EFFECTS_HEIGHT, innerHeight));
  const [timelineHeight, setTimelineHeight] = useState(() => initial(TIMELINE_HEIGHT, innerHeight));
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

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
      <div ref={stageRef} className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 px-(--edge) pt-(--edge)">
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
            className="flex max-w-[40%] shrink-0 flex-col"
            style={{ width: inspectorWidth }}
          >
            <Inspector />
            <ResizeHandle
              label="Resize effects height"
              axis="y"
              value={effectsHeight}
              limits={EFFECTS_HEIGHT}
              grows="up"
              onResize={(h) => setEffectsHeight(fitBelow(rightRef.current, SCENE_MIN_HEIGHT, h))}
            />
            <EffectsPanel height={effectsHeight} />
          </div>
        </div>
        <ResizeHandle
          label="Resize timeline"
          axis="y"
          value={timelineHeight}
          limits={TIMELINE_HEIGHT}
          grows="up"
          onResize={(h) => setTimelineHeight(fitBelow(stageRef.current, CANVAS_MIN_HEIGHT, h))}
        />
        <div
          className="flex max-h-[calc(100%_-_160px_-_var(--gap))] shrink-0 flex-col"
          style={{ height: timelineHeight }}
        >
          <Timeline sceneHost={sceneHost} />
        </div>
      </div>
      {DevDials ? (
        <Suspense fallback={null}>
          <DevDials />
        </Suspense>
      ) : null}
    </div>
  );
}
