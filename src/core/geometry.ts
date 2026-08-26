export interface Pt { x: number; y: number; }

export function samplePath(points: Pt[], u: number): { x: number; y: number; angle: number } {
  if (points.length === 0) return { x: 0, y: 0, angle: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 };
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(d); total += d;
  }
  let target = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i] || i === segs.length - 1) {
      const lt = segs[i] === 0 ? 0 : target / segs[i];
      const a = points[i], b = points[i + 1];
      return { x: a.x + (b.x - a.x) * lt, y: a.y + (b.y - a.y) * lt, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
    }
    target -= segs[i];
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}
