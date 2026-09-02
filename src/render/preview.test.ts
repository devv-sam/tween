import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Composition } from "../core/types";
import { Preview } from "./preview";

const comp = (duration: number): Composition => ({
  fps: 30,
  duration,
  driver: { kind: "time" },
  tracks: [],
});

/** A hand-cranked rAF, so playback advances by exact frames instead of wall clock. */
let queue: FrameRequestCallback[] = [];
/** rAF timestamps are page-relative; starting past zero keeps the first one truthy. */
let now = 1000;

const step = (ms: number) => {
  now += ms;
  const due = queue;
  queue = [];
  for (const cb of due) cb(now);
};

beforeEach(() => {
  queue = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {
    queue = [];
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Preview as a clock", () => {
  it("advances t over the composition's duration", () => {
    const p = new Preview(null, comp(2));
    const seen: number[] = [];
    p.onTick = (t) => seen.push(t);
    p.play();
    step(0); // first frame only sets the baseline
    step(500);
    expect(p.t).toBeCloseTo(0.25);
    expect(seen[seen.length - 1]).toBeCloseTo(0.25);
  });

  it("wraps back to the start while looping", () => {
    const p = new Preview(null, comp(2));
    p.play();
    step(0);
    step(1500);
    step(1000);
    expect(p.t).toBeCloseTo(0.25);
    expect(p.playing).toBe(true);
  });

  it("stops on the last frame with loop off", () => {
    const p = new Preview(null, comp(2));
    const ended = vi.fn();
    p.loop = false;
    p.onEnd = ended;
    p.play();
    step(0);
    step(2500);
    expect(p.t).toBe(1);
    expect(p.playing).toBe(false);
    expect(ended).toHaveBeenCalledOnce();
  });

  it("takes a new duration mid-flight", () => {
    const p = new Preview(null, comp(2));
    p.play();
    step(0);
    p.setComposition(comp(4));
    step(1000);
    expect(p.t).toBeCloseTo(0.25);
  });

  it("seeking reports the new time without a frame", () => {
    const p = new Preview(null, comp(2));
    const seen: number[] = [];
    p.onTick = (t) => seen.push(t);
    p.seek(0.4);
    expect(p.t).toBe(0.4);
    expect(seen).toEqual([0.4]);
  });

  it("pausing leaves no frame pending", () => {
    const p = new Preview(null, comp(2));
    p.play();
    step(0);
    p.pause();
    step(1000);
    expect(p.t).toBe(0);
    expect(p.playing).toBe(false);
  });
});

describe("Preview loops at the end of the work", () => {
  /** A 2s composition whose only animation stops a quarter of the way in. */
  const trimmed = (end: number): Composition => ({
    fps: 30,
    duration: 2,
    driver: { kind: "time" },
    tracks: [
      {
        layer: {
          id: "el",
          source: { kind: "image", value: "img" },
          base: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        },
        keyframes: { scale: { stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }], range: [0, end] } },
        modules: [],
      },
    ],
  });

  it("turns over once the work ends, not when the timeline does", () => {
    const p = new Preview(null, trimmed(0.5));
    p.play();
    step(0);
    step(900); // 0.45 of a 2s comp — still inside the work
    expect(p.t).toBeCloseTo(0.45);
    step(200); // 0.55 would be past the end, so it wraps
    expect(p.t).toBeCloseTo(0.05);
    expect(p.playing).toBe(true);
  });

  it("stops at the end of the work with loop off", () => {
    const p = new Preview(null, trimmed(0.5));
    const ended = vi.fn();
    p.loop = false;
    p.onEnd = ended;
    p.play();
    step(0);
    step(1500);
    expect(p.t).toBeCloseTo(0.5);
    expect(p.playing).toBe(false);
    expect(ended).toHaveBeenCalledOnce();
  });

  it("reaches for the furthest block when several disagree", () => {
    const c = trimmed(0.3);
    c.tracks[0].modules = [
      { type: "keyframes", range: [0, 0.8], params: { property: "x", stops: [] } },
    ];
    const p = new Preview(null, c);
    p.play();
    step(0);
    step(1400); // 0.7 — inside the further block, so no wrap yet
    expect(p.t).toBeCloseTo(0.7);
  });

  it("plays its whole length when there is nothing on it", () => {
    const p = new Preview(null, comp(2));
    p.play();
    step(0);
    step(1800);
    expect(p.t).toBeCloseTo(0.9);
  });
});
