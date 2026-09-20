import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Inspector } from "./Inspector";
import { StudioCanvas } from "./StudioCanvas";
import { Timeline } from "./Timeline";
import { shelfAssets, useStudio, type StudioAsset } from "./store";
import { IMAGE_ACCEPT, baseName, extensionOf } from "./files";
import { contentScale } from "./view";
import { readAssetsCollapsed, writeAssetsCollapsed } from "./prefs";
import { ModuleShelf } from "./ModuleShelf";

export function Studio() {
  const assets = useStudio((s) => s.assets);
  // Read once on mount so the drawer opens in the state it was left in, without a
  // frame of the wrong width first.
  const [collapsed, setCollapsed] = useState(readAssetsCollapsed);
  /** Which drawer panel the rail is showing. Pictures and behaviours are two
   *  different things to go looking for, so they are two tabs rather than two
   *  stacked shelves in one scroller. */
  const [tab, setTab] = useState<"assets" | "modules">("assets");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => writeAssetsCollapsed(collapsed), [collapsed]);

  return (
    <div className="studio">
      <header className="studio-header" />
      <div className="studio-body">
        {/* Both panels are always in the layout. Only the rail's own width changes on
            collapse, so the frame grows from the left and never from the right. */}
        <nav
          className="flex min-h-0 shrink-0 border-r border-[#e0e0e0] bg-white"
          aria-label="studio"
        >
          <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-[#e0e0e0] px-[5px] py-2">
            {/* Collapsed, the rail is the only thing left — so the toggle comes with
                it, keeping its own divided slot above the panel tabs. */}
            {collapsed ? (
              <div className="mb-1 flex w-full justify-center border-b border-[#e0e0e0] pb-2">
                <PanelToggle collapsed onToggle={() => setCollapsed(false)} />
              </div>
            ) : null}
            <RailTab
              label="Assets"
              icon={<ImageIcon />}
              active={!collapsed && tab === "assets"}
              onClick={() => {
                setCollapsed(false);
                setTab("assets");
              }}
            />
            <RailTab
              label="Modules"
              icon={<BoxesIcon />}
              active={!collapsed && tab === "modules"}
              onClick={() => {
                setCollapsed(false);
                setTab("modules");
              }}
            />
          </div>
          {collapsed ? null : (
            <div className="flex w-[236px] shrink-0 flex-col" id="assets-drawer">
              {/* Its own strip above the panel's contents, matched to the inspector
                  header's height so the two panels line up across the studio. */}
              <div className="flex h-9 shrink-0 items-center justify-end border-b border-[#e0e0e0] px-2">
                <PanelToggle collapsed={false} onToggle={() => setCollapsed(true)} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">
                {tab === "assets" ? (
                  <AssetShelf assets={assets} inputRef={inputRef} />
                ) : (
                  <ModuleShelf />
                )}
              </div>
            </div>
          )}
        </nav>
        <div className="studio-main">
          <StudioCanvas />
          <Timeline />
        </div>
        <Inspector />
      </div>
    </div>
  );
}

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
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-white px-3 pt-3 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#888]">
          Assets
        </span>
        <button
          type="button"
          className="grid h-[22px] w-[22px] place-items-center rounded-[5px] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#111]"
          aria-label="Import images"
          title="Import images"
          onClick={() => inputRef.current?.click()}
        >
          <PlusIcon />
        </button>
      </div>
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
        <p className="m-0 px-3 pt-1 pb-3 text-xs leading-normal text-[#b0b0b0]">
          Nothing here yet. Import png, jpg, webp, or svg.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 px-3 pt-1 pb-3.5">
          {shelfAssets(assets).map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}

/** One tab on the rail: what the drawer is showing, and how to ask for it. */
function RailTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full flex-col items-center gap-1 rounded-[7px] px-0.5 pt-[5px] pb-1.5 text-[10px] leading-tight focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[#111] ${
        active ? "font-medium text-[#111]" : "text-[#888]"
      }`}
      aria-pressed={active}
      aria-controls="assets-drawer"
      title={label}
      onClick={onClick}
    >
      <span
        className={`grid h-7 w-7 place-items-center rounded-[7px] ${
          active ? "bg-[#e8f4ff] text-[#0d99ff]" : "text-[#555] hover:bg-[#f5f5f5]"
        }`}
      >
        {icon}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

/** The panel's own collapse control, so the Assets tab is left to mean "Assets". */
function PanelToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? "expand" : "collapse";
  return (
    <button
      type="button"
      className="grid h-7 w-7 place-items-center rounded-[7px] text-[#555] hover:bg-[#f5f5f5] hover:text-[#111] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#111]"
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls="assets-drawer"
      title={label}
      onClick={onToggle}
    >
      <PanelLeftIcon />
    </button>
  );
}

/** Per-extension chip colours. */
const CHIP: Record<string, string> = {
  png: "bg-[#f1ebfd] text-[#7c4ddb]",
  jpg: "bg-[#fdeedd] text-[#c4711a]",
  webp: "bg-[#e5f1fe] text-[#1a76cc]",
  svg: "bg-[#e8f7ef] text-[#1a8a5a]",
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
      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-[7px] border border-[#e0e0e0] bg-[#f5f5f5] p-1.5 group-hover/asset:border-[#c8c8c8]">
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
          className="pointer-events-none absolute right-1 top-1 grid h-[17px] w-[17px] place-items-center rounded border border-[#e0e0e0] bg-white p-0 text-[#555] opacity-0 hover:border-[#111] hover:bg-[#111] hover:text-white focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[#111] group-hover/asset:pointer-events-auto group-hover/asset:opacity-100"
          draggable={false}
          aria-label={`Remove ${label}`}
          title="Remove"
          onClick={() => useStudio.getState().removeAsset(asset.id)}
        >
          <XIcon />
        </button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <span className="truncate text-[10px] leading-[1.3] text-[#111]" title={asset.name}>
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
        <p className="m-0 text-[9px] leading-[1.35] text-[#b0b0b0]">{asset.notice}</p>
      ) : null}
    </div>
  );
}

/** Lucide `image` / `panel-left` / `plus` / `x`, inlined so a few glyphs don't pull
 *  in an icon package. */
function ImageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function PanelLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

/** Lucide `boxes` — several of a thing, which is what a module makes. */
function BoxesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" />
      <path d="m7 16.5 5-3" />
      <path d="M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" />
      <path d="m17 16.5 4.74-2.85" />
      <path d="M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" />
      <path d="m12 8 4.74-2.85" />
      <path d="M12 13.5V8" />
    </svg>
  );
}

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
