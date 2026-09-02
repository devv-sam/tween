import { useEffect, useRef, useState, type DragEvent } from "react";
import { Inspector } from "./Inspector";
import { StudioCanvas } from "./StudioCanvas";
import { Timeline } from "./Timeline";
import { useStudio, type ImageAsset } from "./store";
import { IMAGE_ACCEPT, baseName, extensionOf } from "./files";
import { contentScale } from "./view";
import { readAssetsCollapsed, writeAssetsCollapsed } from "./prefs";

export function Studio() {
  const assets = useStudio((s) => s.assets);
  // Read once on mount so the drawer opens in the state it was left in, without a
  // frame of the wrong width first.
  const [collapsed, setCollapsed] = useState(readAssetsCollapsed);
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
            <button
              type="button"
              className={`flex w-full flex-col items-center gap-1 rounded-[7px] px-0.5 pt-[5px] pb-1.5 text-[10px] leading-tight focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[#111] ${
                collapsed ? "text-[#888]" : "font-medium text-[#111]"
              }`}
              aria-expanded={!collapsed}
              aria-controls="assets-drawer"
              title={collapsed ? "expand" : "collapse"}
              onClick={() => setCollapsed((v) => !v)}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-[7px] ${
                  collapsed
                    ? "text-[#555] hover:bg-[#f5f5f5]"
                    : "bg-[#e8f4ff] text-[#0d99ff]"
                }`}
              >
                <ImageIcon />
              </span>
              <span className="leading-tight">Assets</span>
            </button>
          </div>
          {collapsed ? null : (
            <div
              className="flex w-[236px] shrink-0 flex-col overflow-y-auto [scrollbar-width:none]"
              id="assets-drawer"
            >
              <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-white px-3 pt-3 pb-2">
                <button
                  type="button"
                  className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#888] hover:text-[#111]"
                  title="collapse"
                  aria-expanded
                  aria-controls="assets-drawer"
                  onClick={() => setCollapsed(true)}
                >
                  Assets
                </button>
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
                    void useStudio
                      .getState()
                      .importImages([...e.currentTarget.files]);
                  }
                  e.currentTarget.value = "";
                }}
              />
              {assets.length === 0 ? (
                <p className="m-0 px-3 pt-1 pb-3 text-xs leading-normal text-[#b0b0b0]">
                  Nothing here yet. Import png, jpg, or webp.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-3 px-3 pt-1 pb-3.5">
                  {assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
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

function AssetCard({ asset }: { asset: ImageAsset }) {
  const ghostRef = useRef<HTMLImageElement | null>(null);
  const ext = extensionOf(asset.name);

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
      className="asset-card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="asset-card-thumb">
        <img src={asset.src} alt={asset.name} draggable={false} />
        {/* Takes any elements placed from this asset with it — see `removeAsset`. */}
        <button
          type="button"
          className="asset-remove"
          draggable={false}
          aria-label={`Remove ${baseName(asset.name)}`}
          title="Remove"
          onClick={() => useStudio.getState().removeAsset(asset.id)}
        >
          <XIcon />
        </button>
      </div>
      <div className="asset-card-meta">
        <span className="asset-card-name" title={asset.name}>
          {baseName(asset.name)}
        </span>
        {ext ? <span className={`asset-chip is-${ext}`}>{ext}</span> : null}
      </div>
    </div>
  );
}

/** Lucide `image` / `plus` / `x`, inlined so a few glyphs don't pull in an icon package. */
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
