import type { KeyboardEvent } from "react";

/** Up and down arrows, Home and End move focus through the `selector` matches in `list`. */
export function stepFocus(e: KeyboardEvent, list: HTMLElement | null, selector: string): void {
  const items = list ? [...list.querySelectorAll<HTMLElement>(selector)] : [];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const to =
    e.key === "ArrowDown"
      ? Math.min(items.length - 1, at + 1)
      : e.key === "ArrowUp"
        ? Math.max(0, at - 1)
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : null;
  if (to === null) return;
  e.preventDefault();
  items[to].focus();
}
