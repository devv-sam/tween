import { useStudio, type ActiveTool } from "./store";

const tools: { id: ActiveTool; label: string; shortcut: string }[] = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "rect", label: "Rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "text", label: "Text", shortcut: "T" },
];

export function Toolbar() {
  const activeTool = useStudio((s) => s.activeTool);
  const setActiveTool = useStudio((s) => s.setActiveTool);

  return (
    <div className="flex items-end gap-1 border-b border-border px-3 py-1.5">
      {tools.map((t) => (
        <div key={t.id} className="flex flex-col items-center gap-px">
          <button
            type="button"
            title={`${t.label} (${t.shortcut})`}
            aria-label={t.label}
            className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
              activeTool === t.id
                ? "bg-accent text-white"
                : "text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary"
            }`}
            onClick={() => setActiveTool(t.id)}
          >
            {t.id === "select" ? <CursorIcon /> : t.id === "rect" ? <RectIcon /> : t.id === "ellipse" ? <EllipseIcon /> : <TypeIcon />}
          </button>
          <span className="text-[9px] leading-none text-text-muted/50">
            {t.shortcut}
          </span>
        </div>
      ))}
    </div>
  );
}

function CursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 4 7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  );
}

function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

function EllipseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}
