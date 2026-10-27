import { useState } from "react";
import { Search } from "lucide-react";
import { EFFECT_GROUPS } from "./effects";
import { PANEL, PANEL_LABEL } from "./fields";

const ALL = "All";
const NAV = [ALL, ...EFFECT_GROUPS.map((g) => g.category)];

export function EffectsPanel({ height }: { height: number }) {
  const [category, setCategory] = useState(ALL);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const groups = EFFECT_GROUPS.filter((g) => category === ALL || g.category === category)
    .map((g) => ({ ...g, effects: g.effects.filter((e) => e.toLowerCase().includes(needle)) }))
    .filter((g) => g.effects.length > 0);

  return (
    <section
      className={`flex max-h-[calc(100%_-_200px_-_var(--gap))] shrink-0 flex-col overflow-hidden ${PANEL}`}
      style={{ height }}
    >
      <div className="flex h-9 shrink-0 items-center px-3">
        <span className={PANEL_LABEL}>Effects</span>
        <button
          type="button"
          className={`ml-auto grid h-[22px] w-[22px] place-items-center rounded-[5px] hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary ${
            searching ? "text-text-primary" : "text-text-primary/70"
          }`}
          aria-label="Search effects"
          aria-pressed={searching}
          title="Search effects"
          onClick={() => {
            setSearching(!searching);
            setQuery("");
          }}
        >
          <Search size={14} aria-hidden="true" />
        </button>
      </div>
      {searching ? (
        <div className="shrink-0 px-3 pb-2">
          <input
            autoFocus
            type="search"
            className="h-8 w-full rounded-lg border border-border bg-bg px-2.5 text-[12px] text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent"
            placeholder="Search effects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearching(false);
                setQuery("");
              }
            }}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 border-t border-border">
        <nav className="flex w-[36%] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2 [scrollbar-width:none]">
          {NAV.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              className={`h-8 shrink-0 truncate rounded-lg px-2.5 text-left text-[12px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary ${
                category === name
                  ? "bg-text-primary/5 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]">
          {groups.length === 0 ? (
            <p className="m-0 px-2.5 text-sm text-text-muted/60">No effects match.</p>
          ) : (
            groups.map((g) => (
              <div key={g.category} className="mb-2">
                <p className="m-0 px-2.5 py-1 text-[11px] text-text-muted/70">{g.category}</p>
                <ul className="m-0 flex list-none flex-col p-0">
                  {g.effects.map((name) => (
                    <li
                      key={name}
                      className="flex h-8 cursor-default items-center truncate rounded-lg px-2.5 text-[12px] text-text-primary hover:bg-text-primary/5"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
