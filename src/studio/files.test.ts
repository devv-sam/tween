import { describe, it, expect } from "vitest";
import { MAX_IMAGE_BYTES, MSG_SIZE, MSG_TYPE, imageError } from "./files";

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
