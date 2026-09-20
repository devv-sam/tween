import { describe, it, expect } from "vitest";
import { isLinked, resolveModule, resolveModules } from "./library";
import type { LinkedModule, ModuleAsset, ModuleData } from "./types";

const entry = (type: string, params: Record<string, unknown> = {}): ModuleData => ({
  type,
  range: [0, 1],
  params,
});

const asset: ModuleAsset = {
  id: "a1",
  name: "card fan",
  createdAt: 0,
  stack: [
    entry("keyframes", { property: "scale", delay: 0 }),
    entry("clonerGraph", { property: "opacity", delay: 0 }),
  ],
};

const link = (overrides: LinkedModule["overrides"] = {}): LinkedModule => ({
  kind: "linked",
  ref: "a1",
  overrides,
});

describe("resolveModule", () => {
  it("passes raw module data straight through", () => {
    const raw = entry("keyframes", { property: "x" });
    expect(resolveModule(raw, [])).toEqual([raw]);
    expect(isLinked(raw)).toBe(false);
  });

  it("resolves a link to the asset's whole stack", () => {
    expect(resolveModule(link(), [asset]).map((md) => md.type)).toEqual([
      "keyframes",
      "clonerGraph",
    ]);
  });

  it("applies an override to the entry it is keyed to, and no other", () => {
    const [first, second] = resolveModule(link({ 1: { delay: 0.2 } }), [asset]);
    expect(first.params.delay).toBe(0);
    expect(second.params.delay).toBe(0.2);
  });

  it("leaves the master alone", () => {
    resolveModule(link({ 0: { delay: 0.9 } }), [asset]);
    expect(asset.stack[0].params.delay).toBe(0);
  });

  it("throws on a reference with nothing behind it", () => {
    expect(() => resolveModule(link(), [])).toThrow("a1");
  });

  it("flattens a mixed stack in the order the element holds it", () => {
    const raw = entry("move");
    expect(resolveModules([raw, link()], [asset]).map((md) => md.type)).toEqual([
      "move",
      "keyframes",
      "clonerGraph",
    ]);
  });
});
