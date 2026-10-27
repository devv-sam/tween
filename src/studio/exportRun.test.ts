import { describe, expect, it } from "vitest";
import { evenSize, fileNameOf } from "./exportRun";

describe("evenSize", () => {
  it("rounds to a whole 2 px step and never goes below 2", () => {
    expect(evenSize(1081)).toBe(1082);
    expect(evenSize(540.4)).toBe(540);
    expect(evenSize(0.2)).toBe(2);
  });
});

describe("fileNameOf", () => {
  it("adds the extension once", () => {
    expect(fileNameOf("comp-01", "mp4")).toBe("comp-01.mp4");
    expect(fileNameOf("comp-01.MP4", "mp4")).toBe("comp-01.mp4");
  });

  it("drops characters a file name cannot hold and falls back when nothing is left", () => {
    expect(fileNameOf('a/b:c*?"<>|', "gif")).toBe("abc.gif");
    expect(fileNameOf("   ", "html")).toBe("comp-01.html");
  });
});
