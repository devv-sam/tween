import { describe, it, expect } from "vitest";
import "./modules/index";
import { renderState } from "./renderState";
import { emitComposition } from "./emit";
import type { Composition, Track, Transform } from "./types";

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

const comp: Composition = {
  fps: 30,
  duration: 1,
  driver: { kind: "time" },
  tracks: [
    {
      layer: { id: "card", source: { kind: "shape", value: "rect" }, base },
      modules: [{ type: "move", range: [0, 1], params: { from: 0, to: 100 } }],
    },
  ],
};

describe("renderState (evaluate face)", () => {
  it("evaluates the module across its range", () => {
    expect(renderState(comp, 0, [])[0].state.x).toBe(0);
    expect(renderState(comp, 0.5, [])[0].state.x).toBe(50);
    expect(renderState(comp, 1, [])[0].state.x).toBe(100);
  });

  it("is a pure function (same t, same result)", () => {
    expect(renderState(comp, 0.5, [])).toEqual(renderState(comp, 0.5, []));
  });
});

describe("emitComposition (emit face)", () => {
  it("serializes modules to non-empty code referencing the target", () => {
    const code = emitComposition(comp, []);
    expect(code.length).toBeGreaterThan(0);
    expect(code).toContain("card");
    expect(code).toContain("animate");
  });
});

describe("standalone keyframes", () => {
  const layer = {
    id: "el",
    source: { kind: "image" as const, value: "img" },
    base: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  };
  const withTrack = (track: Track): Composition => ({
    fps: 30,
    duration: 3,
    driver: { kind: "time" },
    tracks: [track],
  });

  it("drives a property across its range, ignoring the base", () => {
    const c = withTrack({
      layer,
      keyframes: { scale: { stops: [{ t: 0, v: 0.5 }, { t: 1, v: 1 }], range: [0, 1] } },
      modules: [],
    });
    expect(renderState(c, 0, [])[0].state.scaleX).toBe(0.5);
    expect(renderState(c, 0.5, [])[0].state.scaleX).toBe(0.75);
    expect(renderState(c, 1, [])[0].state.scaleX).toBe(1);
  });

  it("leaves the base alone outside its range", () => {
    const c = withTrack({
      layer,
      keyframes: { x: { stops: [{ t: 0, v: 900 }, { t: 1, v: 900 }], range: [0.5, 1] } },
      modules: [],
    });
    expect(renderState(c, 0.25, [])[0].state.x).toBe(10);
    expect(renderState(c, 0.75, [])[0].state.x).toBe(900);
  });

  it("settles before modules, so a module layers over the result", () => {
    const c = withTrack({
      layer,
      keyframes: { x: { stops: [{ t: 0, v: 100 }, { t: 1, v: 100 }], range: [0, 1] } },
      modules: [
        {
          type: "keyframes",
          range: [0, 1],
          params: { property: "x", stops: [{ t: 0, v: 7 }, { t: 1, v: 7 }], blend: "add" },
        },
      ],
    });
    expect(renderState(c, 0.5, [])[0].state.x).toBe(107);
  });

  it("remaps stop t inside its own window, not the composition's", () => {
    const c = withTrack({
      layer,
      keyframes: { opacity: { stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }], range: [0.5, 1] } },
      modules: [],
    });
    expect(renderState(c, 0.5, [])[0].state.opacity).toBe(0);
    expect(renderState(c, 0.75, [])[0].state.opacity).toBe(0.5);
    expect(renderState(c, 1, [])[0].state.opacity).toBe(1);
  });
});

describe("clone delay", () => {
  // A linear 0→1 curve on opacity reads back as the clone's own localT, and the path
  // distributor leaves opacity alone.
  const staggered = (delay: number): Composition => ({
    fps: 30,
    duration: 1,
    driver: { kind: "time" },
    tracks: [
      {
        layer: {
          id: "el",
          source: { kind: "shape", value: "rect" },
          base,
          distributor: {
            type: "path",
            count: 3,
            params: { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
          },
        },
        modules: [
          {
            type: "keyframes",
            range: [0, 1],
            params: { property: "opacity", stops: [{ t: 0, v: 0 }, { t: 1, v: 1 }], delay },
          },
        ],
      },
    ],
  });

  it("walks each clone back through the module's window", () => {
    const clones = renderState(staggered(0.5), 0.25, []).map((it) => it.state.opacity);
    expect(clones).toEqual([0.25, 0, 0]);
  });

  it("moves every clone as one when there is no delay", () => {
    const clones = renderState(staggered(0), 0.25, []).map((it) => it.state.opacity);
    expect(clones).toEqual([0.25, 0.25, 0.25]);
  });
});
