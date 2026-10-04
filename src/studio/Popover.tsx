import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { POPOVER_GAP, fitInViewport } from "./cardFit";

/** Where the card sits against the thing that opened it. */
export type Placement = "left" | "below";

const GAP = POPOVER_GAP;

/** Every ancestor that can scroll the anchor out from under the card. */
function scrollParentsOf(el: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY, overflowX } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY + overflowX)) out.push(node);
  }
  return out;
}

/**
 * A card floating over the studio, anchored to the control that opened it.
 *
 * Fixed rather than absolute: the panels it opens from scroll and clip their
 * overflow, and a settings card that disappears under the edge of the panel it
 * belongs to is worse than no card. Being fixed means it has to be placed by hand,
 * which is what the measure below is for — and re-placed whenever anything it was
 * measured against moves.
 */
export function Popover({
  anchorRef,
  placement,
  label,
  draggable,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  placement: Placement;
  /** Named for the screen reader, since the card is a sibling of nothing. */
  label: string;
  /** Can be moved by any `data-drag-handle` element in it, pressed on itself. */
  draggable?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [moved, setMoved] = useState<{ left: number; top: number } | null>(null);
  const movedRef = useRef(false);
  movedRef.current = moved !== null;

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (movedRef.current) {
        setMoved((m) => {
          if (!m) return m;
          const fit = fitInViewport({ x: m.left, y: m.top }, box, viewport);
          return { left: fit.x, top: fit.y };
        });
        return;
      }
      if (!anchor) return;
      const left =
        placement === "left" ? anchor.left - box.width - GAP : anchor.right - box.width;
      const top = placement === "left" ? anchor.top : anchor.bottom + 4;
      const fit = fitInViewport({ x: left, y: top }, box, viewport);
      setAt({ left: fit.x, top: fit.y });
    };
    place();
    window.addEventListener("resize", place);
    // Named scrollers rather than one capturing listener at the window: a scroll
    // event does not bubble, so the window only ever sees these by capture, and
    // naming the elements the anchor actually sits inside says what is meant.
    const scrollers = scrollParentsOf(anchorRef.current);
    for (const el of scrollers) el.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      for (const el of scrollers) el.removeEventListener("scroll", place);
    };
  }, [anchorRef, placement]);

  useEffect(() => {
    // Capture, and the event stops here: escape with a card open means close the
    // card, not clear the selection underneath it. The canvas listens on `document`
    // too, and only a capture-phase listener gets there first.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggable || e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest("[data-drag-handle]");
    if (!handle || handle !== e.target) return;
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      return;
    }
    dragRef.current = { pointerId: e.pointerId, dx: e.clientX - box.left, dy: e.clientY - box.top };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== e.pointerId || !box) return;
    const fit = fitInViewport(
      { x: e.clientX - drag.dx, y: e.clientY - drag.dy },
      box,
      { width: window.innerWidth, height: window.innerHeight },
    );
    setMoved({ left: fit.x, top: fit.y });
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <>
      {/* Anywhere else closes it — what a card over a panel has to do, and what a
          blur on the button that opened it cannot. */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-label={label}
        className="fixed z-50 rounded-[9px] border border-border bg-bg shadow-[0_6px_20px_rgba(0,0,0,.14)]"
        // Measured against the anchor, so there is nothing static to put in a class.
        // Held off-screen for the first frame rather than flashing at the corner.
        style={moved ?? at ?? { left: -9999, top: -9999 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
    </>
  );
}
