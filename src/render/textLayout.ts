import type { Font, Glyph } from "fontkit";
import type { TextSource } from "../core/types";

export interface GlyphLayout {
  glyph: Glyph;
  /** Pen position in canvas units, from the box's top-left. */
  x: number;
  y: number;
  advance: number;
}

export interface LineLayout {
  glyphs: GlyphLayout[];
  width: number;
  /** Baseline y for this line. */
  y: number;
}

export interface CaretPosition {
  x: number;
  line: number;
  /** Top of the caret, from the box's top-left. */
  y: number;
}

export interface TextLayout {
  lines: LineLayout[];
  /** The widest line, or the wrap width for paragraph text. */
  width: number;
  totalHeight: number;
  /** Height of a caret: ascender plus descender. */
  caretHeight: number;
  /** Index N is the position before UTF-16 unit N; one more entry than the text has units. */
  caretPositions: CaretPosition[];
}

export type Align = TextSource["align"];

/** A glyph for an astral code point stands for two UTF-16 units. */
const unitsOf = (glyph: Glyph): number =>
  glyph.codePoints.reduce((n, cp) => n + (cp > 0xffff ? 2 : 1), 0);

const isSpace = (glyph: Glyph): boolean => glyph.codePoints.length === 1 && glyph.codePoints[0] === 0x20;

/**
 * Where every glyph and caret of `text` sits, in a box whose origin is its top-left.
 *
 * Shaping comes from fontkit, so kerning is already in the advances; letter spacing is
 * added between glyphs after it. `boxWidth` of 0 is point text: lines break only at
 * newlines. Otherwise words wrap at the box width, and a word wider than the box is
 * broken wherever it runs out of room.
 */
export function layoutText(
  font: Font,
  text: string,
  fontSize: number,
  boxWidth: number,
  lineHeightMultiplier: number,
  letterSpacing: number,
  align: Align = "left",
): TextLayout {
  const scale = fontSize / font.unitsPerEm;
  const leading = fontSize * lineHeightMultiplier;
  const ascender = font.ascent * scale;
  const descender = Math.abs(font.descent) * scale;
  const halfLeading = (leading - ascender - descender) / 2;

  const lines: LineLayout[] = [];
  const caretLines: CaretPosition[][] = [];
  let current: GlyphLayout[] = [];
  let carets: CaretPosition[] = [];
  let x = 0;
  /** Where a word could break on the current line, as indexes into `current`/`carets`. */
  let breakAt = -1;

  const flush = () => {
    const trimmed = current.length > 0 ? x - letterSpacing : 0;
    lines.push({ glyphs: current, width: Math.max(0, trimmed), y: 0 });
    caretLines.push(carets);
    current = [];
    carets = [];
    x = 0;
    breakAt = -1;
  };

  const paragraphs = text.split("\n");
  for (let p = 0; p < paragraphs.length; p++) {
    const run = font.layout(paragraphs[p], { liga: false, clig: false, calt: false });
    for (let i = 0; i < run.glyphs.length; i++) {
      const glyph = run.glyphs[i];
      const pos = run.positions[i];
      const advance = pos.xAdvance * scale + letterSpacing;
      const units = unitsOf(glyph);

      if (boxWidth > 0 && x + advance - letterSpacing > boxWidth && current.length > 0 && !isSpace(glyph)) {
        if (breakAt > 0 && breakAt < current.length) {
          const caretBreak = current.slice(0, breakAt).reduce((n, g) => n + unitsOf(g.glyph), 0);
          const carried = current.splice(breakAt);
          const carriedCarets = carets.splice(caretBreak);
          const shift = carried[0].x;
          x = shift;
          flush();
          for (const g of carried) current.push({ ...g, x: g.x - shift });
          for (const c of carriedCarets) carets.push({ ...c, x: c.x - shift });
          const last = carried[carried.length - 1];
          x = last.x - shift + last.advance;
        } else {
          flush();
        }
      }

      for (let u = 0; u < units; u++) carets.push({ x: x + (advance * u) / units, line: 0, y: 0 });
      current.push({ glyph, x, y: 0, advance });
      x += advance;
      if (isSpace(glyph)) breakAt = current.length;
    }
    carets.push({ x: current.length > 0 ? x - letterSpacing : 0, line: 0, y: 0 });
    flush();
  }

  const width = boxWidth > 0 ? boxWidth : Math.max(0, ...lines.map((l) => l.width));
  const caretPositions: CaretPosition[] = [];
  lines.forEach((line, li) => {
    const offset = align === "left" ? 0 : align === "right" ? width - line.width : (width - line.width) / 2;
    const baseline = li * leading + halfLeading + ascender;
    line.y = baseline;
    for (const g of line.glyphs) g.x += offset;
    for (const c of caretLines[li]) caretPositions.push({ x: c.x + offset, line: li, y: baseline - ascender });
  });

  return {
    lines,
    width,
    totalHeight: lines.length * leading,
    caretHeight: ascender + descender,
    caretPositions,
  };
}

/** The layout a text source asks for. Empty text is laid out as a space so it keeps a box. */
export function layoutSource(font: Font, src: TextSource): TextLayout {
  return layoutText(font, src.content || " ", src.fontSize, src.boxWidth ?? 0, src.lineHeight, src.letterSpacing, src.align);
}

/** The box the text occupies: the wrap width or the widest line, and never shorter than its lines. */
export function textSize(src: TextSource, layout: TextLayout): { width: number; height: number } {
  return { width: src.boxWidth ?? layout.width, height: Math.max(src.boxHeight ?? 0, layout.totalHeight) };
}
