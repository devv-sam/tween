import opentype from "opentype.js";

const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

export function loadGoogleFont(family: string, weight = 400): Promise<void> {
  const key = `${family}:${weight}`;
  if (loaded.has(key)) return Promise.resolve();
  const inflight = loading.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const id = `gf-${family.replace(/\s+/g, "-")}-${weight}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
      document.head.appendChild(link);
    }
    try {
      await document.fonts.load(`${weight} 48px "${family}"`);
    } catch {
      // font may still render via the stylesheet
    }
    loaded.add(key);
    loading.delete(key);
  })();

  loading.set(key, p);
  return p;
}

export function ensureFontLoaded(family: string, weight = 400): boolean {
  const key = `${family}:${weight}`;
  if (loaded.has(key)) return true;
  void loadGoogleFont(family, weight);
  return false;
}

// ---------------------------------------------------------------------------
// opentype.js font file cache
// ---------------------------------------------------------------------------

const fontCache = new Map<string, opentype.Font>();
const fontLoading = new Map<string, Promise<opentype.Font | null>>();
const fontFileUrls = new Map<string, Record<string, string>>();

export function registerFontFiles(family: string, files: Record<string, string>) {
  fontFileUrls.set(family, files);
}

function variantKey(weight: number): string {
  if (weight === 400) return "regular";
  if (weight === 700) return "700";
  return String(weight);
}

function fontFileUrl(family: string, weight: number): string | null {
  const files = fontFileUrls.get(family);
  if (!files) return null;
  return files[variantKey(weight)] ?? files["regular"] ?? null;
}

export function getOpenTypeFont(family: string, weight = 400): opentype.Font | null {
  const key = `${family}:${weight}`;
  return fontCache.get(key) ?? null;
}

export function loadOpenTypeFont(family: string, weight = 400): Promise<opentype.Font | null> {
  const key = `${family}:${weight}`;
  const cached = fontCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = fontLoading.get(key);
  if (inflight) return inflight;

  const url = fontFileUrl(family, weight);
  if (!url) return Promise.resolve(null);

  const p = (async () => {
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const font = opentype.parse(buf);
      fontCache.set(key, font);
      fontLoading.delete(key);
      return font;
    } catch {
      fontLoading.delete(key);
      return null;
    }
  })();

  fontLoading.set(key, p);
  return p;
}

export function ensureOpenTypeFont(family: string, weight = 400): opentype.Font | null {
  const key = `${family}:${weight}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  void loadOpenTypeFont(family, weight);
  return null;
}

// ---------------------------------------------------------------------------
// Text measurement using opentype when available, canvas fallback
// ---------------------------------------------------------------------------

let measureCtx: CanvasRenderingContext2D | null = null;

export function measureTextWidth(
  text: string,
  family: string,
  weight: number,
  fontSize: number,
  letterSpacing: number,
): number {
  const font = getOpenTypeFont(family, weight);
  if (font) {
    return otMeasureWidth(font, text || " ", fontSize, letterSpacing);
  }
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d")!;
  }
  measureCtx.font = `${weight} ${fontSize}px "${family}", system-ui, sans-serif`;
  if (letterSpacing === 0) {
    return measureCtx.measureText(text || " ").width;
  }
  const chars = [...(text || " ")];
  let w = 0;
  for (const ch of chars) w += measureCtx.measureText(ch).width;
  w += letterSpacing * Math.max(0, chars.length - 1);
  return w;
}

// ---------------------------------------------------------------------------
// opentype metric helpers
// ---------------------------------------------------------------------------

export function otMeasureWidth(
  font: opentype.Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
  const scale = fontSize / font.unitsPerEm;
  let glyphs: opentype.Glyph[];
  try {
    glyphs = font.stringToGlyphs(text);
  } catch {
    return text.length * fontSize * 0.6 + letterSpacing * Math.max(0, text.length - 1);
  }
  let w = 0;
  for (const g of glyphs) w += (g.advanceWidth ?? 0) * scale;
  w += letterSpacing * Math.max(0, glyphs.length - 1);
  return w;
}

export interface TextMetrics {
  width: number;
  height: number;
  ascender: number;
  descender: number;
}

export function otTextMetrics(
  font: opentype.Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
  lineHeight: number,
): TextMetrics {
  const scale = fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = Math.abs(font.descender * scale);
  const width = otMeasureWidth(font, text || " ", fontSize, letterSpacing);
  const height = fontSize * lineHeight;
  return { width, height, ascender, descender };
}

export function otCharPositions(
  font: opentype.Font,
  text: string,
  fontSize: number,
  letterSpacing: number,
): number[] {
  const scale = fontSize / font.unitsPerEm;
  let glyphs: opentype.Glyph[];
  try {
    glyphs = font.stringToGlyphs(text);
  } catch {
    const fallbackAdv = fontSize * 0.6;
    const positions: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      positions.push((i + 1) * fallbackAdv + i * letterSpacing);
    }
    return positions;
  }
  const positions: number[] = [0];
  let x = 0;
  for (let i = 0; i < glyphs.length; i++) {
    x += (glyphs[i].advanceWidth ?? 0) * scale;
    if (i < glyphs.length - 1) x += letterSpacing;
    positions.push(x);
  }
  return positions;
}
