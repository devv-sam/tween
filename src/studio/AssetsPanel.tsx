import { useRef, useState, type DragEvent, type RefObject } from "react";
import { shelfAssets, useStudio, type StudioAsset } from "./store";
import { IMAGE_ACCEPT, baseName, extensionOf } from "./files";
import { contentScale } from "./view";
import { PANEL } from "./fields";
import { ModuleShelf } from "./ModuleShelf";

const PANEL_BTN =
  "grid h-[22px] w-[22px] place-items-center rounded-[5px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary";

export function AssetsPanel({ height }: { height: number }) {
  const assets = useStudio((s) => s.assets);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Pictures and behaviours are two different things to go looking for, so they
   *  are two tabs rather than two stacked shelves in one scroller. */
  const [tab, setTab] = useState<"assets" | "modules">("assets");
  const adding = tab === "assets" ? "Import images" : "New module";

  return (
    <section
      className={`flex max-h-[calc(100%_-_200px_-_var(--gap))] shrink-0 flex-col overflow-hidden ${PANEL}`}
      style={{ height }}
    >
      <div className="flex h-9 shrink-0 items-center gap-3 px-3">
        <PanelTab label="Assets" active={tab === "assets"} onClick={() => setTab("assets")} />
        <PanelTab label="Modules" active={tab === "modules"} onClick={() => setTab("modules")} />
        <button
          type="button"
          className={`${PANEL_BTN} ml-auto`}
          aria-label={adding}
          title={adding}
          onClick={() =>
            tab === "assets" ? inputRef.current?.click() : useStudio.getState().openBench()
          }
        >
          <PlusIcon />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border [scrollbar-width:none]">
        {tab === "assets" ? <AssetShelf assets={assets} inputRef={inputRef} /> : <ModuleShelf />}
      </div>
    </section>
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
      className={`text-[11px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-text-primary ${
        active ? "text-text-primary" : "text-text-muted hover:text-text-primary"
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

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

/** Per-extension chip colours. */
const TYPE_CHIP: Record<string, string> = {
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
        <span className="truncate text-[10px] leading-[1.3] text-text-primary" title={asset.name}>
          {label}
        </span>
        {ext ? (
          <span
            className={`shrink-0 rounded-[3px] px-1 py-px text-[8px] font-semibold uppercase leading-[1.3] tracking-[0.04em] ${TYPE_CHIP[ext]}`}
          >
            {ext}
          </span>
        ) : null}
      </div>
      {/* Quiet, and on the card rather than in the import error: the file did come
          in, it just came in whole. */}
      {asset.kind === "svg" && asset.notice ? (
        <p className="m-0 text-[9px] leading-[1.35] text-text-muted/60">{asset.notice}</p>
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
