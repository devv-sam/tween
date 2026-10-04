import { describe, expect, it } from "vitest";
import { capitalize, typeName } from "./text";

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
