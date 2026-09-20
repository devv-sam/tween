import type { Layer, Transform } from "./types";
import { samplePath, type Pt } from "./geometry";

export interface Instance { base: Transform; u: number; i: number; count: number; }

/** Spread over 0–1. A lone clone sits at the start rather than dividing by nothing. */
const spread = (i: number, count: number): number => (count > 1 ? i / (count - 1) : 0);

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function expand(layer: Layer): Instance[] {
  const d = layer.distributor;
  if (!d || d.type === "none" || d.count <= 1) {
    return [{ base: { ...layer.base }, u: 0, i: 0, count: 1 }];
  }
  const count = d.count;
  const p = d.params ?? {};

  if (d.type === "path") {
    const points = (p.points as Pt[]) ?? [];
    const align = Boolean(p.align);
    return Array.from({ length: count }, (_, i) => {
      const u = spread(i, count);
      const s = samplePath(points, u);
      return { base: { ...layer.base, x: s.x, y: s.y, rotation: align ? s.angle : layer.base.rotation }, u, i, count };
    });
  }

  // Rows fill left to right, and the block is centred on where the element already
  // stands — a cloner should grow around the thing it was made from, not away from it.
  if (d.type === "grid") {
    const cols = Math.max(1, Math.round(num(p.cols, Math.ceil(Math.sqrt(count)))));
    const rows = Math.ceil(count / cols);
    const gapX = num(p.gapX, 100);
    const gapY = num(p.gapY, 100);
    const originX = layer.base.x - ((cols - 1) * gapX) / 2;
    const originY = layer.base.y - ((rows - 1) * gapY) / 2;
    return Array.from({ length: count }, (_, i) => ({
      base: {
        ...layer.base,
        x: originX + (i % cols) * gapX,
        y: originY + Math.floor(i / cols) * gapY,
      },
      u: spread(i, count),
      i,
      count,
    }));
  }

  if (d.type === "radial") {
    const radius = num(p.radius, 200);
    const start = num(p.startAngle, -90);
    const sweep = num(p.sweep, 360);
    const align = Boolean(p.align);
    // A full turn puts the last clone back on the first, so the step divides the
    // whole count; a partial arc is meant to reach its far end, so it divides the gaps.
    const closed = Math.abs(sweep) >= 360;
    const step = sweep / (closed ? count : Math.max(1, count - 1));
    return Array.from({ length: count }, (_, i) => {
      const deg = start + i * step;
      const rad = (deg * Math.PI) / 180;
      return {
        base: {
          ...layer.base,
          x: layer.base.x + Math.cos(rad) * radius,
          y: layer.base.y + Math.sin(rad) * radius,
          rotation: align ? layer.base.rotation + deg + 90 : layer.base.rotation,
        },
        u: spread(i, count),
        i,
        count,
      };
    });
  }

  return Array.from({ length: count }, (_, i) => ({
    base: { ...layer.base },
    u: spread(i, count),
    i,
    count,
  }));
}
