import type { FieldDef } from "./types";
import { samplePath } from "./geometry";

export function fieldCenter(def: FieldDef, t: number): { x: number; y: number } {
  const m = def.motion;
  if (m.kind === "static") return { x: m.x, y: m.y };
  if (m.kind === "sweepX") return { x: m.from + (m.to - m.from) * t, y: m.y };
  const p = samplePath(m.points, t);
  return { x: p.x, y: p.y };
}

export function fieldValue(def: FieldDef, x: number, y: number, t: number): number {
  const c = fieldCenter(def, t);
  const d = Math.hypot(x - c.x, y - c.y);
  const inner = def.radius * (1 - def.falloff);
  if (d <= inner) return 1;
  if (d >= def.radius) return 0;
  const k = (d - inner) / (def.radius - inner);
  return 1 - k * k * (3 - 2 * k);
}
