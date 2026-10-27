export interface EffectGroup {
  category: string;
  effects: string[];
}

export const EFFECT_GROUPS: EffectGroup[] = [
  { category: "Blur & Sharpen", effects: ["Gaussian Blur", "Directional Blur", "Sharpen"] },
  { category: "Light & Shadow", effects: ["Glow", "Vignette", "Drop Shadow"] },
  { category: "Color", effects: ["Color", "Levels", "Duotone", "Posterize", "Invert"] },
  {
    category: "Stylize",
    effects: ["Film Grain", "Mosaic", "Halftone", "Dither", "ASCII", "Pixel", "Scanlines"],
  },
  { category: "Distort", effects: ["Ripple", "Twirl", "Displace"] },
  { category: "Generate", effects: ["Noise", "Gradient", "Checkerboard"] },
];
