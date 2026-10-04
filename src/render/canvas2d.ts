import type { Scene, Composition, RectProps, EllipseProps, FillDef, StrokeDef } from "../core/types";
import { fieldCenter } from "../core/fields";

/** The box a shape layer draws at, before its own scale. */
export const SHAPE_SIZE = 140;
const SIZE = SHAPE_SIZE;

export type ImageLookup = (id: string) => { source: CanvasImageSource; width: number; height: number } | undefined;

function roundRectPath(x: number, y: number, w: number, h: number, r: number): Path2D {
  const path = new Path2D();
  const cr = Math.min(r, w / 2, h / 2);
  if (typeof path.roundRect === "function") {
    path.roundRect(x, y, w, h, cr);
  } else {
    path.moveTo(x + cr, y);
    path.lineTo(x + w - cr, y);
    path.quadraticCurveTo(x + w, y, x + w, y + cr);
    path.lineTo(x + w, y + h - cr);
    path.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    path.lineTo(x + cr, y + h);
    path.quadraticCurveTo(x, y + h, x, y + h - cr);
    path.lineTo(x, y + cr);
    path.quadraticCurveTo(x, y, x + cr, y);
    path.closePath();
  }
  return path;
}

function applyFill(ctx: CanvasRenderingContext2D, fill: FillDef, baseOpacity: number, path: Path2D): void {
  if (fill.type === "solid") {
    ctx.globalAlpha = fill.opacity * baseOpacity;
    ctx.fillStyle = fill.color;
    ctx.fill(path);
  }
}

function applyStroke(ctx: CanvasRenderingContext2D, stroke: StrokeDef, baseOpacity: number, path: Path2D): void {
  if (!stroke.enabled) return;
  ctx.globalAlpha = stroke.opacity * baseOpacity;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  if (stroke.dashOffset !== 0) {
    ctx.setLineDash([stroke.width * 3, stroke.width * 2]);
    ctx.lineDashOffset = -stroke.dashOffset;
  }
  ctx.stroke(path);
}

function drawRect(ctx: CanvasRenderingContext2D, props: RectProps, opacity: number): void {
  const { width, height, cornerRadius, fill, stroke } = props;
  const path = roundRectPath(-width / 2, -height / 2, width, height, cornerRadius);
  applyFill(ctx, fill, opacity, path);
  applyStroke(ctx, stroke, opacity, path);
}

function drawEllipse(ctx: CanvasRenderingContext2D, props: EllipseProps, opacity: number): void {
  const { width, height, sweepAngle, startAngle, fill, stroke } = props;
  const rx = width / 2;
  const ry = height / 2;
  const start = (startAngle - 90) * Math.PI / 180;
  const end = start + sweepAngle * Math.PI / 180;

  const path = new Path2D();
  path.ellipse(0, 0, rx, ry, 0, start, end);
  if (sweepAngle < 360) {
    path.lineTo(0, 0);
    path.closePath();
  }
  applyFill(ctx, fill, opacity, path);
  applyStroke(ctx, stroke, opacity, path);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: number,
  h: number,
  imageOf?: ImageLookup,
  background?: string,
): void {
  ctx.clearRect(0, 0, w, h);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  for (const item of scene) {
    const s = item.state;
    ctx.save();
    ctx.globalAlpha = clamp01(s.opacity);
    ctx.translate(s.x, s.y);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.scale(s.scaleX, s.scaleY);
    if (item.source.kind === "image") {
      const img = imageOf?.(item.source.value);
      if (img) ctx.drawImage(img.source, -img.width / 2, -img.height / 2, img.width, img.height);
    } else if (item.source.kind === "text") {
      ctx.fillStyle = "#111";
      ctx.font = "600 48px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.source.value, 0, 0);
    } else if (item.source.kind === "rect") {
      drawRect(ctx, item.source.props, clamp01(s.opacity));
    } else if (item.source.kind === "ellipse") {
      drawEllipse(ctx, item.source.props, clamp01(s.opacity));
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
