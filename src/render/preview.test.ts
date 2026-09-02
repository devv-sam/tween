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
