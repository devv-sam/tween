import { useRef, useState, type ReactNode } from "react";
import { Popover } from "./Popover";

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
  children,
}: {
  title: string;
  /** The button's classes; the open state is added on top. */
  className: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** What the button shows. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

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
      >
        {children}
      </button>
      {open ? (
        <Popover
          anchorRef={anchorRef}
          placement="below"
          label={title}
          onClose={() => setOpen(false)}
        >
          <ul
            role="listbox"
            className="m-0 max-h-[260px] list-none overflow-y-auto p-1"
            // As wide as the control it opens from, so the menu sits square under it.
            style={{ minWidth: anchorRef.current?.offsetWidth }}
          >
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[11px] ${
                    o.value === value
                      ? "bg-accent/[0.06] text-text-primary"
                      : "text-text-primary/70 hover:bg-text-primary/5"
                  }`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}
