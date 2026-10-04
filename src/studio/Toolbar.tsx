import { useStudio, type ActiveTool } from "./store";

const tools: { id: ActiveTool; label: string; shortcut: string }[] = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "rect", label: "Rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
];

export function Toolbar() {
  const activeTool = useStudio((s) => s.activeTool);
  const setActiveTool = useStudio((s) => s.setActiveTool);

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col gap-0.5 rounded-lg border border-border bg-bg p-1 shadow-sm">
      {tools.map((t) => (
        <button
          key={t.id}
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
          {t.id === "select" ? <CursorIcon /> : t.id === "rect" ? <RectIcon /> : <EllipseIcon />}
        </button>
      ))}
    </div>
  );
}

function CursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l14 14-5.5 0-4 6.5L5 3z" />
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
