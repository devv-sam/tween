import { describe, expect, it } from "vitest";
import { COLOR_MODES, formatColor, parseColor } from "./color";

describe("color", () => {
  it("formats the same colour in every mode", () => {
    expect(formatColor("#ff0000", "HEX")).toBe("#FF0000");
    expect(formatColor("#ff0000", "RGB")).toBe("255, 0, 0");
    expect(formatColor("#ff0000", "HSL")).toBe("0, 100%, 50%");
    expect(formatColor("#ff0000", "HSB")).toBe("0, 100%, 100%");
    expect(formatColor("#336699", "HSL")).toBe("210, 50%, 40%");
    expect(formatColor("#336699", "HSB")).toBe("210, 67%, 60%");
    expect(formatColor("#ffffff", "HSL")).toBe("0, 0%, 100%");
  });

  it("parses what it formats, whatever the mode", () => {
    for (const hex of ["#ff0000", "#336699", "#ffffff", "#000000", "#12ab9c"]) {
      for (const mode of COLOR_MODES) {
        const back = parseColor(formatColor(hex, mode), mode);
        expect(back).not.toBeNull();
        // HSL and HSB are rounded to whole degrees and percents, so allow a step of drift.
        const a = parseInt(hex.slice(1), 16);
        const b = parseInt(back!.slice(1), 16);
        const drift = [16, 8, 0].map((s) => Math.abs(((a >> s) & 255) - ((b >> s) & 255)));
        expect(Math.max(...drift)).toBeLessThanOrEqual(mode === "HEX" || mode === "RGB" ? 0 : 3);
      }
    }
  });

  it("holds a half-typed value back", () => {
    expect(parseColor("#ab", "HEX")).toBeNull();
    expect(parseColor("255, 25", "RGB")).toBeNull();
    expect(parseColor("300, 0, 0", "RGB")).toBeNull();
    expect(parseColor("361, 50%, 50%", "HSL")).toBeNull();
    expect(parseColor("rgb(10 20 30)", "RGB")).toBe("#0a141e");
    expect(parseColor("#abc", "HEX")).toBe("#aabbcc");
  });
});
