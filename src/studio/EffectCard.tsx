import type { EffectCategory, EffectEntry } from "./effects";

const PATTERN: Record<EffectCategory, string> = {
  Stylize:
    "bg-[radial-gradient(circle,var(--color-text-muted)_1px,transparent_1.3px)] bg-[length:7px_7px]",
  Motion:
    "bg-[repeating-linear-gradient(45deg,var(--color-border)_0_1px,transparent_1px_7px)]",
  Text: "bg-[repeating-linear-gradient(0deg,var(--color-border)_0_1px,transparent_1px_6px)]",
  Time: "bg-[repeating-linear-gradient(90deg,var(--color-border)_0_1px,transparent_1px_6px)]",
};

export function EffectCard({ effect }: { effect: EffectEntry }) {
  return (
    <li className="group flex min-w-0 cursor-default flex-col gap-1.5 transition-transform hover:-translate-y-px">
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-text-primary/5 transition-[border-color,box-shadow] group-hover:border-text-muted group-hover:shadow-sm ${PATTERN[effect.category]}`}
      >
        <span className="absolute top-1 right-1 rounded border border-border bg-bg px-1 py-px text-[8px] leading-[1.3] font-semibold tracking-[0.04em] text-text-muted uppercase">
          {effect.driver}
        </span>
      </div>
      <span className="truncate text-[11px] leading-[1.3] text-text-primary" title={effect.name}>
        {effect.name}
      </span>
    </li>
  );
}
