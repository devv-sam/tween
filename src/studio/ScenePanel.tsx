import { useStudio } from "./store";
import { PANEL, PANEL_LABEL } from "./fields";

/** The scene's rows are drawn by the timeline, which owns the selection, the reorder
 *  and the clock; `onHost` hands it the box to draw them into. */
export function ScenePanel({ onHost }: { onHost: (host: HTMLDivElement | null) => void }) {
  const layerCount = useStudio((s) => s.composition.tracks.length);

  return (
    <section
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${PANEL}`}
      aria-label="scene"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className={PANEL_LABEL}>Scene</span>
        <span className="text-[10px] text-text-muted/70 tabular-nums">{layerCount}</span>
      </div>
      <div ref={onHost} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]" />
    </section>
  );
}
