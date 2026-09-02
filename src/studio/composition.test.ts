import { describe, expect, it } from "vitest";
import {
  RESOLUTIONS,
  clampFps,
  normalizeHex,
  resolutionFor,
  resolutionKey,
} from "./composition";

describe("clampFps", () => {
  it("rounds and keeps a playable rate", () => {
    expect(clampFps(29.7)).toBe(30);
    expect(clampFps(0)).toBe(1);
    expect(clampFps(1e6)).toBe(240);
  });
});

describe("resolutions", () => {
  it("round-trips every preset through its key", () => {
    for (const r of RESOLUTIONS) {
      expect(resolutionFor(resolutionKey(r.size))).toEqual(r.size);
    }
  });

  it("has no answer for a size it does not offer", () => {
    expect(resolutionFor("640x480")).toBeUndefined();
  });
});

describe("normalizeHex", () => {
  it("accepts both lengths, with or without the hash", () => {
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("aabbcc")).toBe("#aabbcc");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("  #ABC  ")).toBe("#aabbcc");
  });

  it("treats a half-typed colour as a draft, not a value", () => {
    for (const bad of ["", "#", "#ab", "#abcd", "#gggggg", "red"]) {
      expect(normalizeHex(bad)).toBeUndefined();
    }
  });
});
