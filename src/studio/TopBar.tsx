import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { ExportPanel } from "./ExportPanel";
import { DEFAULT_EXPORT, type ExportSettings } from "./exportRun";
import { Popover } from "./Popover";

export function TopBar() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="studio-header flex items-center justify-end px-2">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-6 items-center gap-1.5 rounded-md bg-text-primary px-2.5 text-[11px] font-medium text-bg hover:opacity-90"
        onClick={() => setOpen(!open)}
      >
        <Download size={12} aria-hidden="true" />
        Export
      </button>
      {open ? (
        <Popover
          anchorRef={buttonRef}
          placement="below"
          label="Export"
          onClose={() => setOpen(false)}
        >
          <ExportPanel
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onDone={() => setOpen(false)}
          />
        </Popover>
      ) : null}
    </header>
  );
}
