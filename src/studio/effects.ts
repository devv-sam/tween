export interface EffectGroup {
  category: string;
  effects: string[];
}

export const EFFECT_GROUPS: EffectGroup[] = [
  {
    category: "Stylize",
    effects: ["Halftone", "Dither", "ASCII", "Pixel", "Scanlines", "Edge", "Stipple", "Crosshatch"],
  },
  {
    category: "Motion",
    effects: ["Follow Path", "Wiggle", "Stagger", "Orbit", "Look At Cursor"],
  },
  { category: "Text", effects: ["Split Characters", "Split Words", "Split Lines"] },
  { category: "Time", effects: ["Loop", "Delay", "Echo", "Flipbook"] },
];
