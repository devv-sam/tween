import type { Layer, Transform } from "./types";
import { samplePath, type Pt } from "./geometry";

export interface Instance { base: Transform; u: number; i: number; count: number; }

export function expand(layer: Layer): Instance[] {
  const d = layer.distributor;
  if (!d || d.type === "none" || d.count <= 1) {
    return [{ base: { ...layer.base }, u: 0, i: 0, count: 1 }];
  }
  const count = d.count;
  if (d.type === "path") {
    const points = (d.params?.points as Pt[]) ?? [];
    const align = Boolean(d.params?.align);
    return Array.from({ length: count }, (_, i) => {
      const u = count > 1 ? i / (count - 1) : 0;
      const s = samplePath(points, u);
      return { base: { ...layer.base, x: s.x, y: s.y, rotation: align ? s.angle : layer.base.rotation }, u, i, count };
    });
  }
  return Array.from({ length: count }, (_, i) => ({ base: { ...layer.base }, u: count > 1 ? i / (count - 1) : 0, i, count }));
}
