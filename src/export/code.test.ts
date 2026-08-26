import { describe, it, expect } from "vitest";
import "../core/modules/index";
import { exportCode } from "./code";
import { demo } from "../demo";

describe("code export", () => {
  it("bakes a runnable waapi snippet per layer", () => {
    const html = exportCode(demo, 30);
    expect(html).toContain("animate");
    expect(html).toContain("translate(");
    expect(html).toContain('id="card"');
  });
  it("is deterministic", () => {
    expect(exportCode(demo, 30)).toBe(exportCode(demo, 30));
  });
});
