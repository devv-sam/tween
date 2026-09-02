import { afterEach, describe, expect, it, vi } from "vitest";
import { readAssetsCollapsed, readFlag, writeAssetsCollapsed, writeFlag } from "./prefs";

/** The suite runs in node, where there is no `localStorage` — the same shape a
 *  browser with site data blocked presents, minus the throwing. */
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("prefs", () => {
  it("round-trips a flag", () => {
    stubStorage();
    writeAssetsCollapsed(true);
    expect(readAssetsCollapsed()).toBe(true);
    writeAssetsCollapsed(false);
    expect(readAssetsCollapsed()).toBe(false);
  });

  it("falls back when nothing was stored", () => {
    stubStorage();
    expect(readFlag("tween:missing", true)).toBe(true);
    expect(readFlag("tween:missing", false)).toBe(false);
  });

  it("survives storage that is missing or throws", () => {
    expect(readAssetsCollapsed()).toBe(false);
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    expect(() => writeFlag("tween:x", true)).not.toThrow();
    expect(readFlag("tween:x", true)).toBe(true);
  });
});
