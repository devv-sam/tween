import type { Scene, Composition, RectProps, EllipseProps, FillDef, StrokeDef, TextSource } from "../core/types";
import { fieldCenter } from "../core/fields";
import { ensureFontLoaded, ensureOpenTypeFont, getOpenTypeFont, otMeasureWidth } from "../studio/fonts";

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

function wrapLinesOT(
  font: import("opentype.js").Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && otMeasureWidth(font, test, fontSize, letterSpacing) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function wrapLinesFallback(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawText(ctx: CanvasRenderingContext2D, src: TextSource, opacity: number): void {
  ensureFontLoaded(src.fontFamily, src.fontWeight);
  ensureOpenTypeFont(src.fontFamily, src.fontWeight);
  const otFont = getOpenTypeFont(src.fontFamily, src.fontWeight);

  if (otFont) {
    drawTextOT(ctx, otFont, src, opacity);
    return;
  }

  drawTextFallback(ctx, src, opacity);
}

function drawTextOT(
  ctx: CanvasRenderingContext2D,
  font: import("opentype.js").Font,
  src: TextSource,
  opacity: number,
): void {
  const scale = src.fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const leading = src.fontSize * src.lineHeight;

  const lines = src.boxWidth
    ? wrapLinesOT(font, src.content || " ", src.fontSize, src.letterSpacing, src.boxWidth)
    : (src.content || " ").split("\n");

  const totalHeight = lines.length * leading;
  const startY = -totalHeight / 2;

  if (src.fill.type === "solid") {
    ctx.fillStyle = src.fill.color;
    ctx.globalAlpha = src.fill.opacity * opacity;
  }

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const lineWidth = otMeasureWidth(font, lineText, src.fontSize, src.letterSpacing);
    let lx: number;
    if (src.boxWidth) {
      lx = src.align === "left" ? -src.boxWidth / 2
        : src.align === "right" ? src.boxWidth / 2 - lineWidth
        : -lineWidth / 2;
    } else {
      lx = src.align === "left" ? 0
        : src.align === "right" ? -lineWidth
        : -lineWidth / 2;
    }
    const ly = startY + i * leading + ascender;

    if (src.letterSpacing !== 0) {
      const glyphs = font.stringToGlyphs(lineText);
      let cx = lx;
      for (let gi = 0; gi < glyphs.length; gi++) {
        const g = glyphs[gi];
        const path = g.getPath(cx, ly, src.fontSize);
        path.fill = ctx.fillStyle as string;
        path.draw(ctx);
        cx += (g.advanceWidth ?? 0) * scale + src.letterSpacing;
      }
    } else {
      const path = font.getPath(lineText, lx, ly, src.fontSize);
      path.fill = ctx.fillStyle as string;
      path.draw(ctx);
    }
  }
}

function drawTextFallback(ctx: CanvasRenderingContext2D, src: TextSource, opacity: number): void {
  const cssFont = `${src.fontWeight} ${src.fontSize}px "${src.fontFamily}", system-ui, sans-serif`;
  ctx.font = cssFont;
  ctx.textAlign = src.align;
  ctx.textBaseline = "top";

  const leading = src.fontSize * src.lineHeight;
  const lines = src.boxWidth
    ? wrapLinesFallback(ctx, src.content || " ", src.boxWidth)
    : (src.content || " ").split("\n");

  const totalHeight = lines.length * leading;
  const startY = -totalHeight / 2;
  let anchorX = 0;
  if (src.boxWidth) {
    anchorX = src.align === "left" ? -src.boxWidth / 2
      : src.align === "right" ? src.boxWidth / 2
      : 0;
  }

  if (src.fill.type === "solid") {
    ctx.fillStyle = src.fill.color;
    ctx.globalAlpha = src.fill.opacity * opacity;
  }

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * leading;
    if (src.letterSpacing !== 0) {
      drawLetterSpacedFallback(ctx, lines[i], anchorX, ly, src.letterSpacing, src.align);
    } else {
      ctx.fillText(lines[i], anchorX, ly);
    }
  }
}

function drawLetterSpacedFallback(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: "left" | "center" | "right",
): void {
  const chars = [...text];
  let totalWidth = 0;
  const widths: number[] = [];
  for (const ch of chars) {
    const w = ctx.measureText(ch).width;
    widths.push(w);
    totalWidth += w;
  }
  totalWidth += spacing * (chars.length - 1);

  let cx = align === "center" ? x - totalWidth / 2
    : align === "right" ? x - totalWidth
    : x;

  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, y);
    cx += widths[i] + spacing;
  }
  ctx.textAlign = savedAlign;
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
      drawText(ctx, item.source, clamp01(s.opacity));
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
