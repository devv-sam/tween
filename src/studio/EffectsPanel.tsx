import { useState } from "react";
import { EffectCard } from "./EffectCard";
import { EFFECTS, EFFECT_CATEGORIES, type EffectCategory } from "./effects";
import { PANEL, PANEL_LABEL } from "./fields";

const CHIP =
  "h-6 shrink-0 rounded-full border px-2.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary";

export function EffectsPanel({ height }: { height: number }) {
  const [category, setCategory] = useState<EffectCategory | "All">("All");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = EFFECTS.filter(
    (e) =>
      (category === "All" || e.category === category) && e.name.toLowerCase().includes(needle),
  );

  return (
    <section
      className={`flex max-h-[calc(100%-104px)] shrink-0 flex-col overflow-hidden ${PANEL}`}
      style={{ height }}
      aria-label="effects"
    >
      <div className="flex shrink-0 items-center gap-3 px-3 pt-2 pb-2">
        <span className={PANEL_LABEL}>Effects</span>
        <input
          type="search"
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 text-[12px] text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent"
          placeholder="Search effects"
          aria-label="Search effects"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
        {(["All", ...EFFECT_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            className={`${CHIP} ${
              category === c
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border text-text-muted hover:border-text-muted hover:text-text-primary"
            }`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3 [scrollbar-width:none]">
        {shown.length === 0 ? (
          <p className="m-0 text-sm text-text-muted/60">No effects match.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-3 p-0">
            {shown.map((e) => (
              <EffectCard key={e.name} effect={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
