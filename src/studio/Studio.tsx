import { useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { StudioCanvas } from "./StudioCanvas";
import { useStudio, type ImageAsset } from "./store";
import { IMAGE_ACCEPT } from "./files";
import { contentScale } from "./view";

export function Studio() {
  const assets = useStudio((s) => s.assets);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="studio">
      <header className="studio-header" />
      <div className="studio-body">
        <nav className="studio-sidebar" aria-label="studio">
          <button
            type="button"
            className="studio-rail-btn"
            aria-label="Add elements"
            onClick={() => inputRef.current?.click()}
          >
            +
          </button>
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
          <div className="studio-shelf">
            {assets.map((asset) => (
              <ShelfThumb key={asset.id} asset={asset} />
            ))}
          </div>
        </nav>
        <div className="studio-main">
          <StudioCanvas />
          <div className="studio-timeline" />
        </div>
      </div>
    </div>
  );
}

function ShelfThumb({ asset }: { asset: ImageAsset }) {
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLImageElement | null>(null);

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
    ghost.className = "shelf-ghost";
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

  const onMouseEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setTooltip({ top: rect.top + rect.height / 2, left: rect.right + 14 });
  };

  return (
    <div
      ref={ref}
      className="shelf-thumb"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => setTooltip(null)}
    >
      <img src={asset.src} alt={asset.name} draggable={false} />
      {tooltip
        ? createPortal(
            <div
              className="shelf-tooltip"
              style={{ top: tooltip.top, left: tooltip.left }}
            >
              {asset.name}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
