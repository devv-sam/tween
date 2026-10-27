import { useRef, type ReactNode } from "react";

const HIDE_AFTER_MS = 800;

/** A vertical scroller with a thin bar that is only there while it is being scrolled. */
export function ScrollArea({ className, children }: { className?: string; children: ReactNode }) {
  const timer = useRef<number>(undefined);

  return (
    <div
      className={`overflow-y-auto [scrollbar-color:transparent_transparent] [scrollbar-width:thin] data-[scrolling]:[scrollbar-color:var(--color-border)_transparent] ${className ?? ""}`}
      onScroll={(e) => {
        const el = e.currentTarget;
        el.dataset.scrolling = "";
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => delete el.dataset.scrolling, HIDE_AFTER_MS);
      }}
    >
      {children}
    </div>
  );
}
