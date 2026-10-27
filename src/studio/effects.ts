export type EffectCategory = "Stylize" | "Motion" | "Text" | "Time";
export type EffectDriver = "Time" | "Input";

export interface EffectEntry {
  name: string;
  category: EffectCategory;
  driver: EffectDriver;
}

export const EFFECT_CATEGORIES: readonly EffectCategory[] = ["Stylize", "Motion", "Text", "Time"];

const entry = (category: EffectCategory, driver: EffectDriver, names: string[]): EffectEntry[] =>
  names.map((name) => ({ name, category, driver }));

export const EFFECTS: EffectEntry[] = [
  ...entry("Stylize", "Input", ["Halftone", "Dither", "ASCII", "Pixel", "Edge", "Stipple", "Crosshatch"]),
  ...entry("Stylize", "Time", ["Scanlines"]),
  ...entry("Motion", "Time", ["Follow Path", "Wiggle", "Stagger", "Orbit"]),
  ...entry("Motion", "Input", ["Look At Cursor"]),
  ...entry("Text", "Input", ["Split Characters", "Split Words", "Split Lines"]),
  ...entry("Time", "Time", ["Loop", "Delay", "Echo", "Flipbook"]),
];
