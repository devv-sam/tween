import * as fontkit from "fontkit";
import type { Font } from "fontkit";
import { setCharMeasurer } from "../core/distribute";
import { layoutText } from "./textLayout";

const files = new Map<string, Record<string, string>>();
const cache = new Map<string, Font>();
const pending = new Map<string, Promise<Font>>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

/** Weight-keyed file URLs from the Google Fonts API ("regular", "700", …). */
export function registerFontFiles(family: string, urls: Record<string, string>): void {
  files.set(family, urls);
}

const keyOf = (family: string, weight: number) => `${family}:${weight}`;

/** The parsed font if it has arrived. Otherwise starts the fetch and answers nothing. */
export function peekFont(family: string, weight: number): Font | undefined {
  const key = keyOf(family, weight);
  const hit = cache.get(key);
  if (!hit && !failed.has(key)) void getFont(family, weight).catch(() => {});
  return hit;
}

export function getFont(family: string, weight: number): Promise<Font> {
  const key = keyOf(family, weight);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const load = fetchAndParse(family, weight).then(
    (font) => {
      cache.set(key, font);
      pending.delete(key);
      for (const fn of listeners) fn();
      return font;
    },
    (err: unknown) => {
      pending.delete(key);
      failed.add(key);
      throw err;
    },
  );
  pending.set(key, load);
  return load;
}

/** Fires each time a font finishes parsing, so a paused canvas can repaint with it. */
export function onFontLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function fetchAndParse(family: string, weight: number): Promise<Font> {
  const urls = files.get(family);
  const url = urls?.[weight === 400 ? "regular" : String(weight)] ?? urls?.regular;
  if (!url) throw new Error(`no font file for ${family} ${weight}`);
  const res = await fetch(url.replace(/^http:/, "https:"));
  if (!res.ok) throw new Error(`font fetch failed: ${res.status} ${url}`);
  return parseFont(new Uint8Array(await res.arrayBuffer()), weight);
}

/** A variable font carries every weight in one file; a static one is the weight it is. */
export function parseFont(bytes: Uint8Array, weight: number): Font {
  const parsed = fontkit.create(bytes as unknown as Buffer);
  const font = "fonts" in parsed ? parsed.fonts[0] : parsed;
  return font.variationAxes.wght ? font.getVariation({ wght: weight }) : font;
}

setCharMeasurer((src) => {
  const font = cache.get(keyOf(src.fontFamily, src.fontWeight));
  if (!font) return null;
  const { caretPositions, width } = layoutText(font, src.content, src.fontSize, 0, src.lineHeight, src.letterSpacing);
  const centers: number[] = [];
  let unit = 0;
  for (const ch of src.content) {
    const next = unit + ch.length;
    centers.push((caretPositions[unit].x + caretPositions[next].x - src.letterSpacing) / 2);
    unit = next;
  }
  return { centers, width };
});
