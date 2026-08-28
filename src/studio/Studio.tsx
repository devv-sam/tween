import { useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { StudioCanvas } from "./StudioCanvas";
import { useStudio, type ImageAsset } from "./store";
import { IMAGE_ACCEPT } from "./files";

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

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("application/x-tween-asset", asset.id);
    e.dataTransfer.effectAllowed = "copy";
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
