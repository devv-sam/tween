import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("core purity boundary", () => {
  it("core imports nothing from render/export/ui and no DOM globals", () => {
    const files = walk("src/core").filter((f) => f.endsWith(".ts"));
    const bad = /from\s+["'](\.\.\/)*(render|export|ui)\//;
    const dom = /\b(document|window)\b/;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(bad.test(src), `${f} imports a forbidden layer`).toBe(false);
      const codeOnly = src.replace(/`[^`]*`|"[^"]*"|'[^']*'/g, "");
      expect(dom.test(codeOnly), `${f} touches the DOM`).toBe(false);
    }
  });
});
