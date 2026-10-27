import { describe, expect, it } from "vitest";
import { capitalize, isIconFont, typeName, weightName } from "./text";

describe("capitalize", () => {
  it("raises the first letter and leaves the rest alone", () => {
    expect(capitalize("grid")).toBe("Grid");
    expect(capitalize("gap X")).toBe("Gap X");
    expect(capitalize("")).toBe("");
  });
});

describe("typeName", () => {
  it("reads an identifier as a sentence", () => {
    expect(typeName("keyframes")).toBe("Keyframes");
    expect(typeName("clonerGraph")).toBe("Cloner graph");
  });
});

describe("weightName", () => {
  it("names the standard weights", () => {
    expect(weightName(300)).toBe("Light");
    expect(weightName(400)).toBe("Regular");
    expect(weightName(500)).toBe("Medium");
    expect(weightName(600)).toBe("Semi Bold");
    expect(weightName(900)).toBe("Black");
  });

  it("keeps the number for a weight that has no name", () => {
    expect(weightName(450)).toBe("450");
  });
});

describe("isIconFont", () => {
  it("spots the icon families and leaves text ones alone", () => {
    expect(isIconFont("Material Icons")).toBe(true);
    expect(isIconFont("Material Symbols Outlined")).toBe(true);
    expect(isIconFont("Material Icons Two Tone")).toBe(true);
    expect(isIconFont("Inter")).toBe(false);
    expect(isIconFont("Materialist")).toBe(false);
  });
});
