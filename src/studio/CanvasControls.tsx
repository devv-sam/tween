import { ChevronDown } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { useStudio } from "./store";
import { ZOOM_PRESETS, zoomPercent } from "./view";
import { PILL } from "./fields";

const CHIP = `${PILL} bg-bg`;

/** The view's zoom, in the gap above the frame. The composition's own settings are in
 *  the inspector, where nothing is selected. */
export function CanvasControls() {
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
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
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Dropdown title={title} className={CHIP} value={value} options={options} onChange={onChange}>
      <span className="text-[11px] text-text-primary">
        {options.find((o) => o.value === value)?.label ?? value}
      </span>
      <ChevronDown size={12} aria-hidden="true" className="shrink-0" />
    </Dropdown>
  );
}
