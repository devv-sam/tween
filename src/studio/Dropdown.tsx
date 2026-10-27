import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "./Popover";
import { stepFocus } from "./stepFocus";

/**
 * A button that opens a list of choices as a card under it. The button's look is the
 * caller's, so a field and a toolbar chip can share the behaviour.
 */
export function Dropdown({
  title,
  className,
  value,
  options,
  onChange,
  footer,
  children,
}: {
  title: string;
  /** The button's classes; the open state is added on top. */
  className: string;
  value: string;
  /** `detail` sits at the end of the row, quieter than the label. */
  options: { value: string; label: string; detail?: string }[];
  onChange: (value: string) => void;
  /** Under the list, for a choice the list cannot offer. Given a way to close the menu. */
  footer?: (close: () => void) => ReactNode;
  /** What the button shows. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => {
    setOpen(false);
    anchorRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const first =
      list?.querySelector<HTMLElement>('[aria-selected="true"]') ??
      list?.querySelector<HTMLElement>('[role="option"]');
    first?.focus({ preventScroll: true });
    first?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`${className} ${open ? "border-accent" : ""}`}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open ? (
        <Popover anchorRef={anchorRef} placement="below" label={title} onClose={close}>
          <ul
            ref={listRef}
            role="listbox"
            className="m-0 max-h-[260px] list-none overflow-y-auto p-1"
            onKeyDown={(e) => stepFocus(e, listRef.current, '[role="option"]')}
            // As wide as the control it opens from, so the menu sits square under it.
            style={{ minWidth: anchorRef.current?.offsetWidth }}
          >
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-[11px] outline-none focus-visible:bg-text-primary/10 ${
                    o.value === value
                      ? "bg-text-primary/5 text-accent"
                      : "text-text-primary/70 hover:bg-text-primary/5"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    close();
                  }}
                >
                  {o.label}
                  {o.detail ? (
                    <span className="text-[10px] text-text-muted tabular-nums">{o.detail}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {footer ? <div className="border-t border-border p-2">{footer(close)}</div> : null}
        </Popover>
      ) : null}
    </>
  );
}
