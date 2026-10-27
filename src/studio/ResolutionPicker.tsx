import { useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Dropdown } from "./Dropdown";
import {
  RESOLUTIONS,
  customResolution,
  formatSize,
  resolutionFor,
  resolutionKey,
  resolutionName,
} from "./composition";
import { LABEL, PANEL_LABEL, PILL } from "./fields";
import { useStudio } from "./store";

const DIM_INPUT =
  "h-7 w-[72px] rounded-md border border-border bg-text-primary/5 px-2 text-center text-[11px] text-text-primary tabular-nums outline-none placeholder:text-text-muted focus:border-accent";

/** The frame's size: a few shapes by name, or any width and height typed in. */
export function ResolutionPicker() {
  const frame = useStudio((s) => s.frame);
  const name = resolutionName(frame);

  return (
    <Dropdown
      title="Resolution"
      className={`${PILL} group w-full justify-between`}
      value={name === "Custom" ? "" : resolutionKey(frame)}
      options={RESOLUTIONS.map((r) => ({
        value: resolutionKey(r.size),
        label: r.label,
        detail: formatSize(r.size),
      }))}
      onChange={(key) => {
        const size = resolutionFor(key);
        if (size) useStudio.getState().setResolution(size);
      }}
      footer={(close) => <CustomSize onDone={close} />}
    >
      <span className={`${LABEL} shrink-0`}>Res</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className="text-[11px] whitespace-nowrap text-text-primary tabular-nums">
          {formatSize(frame)}
        </span>
        <ChevronDown
          size={12}
          aria-hidden="true"
          className="shrink-0 text-text-muted transition-transform group-aria-expanded:rotate-180"
        />
      </span>
    </Dropdown>
  );
}

function CustomSize({ onDone }: { onDone: () => void }) {
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");

  const apply = () => {
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    if (!(w > 0 && h > 0)) return;
    useStudio.getState().setResolution(customResolution(w, h));
    onDone();
  };
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") apply();
    // Escape belongs to the menu: it closes it, and the canvas must not see the key.
    if (e.key !== "Escape") e.stopPropagation();
  };

  return (
    <div className="grid gap-1.5">
      <span className={PANEL_LABEL}>Custom</span>
      <div className="flex items-center gap-1.5">
        <input
          className={DIM_INPUT}
          inputMode="numeric"
          placeholder="W"
          aria-label="custom width"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          onKeyDown={keys}
        />
        <span className="text-[11px] text-text-muted">×</span>
        <input
          className={DIM_INPUT}
          inputMode="numeric"
          placeholder="H"
          aria-label="custom height"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          onKeyDown={keys}
        />
      </div>
    </div>
  );
}
