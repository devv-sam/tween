import { useState, type ReactNode } from "react";
import { useStudio } from "./store";
import {
  FPS_CHOICES,
  RESOLUTIONS,
  normalizeHex,
  resolutionFor,
  resolutionKey,
} from "./composition";
import { ZOOM_PRESETS, zoomPercent } from "./view";
import { BOX, INPUT } from "./fields";
import { FpsIcon, ResolutionIcon } from "./icons";

const CHIP = `${BOX} bg-bg`;

/**
 * The composition's settings, in the gap above the frame they describe. No duration
 * field: length is not a setting to fill in before you can animate. It follows from
 * the work, and the ruler's end handle is there when you want to say otherwise.
 */
export function CanvasControls() {
  const { fps, background } = useStudio((s) => s.composition);
  const frame = useStudio((s) => s.frame);

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
      <SelectChip
        title="Frames per second"
        icon={<FpsIcon />}
        value={String(fps)}
        onChange={(v) => useStudio.getState().setFps(Number(v))}
        options={FPS_CHOICES.map((f) => ({ value: String(f), label: String(f) }))}
      />
      <SelectChip
        title="Resolution"
        icon={<ResolutionIcon />}
        value={resolutionKey(frame)}
        onChange={(v) => {
          const size = resolutionFor(v);
          if (size) useStudio.getState().setResolution(size);
        }}
        options={RESOLUTIONS.map((r) => ({
          value: resolutionKey(r.size),
          label: r.label,
        }))}
      />
      <BackgroundChip value={background ?? "#ffffff"} />
      <ZoomChip />
    </div>
  );
}

/**
 * Swatch and hex, one value. The swatch is the native picker; the text field takes a
 * typed colour and only commits once it is a whole one, so a half-typed `#ab` does
 * not repaint the frame.
 */
function BackgroundChip({ value }: { value: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (hex: string) => useStudio.getState().setBackground(hex);

  return (
    <div className={CHIP} title="Background">
      <input
        type="color"
        aria-label="background colour"
        className="h-[16px] w-[20px] shrink-0 cursor-pointer rounded-[3px] border border-border bg-transparent p-0"
        value={value}
        onChange={(e) => {
          setDraft(null);
          set(e.target.value);
        }}
      />
      <input
        className={`${INPUT} w-[52px] uppercase`}
        aria-label="background hex"
        spellCheck={false}
        value={draft ?? value.replace("#", "")}
        onChange={(e) => {
          setDraft(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex) set(hex);
        }}
        onBlur={() => {
          setDraft(null);
          useStudio.getState().sealHistory();
        }}
      />
    </div>
  );
}

function ZoomChip() {
  const zoom = useStudio((s) => s.view.zoom);
  const current = zoomPercent(zoom);
  const percents = [
    ...new Set([...ZOOM_PRESETS.map(zoomPercent), current]),
  ].sort((a, b) => a - b);

  return (
    <SelectChip
      title="Zoom"
      value={String(current)}
      onChange={(v) => {
        const { viewport, zoomAroundPoint } = useStudio.getState();
        zoomAroundPoint(
          { x: viewport.width / 2, y: viewport.height / 2 },
          Number(v) / 100,
        );
      }}
      options={percents.map((p) => ({ value: String(p), label: `${p}%` }))}
    />
  );
}

function SelectChip({
  title,
  icon,
  value,
  options,
  onChange,
}: {
  title: string;
  icon?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className={CHIP} title={title}>
      {icon ? <span className="shrink-0 text-text-muted">{icon}</span> : null}
      <select
        className="bg-transparent text-[11px] text-text-primary outline-none"
        aria-label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
