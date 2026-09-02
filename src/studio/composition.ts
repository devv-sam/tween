import { clamp } from "../core/math";
import type { Size } from "./view";

/** The frame rates the studio offers, and the fallback for anything else. */
export const FPS_CHOICES = [24, 30, 60] as const;

/**
 * Frame sizes, named by the shape people ask for rather than the numbers — the
 * numbers are shown alongside, but the shape is what a user is choosing.
 */
export const RESOLUTIONS: { label: string; size: Size }[] = [
  { label: "1920 × 1080", size: { width: 1920, height: 1080 } },
  { label: "1080 × 1080", size: { width: 1080, height: 1080 } },
  { label: "1080 × 1920", size: { width: 1080, height: 1920 } },
];

export const DRIVERS = ["time", "input"] as const;

export const clampFps = (fps: number): number => clamp(Math.round(fps), 1, 240);

/** `1920x1080` — the key a select uses to name one of `RESOLUTIONS`. */
export const resolutionKey = (size: Size): string => `${size.width}x${size.height}`;

export const resolutionFor = (key: string): Size | undefined =>
  RESOLUTIONS.find((r) => resolutionKey(r.size) === key)?.size;

/**
 * A hex colour the colour input will accept, or undefined while the user is still
 * typing one. Both `#abc` and `#aabbcc` are real answers; anything else is a draft.
 */
export function normalizeHex(input: string): string | undefined {
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}
