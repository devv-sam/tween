import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFont } from "./fontCache";
import { layoutText } from "./textLayout";

const font = parseFont(new Uint8Array(readFileSync(new URL("./__fixtures__/Inter-Regular.ttf", import.meta.url))), 400);

describe("layoutText", () => {
  it("caret positions increase monotonically for ASCII text", () => {
    const { caretPositions } = layoutText(font, "weird spacing", 48, 0, 1.2, 0);
    for (let i = 1; i < caretPositions.length; i++) {
      expect(caretPositions[i].x).toBeGreaterThan(caretPositions[i - 1].x);
    }
  });

  it("total caretPositions count equals string length + 1", () => {
    for (const text of ["", "a", "weird spacing", "two\nlines", "emoji 😀 here", "fi ligature", "ﬁ", "😀x", "e\u0301", "x😀\ny"]) {
      expect(layoutText(font, text, 48, 0, 1.2, 0).caretPositions.length).toBe(text.length + 1);
    }
  });

  it("wraps at boxWidth correctly — no glyph x exceeds boxWidth", () => {
    const layout = layoutText(font, "the quick brown fox jumps over the lazy dog", 48, 300, 1.2, 0);
    for (const line of layout.lines) {
      for (const g of line.glyphs) expect(g.x).toBeLessThanOrEqual(300);
      expect(line.width).toBeLessThanOrEqual(300 + 0.01);
    }
    expect(layout.lines.length).toBeGreaterThan(1);
  });

  it("point text box width equals last caret position x", () => {
    const layout = layoutText(font, "weird spacing", 48, 0, 1.2, 0);
    expect(layout.width).toBeCloseTo(layout.caretPositions.at(-1)!.x);
  });

  it("line count increases when text exceeds boxWidth", () => {
    const text = "weird spacing";
    const wide = layoutText(font, text, 48, 1000, 1.2, 0);
    const narrow = layoutText(font, text, 48, 200, 1.2, 0);
    expect(wide.lines.length).toBe(1);
    expect(narrow.lines.length).toBe(2);
    expect(narrow.totalHeight).toBeCloseTo(2 * 48 * 1.2);
  });

  it("applies kerning from the font", () => {
    const kerned = layoutText(font, "AV", 48, 0, 1.2, 0).width;
    const apart = layoutText(font, "A", 48, 0, 1.2, 0).width + layoutText(font, "V", 48, 0, 1.2, 0).width;
    expect(kerned).toBeLessThan(apart);
  });

  it("adds letter spacing between glyphs, not after the last", () => {
    const plain = layoutText(font, "abc", 48, 0, 1.2, 0).width;
    const spaced = layoutText(font, "abc", 48, 0, 1.2, 10).width;
    expect(spaced).toBeCloseTo(plain + 20);
  });

  it("breaks a word wider than the box between its glyphs", () => {
    const layout = layoutText(font, "supercalifragilistic", 48, 100, 1.2, 0);
    expect(layout.lines.length).toBeGreaterThan(1);
    for (const line of layout.lines) expect(line.width).toBeLessThanOrEqual(100.01);
  });

  it("centres lines inside the box", () => {
    const layout = layoutText(font, "ab\nabcd", 48, 0, 1.2, 0, "center");
    const [short, long] = layout.lines;
    expect(long.glyphs[0].x).toBe(0);
    expect(short.glyphs[0].x).toBeCloseTo((long.width - short.width) / 2);
    expect(layout.caretPositions[0].x).toBeCloseTo(short.glyphs[0].x);
  });
});
