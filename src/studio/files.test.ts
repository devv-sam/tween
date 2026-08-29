import { describe, it, expect } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MSG_SIZE,
  MSG_TYPE,
  baseName,
  extensionOf,
  imageError,
} from "./files";

function fakeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("imageError", () => {
  it("accepts png, jpg, and webp under 20mb", () => {
    expect(imageError(fakeFile("a.png", "image/png", 100))).toBeNull();
    expect(imageError(fakeFile("a.jpg", "image/jpeg", 100))).toBeNull();
    expect(imageError(fakeFile("a.webp", "image/webp", 100))).toBeNull();
  });

  it("rejects other types with the verbatim message", () => {
    expect(imageError(fakeFile("a.gif", "image/gif", 100))).toBe(MSG_TYPE);
    expect(imageError(fakeFile("a.pdf", "application/pdf", 100))).toBe(MSG_TYPE);
  });

  it("falls back to extension when type is empty", () => {
    expect(imageError(fakeFile("shot.png", "", 100))).toBeNull();
    expect(imageError(fakeFile("shot.gif", "", 100))).toBe(MSG_TYPE);
  });

  it("rejects files over 20mb with the verbatim message", () => {
    expect(imageError(fakeFile("a.png", "image/png", MAX_IMAGE_BYTES + 1))).toBe(MSG_SIZE);
    expect(imageError(fakeFile("a.png", "image/png", MAX_IMAGE_BYTES))).toBeNull();
  });
});

describe("extensionOf", () => {
  it("labels the three supported types, jpeg as jpg", () => {
    expect(extensionOf("shot.png")).toBe("png");
    expect(extensionOf("shot.jpg")).toBe("jpg");
    expect(extensionOf("shot.jpeg")).toBe("jpg");
    expect(extensionOf("shot.webp")).toBe("webp");
  });

  it("is case-insensitive and ignores dots earlier in the name", () => {
    expect(extensionOf("SHOT.PNG")).toBe("png");
    expect(extensionOf("v1.2.final.webp")).toBe("webp");
  });

  it("has no label for a name it doesn't recognise", () => {
    expect(extensionOf("shot.gif")).toBeNull();
    expect(extensionOf("shot")).toBeNull();
  });
});

describe("baseName", () => {
  it("drops the extension the chip already shows", () => {
    expect(baseName("logo glyph.png")).toBe("logo glyph");
    expect(baseName("v1.2.final.webp")).toBe("v1.2.final");
  });

  it("leaves a name without a known extension alone", () => {
    expect(baseName("shot.gif")).toBe("shot.gif");
    expect(baseName("shot")).toBe("shot");
  });
});
