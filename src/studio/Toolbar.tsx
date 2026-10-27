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
    <div
      className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-bg p-1 shadow-sm"
      role="toolbar"
      aria-label="tools"
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          title={`${t.label} (${t.shortcut})`}
          aria-label={t.label}
          aria-pressed={activeTool === t.id}
          className={`grid h-9 w-9 place-items-center rounded-lg transition-colors ${
            activeTool === t.id
              ? "bg-accent text-white"
              : "text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary"
          }`}
          onClick={() => setActiveTool(t.id)}
        >
          {t.id === "select" ? <CursorIcon /> : t.id === "rect" ? <RectIcon /> : t.id === "ellipse" ? <EllipseIcon /> : <TypeIcon />}
        </button>
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
