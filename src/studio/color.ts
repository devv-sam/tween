import { normalizeHex } from "./composition";

export type ColorMode = "HEX" | "RGB" | "HSL" | "HSB";
export const COLOR_MODES: readonly ColorMode[] = ["HEX", "RGB", "HSL", "HSB"];

type Triple = [number, number, number];

const toRgb = (hex: string): Triple => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (rgb: Triple) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Hue in degrees, and the two ends of the channel range the other axes are measured on. */
function hueRange([r, g, b]: Triple): { h: number; max: number; min: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const h =
    d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, max, min };
}

function rgbToHsl(rgb: Triple): Triple {
  const { h, max, min } = hueRange(rgb);
  const l = (max + min) / 510;
  const s = max === min ? 0 : (max - min) / 255 / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
}

function rgbToHsb(rgb: Triple): Triple {
  const { h, max, min } = hueRange(rgb);
  return [h, max === 0 ? 0 : ((max - min) / max) * 100, (max / 255) * 100];
}

/** The shared tail of both cylinders: chroma, hue sector, and where the channels sit. */
function fromHue(h: number, chroma: number, offset: number): Triple {
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const sector: Triple[] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  return sector[Math.min(5, Math.floor(h / 60))].map((c) => (c + offset) * 255) as Triple;
}

function hslToRgb([h, s, l]: Triple): Triple {
  const chroma = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  return fromHue(h, chroma, l / 100 - chroma / 2);
}

function hsbToRgb([h, s, b]: Triple): Triple {
  const chroma = (b / 100) * (s / 100);
  return fromHue(h, chroma, b / 100 - chroma);
}

/** A `#rrggbb` colour as the text the given mode shows for it. */
export function formatColor(hex: string, mode: ColorMode): string {
  const rgb = toRgb(hex);
  if (mode === "HEX") return hex.toUpperCase();
  if (mode === "RGB") return rgb.join(", ");
  const [h, s, x] = mode === "HSL" ? rgbToHsl(rgb) : rgbToHsb(rgb);
  return `${Math.round(h) % 360}, ${Math.round(s)}%, ${Math.round(x)}%`;
}

/** The `#rrggbb` a mode's text stands for, or null while it is not a whole colour yet. */
export function parseColor(text: string, mode: ColorMode): string | null {
  if (mode === "HEX") return normalizeHex(text) ?? null;
  const parts = text.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!parts || parts.length !== 3) return null;
  const limits = mode === "RGB" ? [255, 255, 255] : [360, 100, 100];
  if (parts.some((p, i) => p > limits[i])) return null;
  const triple = parts as Triple;
  return toHex(mode === "RGB" ? triple : mode === "HSL" ? hslToRgb(triple) : hsbToRgb(triple));
}
