import { useRef, useState, type DragEvent } from "react";
import { Inspector } from "./Inspector";
import { StudioCanvas } from "./StudioCanvas";
import { Timeline } from "./Timeline";
import { useStudio, type ImageAsset } from "./store";
import { IMAGE_ACCEPT, baseName, extensionOf } from "./files";
import { contentScale } from "./view";

export function Studio() {
  const assets = useStudio((s) => s.assets);
  // The rail tab is a panel switch, so it collapses the drawer as well as opening it.
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="studio">
      <header className="studio-header" />
      <div className="studio-body">
        <nav className="studio-sidebar" aria-label="studio">
          <div className="studio-rail">
            <button
              type="button"
              className={`rail-tab${open ? " is-active" : ""}`}
              aria-expanded={open}
              aria-controls="assets-drawer"
              onClick={() => setOpen((v) => !v)}
            >
              <span className="rail-tab-icon">
                <ImageIcon />
              </span>
              <span className="rail-tab-label">Assets</span>
            </button>
          </div>
          {open ? (
            <div className="assets-drawer" id="assets-drawer">
              <div className="assets-head">
                <span className="assets-head-title">Assets</span>
                <button
                  type="button"
                  className="assets-import"
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
                <p className="assets-empty">
                  Nothing here yet. Import png, jpg, or webp.
                </p>
              ) : (
                <div className="assets-grid">
                  {assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
