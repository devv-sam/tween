import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Distributor, Transform } from "../core/types";
import { pathData, type Pt } from "../core/geometry";
import { useStudio } from "./store";
import { compositionToScreen, screenToComposition, type Size, type View } from "./view";
import {
  dragHandle,
  gizmoFor,
  removeNode,
  sameHandle,
  toggleSmooth,
  type Handle,
  type HandleId,
} from "./gizmo";

const NODE = 8;
const STEER = 7;

/**
 * A cloner, drawn on the frame.
 *
 * The point is that a distributor should read as a thing in space rather than a
 * column of numbers: the run the clones follow, a ghost where each one lands, and
 * the direction they travel. The layout is visible before any module has run, which
 * is the part a motion path in other tools leaves until you press play.
 *
 * It draws over the render and never into it. The exporter paints from the
 * composition and has never heard of any of this — the same rule the guides and the
 * selection box already follow.
 */
export function ClonerGizmo({
  layerId,
  distributor,
  base,
  size,
  viewport,
  frame,
  view,
}: {
  layerId: string;
  distributor: Distributor;
  base: Transform;
  /** The element's own pixel size, for the ghost outlines. */
  size: Size | undefined;
  viewport: Size;
  frame: Size;
  view: View;
}) {
  /** The handle being held, and where it was when the drag began — shift needs an
   *  origin to hold the drag against, and the handle has moved by then. */
  const [dragging, setDragging] = useState<{ id: HandleId; origin: Pt } | null>(null);
  const gizmo = gizmoFor(distributor, base);

  const toScreen = (p: Pt) => compositionToScreen(p, viewport, frame, view);
  const scale = view.scale * view.zoom;

  const grab = (h: Handle) => (e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    // Alt-click takes an anchor out rather than moving it — the same gesture a pen
    // tool uses, and the only one left on a handle this small.
    if (e.altKey && h.id.kind === "node") {
      useStudio.getState().setDistributor(layerId, removeNode(distributor, h.id.index));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging({ id: h.id, origin: h.at });
  };

  const move = (e: ReactPointerEvent<SVGElement>) => {
    if (!dragging) return;
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box) return;
    const at = screenToComposition(
      { x: e.clientX - box.left, y: e.clientY - box.top },
      viewport,
      frame,
      view,
    );
    const { setDistributor } = useStudio.getState();
    // Read live, so shift can be pressed or let go part way through a drag.
    const snap = e.shiftKey ? { origin: dragging.origin } : undefined;
    setDistributor(layerId, dragHandle(distributor, dragging.id, at, base, snap));
  };

  /** A corner becomes a bend and back. The anchor stays where it is either way, so
   *  this changes the shape of the run without moving anything along it. */
  const smooth = (id: HandleId) => (e: ReactMouseEvent<SVGElement>) => {
    if (id.kind !== "node") return;
    e.stopPropagation();
    useStudio.getState().setDistributor(layerId, toggleSmooth(distributor, id.index));
  };

  const drop = (e: ReactPointerEvent<SVGElement>) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
    // One drag is one thing to undo, however many frames it wrote.
    useStudio.getState().sealHistory();
  };

  return (
    <svg
      className="studio-gizmo"
      width={viewport.width}
      height={viewport.height}
      aria-hidden="true"
    >
      {/* Where every clone lands, before anything animates them. */}
      {size
        ? gizmo.ghosts.map((g, i) => {
            const at = toScreen(g);
            const w = size.width * base.scaleX * scale;
            const h = size.height * base.scaleY * scale;
            return (
              <rect
                key={i}
                className="studio-ghost"
                x={at.x - w / 2}
                y={at.y - h / 2}
                width={w}
                height={h}
                transform={`rotate(${g.rotation} ${at.x} ${at.y})`}
              />
            );
          })
        : null}

      {gizmo.ring ? (
        <circle
          className="studio-gizmo-line"
          cx={toScreen(gizmo.ring.at).x}
          cy={toScreen(gizmo.ring.at).y}
          r={gizmo.ring.radius * scale}
        />
      ) : null}
      {gizmo.path ? (
        <path
          className="studio-gizmo-line"
          // Moved to the screen before the curve is written, so one stroke width
          // means one stroke width at every zoom. A transform on the svg would
          // scale the line and the handles along with the geometry.
          d={pathData(
            gizmo.path.map((n) => {
              const at = toScreen(n);
              return {
                x: at.x,
                y: at.y,
                ...(n.in ? { in: { x: n.in.x * scale, y: n.in.y * scale } } : {}),
                ...(n.out ? { out: { x: n.out.x * scale, y: n.out.y * scale } } : {}),
              };
            }),
          )}
        />
      ) : null}

      {gizmo.stems.map((s, i) => {
        const a = toScreen(s.from);
        const b = toScreen(s.to);
        return <line key={i} className="studio-gizmo-stem" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}

      {gizmo.arrow ? <Arrow at={toScreen(gizmo.arrow.at)} angle={gizmo.arrow.angle} /> : null}

      {gizmo.handles.map((h) => {
        const at = toScreen(h.at);
        const on = sameHandle(dragging?.id ?? null, h.id);
        const common = {
          className: `studio-gizmo-handle${on ? " is-on" : ""}`,
          onPointerDown: grab(h),
          onPointerMove: move,
          onPointerUp: drop,
          onPointerCancel: drop,
          ...(h.id.kind === "node" ? { onDoubleClick: smooth(h.id) } : {}),
        };
        const key = `${h.id.kind}${"index" in h.id ? h.id.index : ""}`;
        return h.round ? (
          <circle key={key} {...common} cx={at.x} cy={at.y} r={STEER / 2 + 1} />
        ) : (
          <rect
            key={key}
            {...common}
            x={at.x - NODE / 2}
            y={at.y - NODE / 2}
            width={NODE}
            height={NODE}
          />
        );
      })}
    </svg>
  );
}

/** A small chevron pointing the way clones travel. */
function Arrow({ at, angle }: { at: Pt; angle: number }) {
  return (
    <polyline
      className="studio-gizmo-arrow"
      points="-4,-4 2,0 -4,4"
      transform={`translate(${at.x} ${at.y}) rotate(${angle})`}
    />
  );
}
