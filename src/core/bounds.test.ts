import { describe, expect, it } from "vitest";
import { contentEnd } from "./bounds";
import type { Composition, Track } from "./types";

const layer = {
  id: "el",
  source: { kind: "image" as const, value: "img" },
  base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
};

const comp = (tracks: Track[]): Composition => ({
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  tracks,
});

const kf = (end: number) => ({
  stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }],
  range: [0, end] as [number, number],
});

describe("contentEnd", () => {
  it("plays the whole length when there is no work to measure", () => {
    expect(contentEnd(comp([]), [])).toBe(1);
    expect(contentEnd(comp([{ layer, modules: [] }]), [])).toBe(1);
  });

  it("reaches the furthest standalone set", () => {
    expect(contentEnd(comp([{ layer, keyframes: { x: kf(0.4), y: kf(0.75) }, modules: [] }]), [])).toBe(
      0.75,
    );
  });

  it("counts modules alongside standalone sets", () => {
    const track: Track = {
      layer,
      keyframes: { x: kf(0.3) },
      modules: [{ type: "keyframes", range: [0.1, 0.9], params: {} }],
    };
    expect(contentEnd(comp([track]), [])).toBe(0.9);
  });

  it("reaches across every element, not just the first", () => {
    expect(
      contentEnd(
        comp([
          { layer, keyframes: { x: kf(0.2) }, modules: [] },
          { layer: { ...layer, id: "b" }, keyframes: { y: kf(0.65) }, modules: [] },
        ]),
        [],
      ),
    ).toBe(0.65);
  });

  it("never reports past the end of the timeline", () => {
    expect(contentEnd(comp([{ layer, keyframes: { x: kf(1) }, modules: [] }]), [])).toBe(1);
  });
});
