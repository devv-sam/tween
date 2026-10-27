import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { clamp } from "../core/math";
import { CanvasControls } from "./CanvasControls";
import { Inspector } from "./Inspector";
import { StudioCanvas } from "./StudioCanvas";
import { Timeline } from "./Timeline";
import { shelfAssets, useStudio, type StudioAsset } from "./store";
import { IMAGE_ACCEPT, baseName, extensionOf } from "./files";
import { contentScale } from "./view";
import {
  readAssetsCollapsed,
  readNumber,
  writeAssetsCollapsed,
  writeNumber,
} from "./prefs";
import { ModuleShelf } from "./ModuleShelf";
import { Toolbar } from "./Toolbar";
import { ChevronIcon, LABEL } from "./fields";

const PANEL = "rounded-lg border border-border bg-bg";
const SCENE_WIDTH = { key: "tween:width:scene", fallback: 320, min: 220, max: 520 };
const INSPECTOR_WIDTH = { key: "tween:width:inspector", fallback: 260, min: 220, max: 480 };

export function Studio() {
  const assets = useStudio((s) => s.assets);
  const layerCount = useStudio((s) => s.composition.tracks.length);
  // Read once on mount so the panel opens in the state it was left in, without a
  // frame of the wrong height first.
  const [collapsed, setCollapsed] = useState(readAssetsCollapsed);
  /** Pictures and behaviours are two different things to go looking for, so they
   *  are two tabs rather than two stacked shelves in one scroller. */
  const [tab, setTab] = useState<"assets" | "modules">("assets");
  // The scene's rows are drawn by the timeline, which owns the selection, the
  // reorder and the clock; this is the box it draws them into.
  const [sceneHost, setSceneHost] = useState<HTMLDivElement | null>(null);
  const [sceneWidth, setSceneWidth] = useState(() =>
    readNumber(SCENE_WIDTH.key, SCENE_WIDTH.fallback),
  );
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    readNumber(INSPECTOR_WIDTH.key, INSPECTOR_WIDTH.fallback),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => writeAssetsCollapsed(collapsed), [collapsed]);
  useEffect(() => writeNumber(SCENE_WIDTH.key, sceneWidth), [sceneWidth]);
  useEffect(() => writeNumber(INSPECTOR_WIDTH.key, inspectorWidth), [inspectorWidth]);
  useEffect(() => { void useStudio.getState().fetchFonts(); }, []);

  return (
    <div className="studio">
      <header className="studio-header" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 px-[3px]">
          <div
            className="my-[3px] flex shrink-0 flex-col gap-[3px]"
            style={{ width: sceneWidth }}
          >
            <section
              className={`flex min-h-0 flex-1 flex-col overflow-hidden ${PANEL}`}
              aria-label="scene"
            >
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
                <span className={LABEL}>Scene</span>
                <span className="text-[10px] text-text-muted/70 tabular-nums">
                  {layerCount}
                </span>
              </div>
              <div
                ref={setSceneHost}
                className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]"
              />
            </section>
            <section
              className={`flex shrink-0 flex-col overflow-hidden ${PANEL} ${
                collapsed ? "" : "h-[220px]"
              }`}
              id="assets-drawer"
              aria-label="assets"
            >
              <div className="flex h-9 shrink-0 items-center gap-3 px-3">
                <PanelTab
                  label="Assets"
                  active={tab === "assets"}
                  onClick={() => {
                    setCollapsed(false);
                    setTab("assets");
                  }}
                />
                <PanelTab
                  label="Modules"
                  active={tab === "modules"}
                  onClick={() => {
                    setCollapsed(false);
                    setTab("modules");
                  }}
                />
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    type="button"
                    className={PANEL_BTN}
                    aria-label={tab === "assets" ? "Import images" : "New module"}
                    title={tab === "assets" ? "Import images" : "New module"}
                    onClick={() =>
                      tab === "assets"
                        ? inputRef.current?.click()
                        : useStudio.getState().openBench()
                    }
                  >
                    <PlusIcon />
                  </button>
                  <button
                    type="button"
                    className={`${PANEL_BTN} transition-transform duration-[120ms] ${
                      collapsed ? "" : "rotate-90"
                    }`}
                    aria-label={collapsed ? "Expand" : "Collapse"}
                    aria-expanded={!collapsed}
                    aria-controls="assets-drawer"
                    title={collapsed ? "Expand" : "Collapse"}
                    onClick={() => setCollapsed(!collapsed)}
                  >
                    <ChevronIcon />
                  </button>
                </div>
              </div>
              {collapsed ? null : (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border [scrollbar-width:none]">
                  {tab === "assets" ? (
                    <AssetShelf assets={assets} inputRef={inputRef} />
                  ) : (
                    <ModuleShelf />
                  )}
                </div>
              )}
            </section>
          </div>
          <ResizeHandle
            label="Resize scene panel"
            width={sceneWidth}
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
            width={inspectorWidth}
            limits={INSPECTOR_WIDTH}
            grows="left"
            onResize={setInspectorWidth}
          />
          <Inspector width={inspectorWidth} />
        </div>
        <Timeline sceneHost={sceneHost} />
      </div>
    </div>
  );
}

/**
 * The gap between two panels, which is also where either can be dragged wider. The
 * hit area spills past the gap onto the panels' edges so the grip is not three pixels.
 */
