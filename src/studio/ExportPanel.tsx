import { useState, type ReactNode } from "react";
import { ChevronDown, Download } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { FORMATS, QUALITY_STOPS, evenSize, runExport, type ExportSettings } from "./exportRun";
import { LABEL, PILL, Segmented } from "./fields";
import { useStudio } from "./store";

const SCALES = [1, 0.75, 0.5, 0.25];
const FPS_CHOICES = ["comp", "24", "30", "60"];

/** Where a file goes and how it is made: format, quality, size, rate and name. */
export function ExportPanel({
  settings,
  onChange,
  onDone,
}: {
  settings: ExportSettings;
  onChange: (patch: Partial<ExportSettings>) => void;
  onDone: () => void;
}) {
  const frame = useStudio((s) => s.frame);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const format = FORMATS.find((f) => f.id === settings.format)!;
  const canvas = settings.format === "canvas";

  const go = async () => {
    setBusy(true);
    setError(null);
    // Lets "Exporting…" paint before the render takes the thread.
    await new Promise((r) => setTimeout(r, 30));
    try {
      await runExport(settings);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[320px]">
      <div role="tablist" className="flex border-b border-border">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={f.id === settings.format}
            disabled={!f.ready}
            title={f.ready ? undefined : "Not available yet"}
            className={`relative flex-1 py-2.5 text-[12px] disabled:opacity-40 ${
              f.id === settings.format
                ? "text-text-primary"
                : "text-text-muted hover:text-text-primary"
            }`}
            onClick={() => onChange({ format: f.id })}
          >
            {f.label}
            {f.id === settings.format ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] leading-none font-semibold tracking-tight text-text-primary">
            .{format.ext}
          </span>
          <span className="text-[12px] text-text-muted">{format.note}</span>
        </div>

        {canvas ? (
          <div className="grid gap-1.5">
            <SwitchRow
              label="Minify"
              on={settings.minify}
              onChange={(minify) => onChange({ minify })}
            />
            <SwitchRow
              label="Controls"
              on={settings.controls}
              onChange={(controls) => onChange({ controls })}
            />
            <SwitchRow label="Loop" on={settings.loop} onChange={(loop) => onChange({ loop })} />
          </div>
        ) : (
          <>
            <QualityTrack value={settings.quality} onChange={(quality) => onChange({ quality })} />
            <div className="grid grid-cols-2 gap-1.5">
              <ExportSelect
                label="Res"
                title="Export resolution"
                value={String(settings.scale)}
                onChange={(v) => onChange({ scale: Number(v) })}
                options={SCALES.map((s) => ({
                  value: String(s),
                  label: s === 1 ? "Comp" : `${s * 100}%`,
                  detail: `${evenSize(frame.width * s)} × ${evenSize(frame.height * s)}`,
                }))}
              />
              <ExportSelect
                label="FPS"
                title="Export frame rate"
                value={settings.fps === null ? "comp" : String(settings.fps)}
                onChange={(v) => onChange({ fps: v === "comp" ? null : Number(v) })}
                options={FPS_CHOICES.map((f) => ({ value: f, label: f === "comp" ? "Comp" : f }))}
              />
            </div>
            <Segmented
              outlined
              value="full"
              options={[
                {
                  value: "full",
                  label: "Full",
                  content: <span className="text-[12px]">Full</span>,
                },
                {
                  value: "work",
                  label: "Work Area",
                  content: <span className="text-[12px]">Work Area</span>,
                  disabled: true,
                },
                {
                  value: "custom",
                  label: "Custom",
                  content: <span className="text-[12px]">Custom</span>,
                  disabled: true,
                },
              ]}
              onChange={() => {}}
            />
          </>
        )}

        <label className={`${PILL} justify-between`}>
          <input
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary outline-none"
            aria-label="file name"
            spellCheck={false}
            value={settings.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <span className="text-[12px] text-text-muted">.{format.ext}</span>
        </label>

        <button
          type="button"
          disabled={busy}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-text-primary text-[13px] font-medium text-bg hover:opacity-90 disabled:opacity-60"
          onClick={() => void go()}
        >
          <Download size={14} aria-hidden="true" />
          {busy ? "Exporting…" : "Export"}
        </button>
        {error ? <p className="m-0 text-[11px] text-accent">{error}</p> : null}
      </div>
    </div>
  );
}

/** The quality stops on a line, the picked one larger and named above it. */
function QualityTrack({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const last = QUALITY_STOPS.length - 1;

  return (
    <div className="flex items-center gap-4">
      <span className={`${LABEL} shrink-0`}>Quality</span>
      <div role="radiogroup" className="relative flex h-8 flex-1 items-end">
        <span
          className="absolute -top-0.5 -translate-x-1/2 text-[10px] text-text-muted"
          style={{ left: `${(value / last) * 100}%` }}
        >
          {QUALITY_STOPS[value]}
        </span>
        <span className="absolute inset-x-1.5 bottom-[7px] h-px bg-border" aria-hidden="true" />
        <div className="relative flex w-full justify-between">
          {QUALITY_STOPS.map((name, i) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={i === value}
              aria-label={name}
              className="grid size-3.5 place-items-center"
              onClick={() => onChange(i)}
            >
              <span
                className={`block rounded-full ${
                  i === value ? "size-3 bg-accent ring-4 ring-accent/15" : "size-2.5 bg-border"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`${PILL} w-full justify-between`}
      onClick={() => onChange(!on)}
    >
      <span className={LABEL}>{label}</span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3" : ""
          }`}
        />
      </span>
    </button>
  );
}

function ExportSelect({
  label,
  title,
  value,
  options,
  onChange,
}: {
  label: string;
  title: string;
  value: string;
  options: { value: string; label: string; detail?: string }[];
  onChange: (value: string) => void;
}): ReactNode {
  const current = options.find((o) => o.value === value);

  return (
    <Dropdown
      title={title}
      className={`${PILL} w-full justify-between`}
      value={value}
      options={options}
      onChange={onChange}
    >
      <span className={`${LABEL} shrink-0`}>{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-primary">
        <span className="truncate rounded bg-text-primary/5 px-1.5 py-0.5">
          {current?.label ?? value}
        </span>
        <ChevronDown size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
      </span>
    </Dropdown>
  );
}
