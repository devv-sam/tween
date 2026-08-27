import type { Scene, Composition } from "../core/types";
import { fieldCenter } from "../core/fields";

const SIZE = 140;

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  for (const item of scene) {
    const s = item.state;
    ctx.save();
    ctx.globalAlpha = clamp01(s.opacity);
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.scale(s.scale, s.scale);
    if (item.source.kind === "text") {
      ctx.fillStyle = "#111";
      ctx.font = "600 48px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.source.value, 0, 0);
    } else {
      ctx.fillStyle = colorFor(item.source.value);
      ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    }
    ctx.restore();
  }
}

export function drawFieldMarkers(ctx: CanvasRenderingContext2D, comp: Composition, t: number): void {
  for (const def of comp.fields ?? []) {
    const c = fieldCenter(def, t);
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, def.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const colorFor = (v: string) => (/^#([0-9a-f]{3,8})$/i.test(v) ? v : "#ff5a1f");
