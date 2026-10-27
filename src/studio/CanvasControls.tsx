import type { ReactNode } from "react";
import { useStudio } from "./store";
import { FPS_CHOICES } from "./composition";
import { ZOOM_PRESETS, zoomPercent } from "./view";
import { PILL } from "./fields";
import { FpsIcon } from "./icons";

const CHIP = `${PILL} bg-bg`;

/**
 * The composition's frame rate and zoom, in the gap above the frame they describe. No duration
 * field: length is not a setting to fill in before you can animate. It follows from
 * the work, and the ruler's end handle is there when you want to say otherwise.
 */
export function CanvasControls() {
  const fps = useStudio((s) => s.composition.fps);

  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
      <SelectChip
        title="Frames per second"
        icon={<FpsIcon />}
        value={String(fps)}
        onChange={(v) => useStudio.getState().setFps(Number(v))}
        options={FPS_CHOICES.map((f) => ({ value: String(f), label: String(f) }))}
      />
      <ZoomChip />
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