function ResizeHandle({
  label,
  width,
  limits,
  grows,
  onResize,
}: {
  label: string;
  width: number;
  limits: { min: number; max: number };
  /** Which way a drag has to go to make the panel wider. */
  grows: "left" | "right";
  onResize: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const sign = grows === "right" ? 1 : -1;
  const to = (w: number) => onResize(clamp(w, limits.min, limits.max));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    to(width + (e.key === "ArrowRight" ? 1 : -1) * sign * (e.shiftKey ? 48 : 16));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      tabIndex={0}
      className="group relative z-10 w-[3px] shrink-0 cursor-col-resize touch-none outline-none"
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        if (start.current) to(start.current.width + (e.clientX - start.current.x) * sign);
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-y-[3px] -inset-x-[3px]" />
      <div className="absolute inset-y-[3px] left-1/2 w-[2px] -translate-x-1/2 rounded-full group-hover:bg-accent/50 group-focus-visible:bg-accent/50 group-active:bg-accent" />
    </div>
  );
}

const PANEL_BTN =
  "grid h-[22px] w-[22px] place-items-center rounded-[5px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary";

/** The drawer's first panel: every picture the studio holds. */
function AssetShelf({
  assets,
  inputRef,
}: {
  assets: StudioAsset[];
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <>
      <input
        ref={inputRef}
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
      {assets.length === 0 ? (
        <p className="m-0 px-3 py-3 text-xs leading-normal text-text-muted/60">
          Nothing here yet. Import PNG, JPG, WebP, or SVG.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-x-2.5 gap-y-3 px-3 py-3">
          {shelfAssets(assets).map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}

function PanelTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`text-[11px] font-medium uppercase tracking-[0.04em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${
        active ? "text-text-primary" : "text-text-muted hover:text-text-primary"
      }`}
      aria-pressed={active}
      aria-controls="assets-drawer"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Per-extension chip colours. */
const CHIP: Record<string, string> = {
  png: "bg-badge-png text-badge-png-text",
  jpg: "bg-badge-jpg text-badge-jpg-text",
  webp: "bg-badge-webp text-badge-webp-text",
  svg: "bg-badge-svg text-badge-svg-text",
};

function AssetCard({ asset }: { asset: StudioAsset }) {
  const ghostRef = useRef<HTMLImageElement | null>(null);
  const ext = extensionOf(asset.name);
  const label = baseName(asset.name);

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("application/x-tween-asset", asset.id);
    e.dataTransfer.effectAllowed = "copy";
    // Drag at the size it will land at: the drop point becomes the element's
    // centre, so the ghost is the asset at the canvas's current content scale.
    const scale = contentScale(useStudio.getState().view);
    const width = asset.naturalW * scale;
    const height = asset.naturalH * scale;
    const ghost = new Image();
    ghost.src = asset.src;
    ghost.className = "asset-ghost";
    ghost.style.width = `${width}px`;
    ghost.style.height = `${height}px`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, width / 2, height / 2);
    ghostRef.current = ghost;
  };

  const onDragEnd = () => {
    ghostRef.current?.remove();
    ghostRef.current = null;
  };

  return (
    <div
      // Dragging is the interaction, but the pointer stays a plain arrow over the card.
      className="group/asset flex min-w-0 cursor-default flex-col gap-1.5"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-[7px] border border-border bg-text-primary/5 p-1.5 group-hover/asset:border-text-muted/50">
        {/* `contain` inside a box of the thumb's own size, so an asset reads whole in
            the drawer the way it does on canvas. Sizing by `max-h-full` instead lets a
            portrait asset out of the bottom of the square: a percentage max-height has
            nothing definite to resolve against in an auto-height grid row. */}
        <img
          className="block h-full w-full object-contain"
          src={asset.src}
          alt={asset.name}
          draggable={false}
        />
        {/* Takes any elements placed from this asset with it — see `removeAsset`. */}
        <button
          type="button"
          className="pointer-events-none absolute right-1 top-1 grid h-[17px] w-[17px] place-items-center rounded border border-border bg-bg p-0 text-text-primary/70 opacity-0 hover:border-text-primary hover:bg-text-primary hover:text-bg focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary group-hover/asset:pointer-events-auto group-hover/asset:opacity-100"
          draggable={false}
          aria-label={`Remove ${label}`}
          title="Remove"
          onClick={() => useStudio.getState().removeAsset(asset.id)}
        >
          <XIcon />
        </button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <span
          className="truncate text-[10px] leading-[1.3] text-text-primary"
          title={asset.name}
        >
          {label}
        </span>
        {ext ? (
          <span
            className={`shrink-0 rounded-[3px] px-1 py-px text-[8px] font-semibold uppercase leading-[1.3] tracking-[0.04em] ${CHIP[ext]}`}
          >
            {ext}
          </span>
        ) : null}
      </div>
      {/* Quiet, and on the card rather than in the import error: the file did come
          in, it just came in whole. */}
      {asset.kind === "svg" && asset.notice ? (
        <p className="m-0 text-[9px] leading-[1.35] text-text-muted/60">
          {asset.notice}
        </p>
      ) : null}
    </div>
  );
}

/** Lucide `plus` / `x`, inlined so a few glyphs don't pull in an icon package. */
function PlusIcon() {
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
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
