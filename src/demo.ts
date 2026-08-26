import type { Composition, Transform } from "./core/types";

const base: Transform = { x: 400, y: 300, scale: 1, rotation: 0, opacity: 1 };

export const demo: Composition = {
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  tracks: [
    {
      layer: { id: "card", source: { kind: "shape", value: "#ff5a1f" }, base },
      modules: [
        { type: "keyframes", range: [0, 1], params: { property: "x", stops: [
          { t: 0, v: 120 }, { t: 0.25, v: 400, ease: "out" }, { t: 0.75, v: 400 }, { t: 1, v: 700, ease: "in" },
        ] } },
        { type: "keyframes", range: [0, 1], params: { property: "opacity", stops: [
          { t: 0, v: 0 }, { t: 0.2, v: 1 }, { t: 0.8, v: 1 }, { t: 1, v: 0 },
        ] } },
        { type: "keyframes", range: [0, 1], params: { property: "scale", stops: [
          { t: 0, v: 0.6 }, { t: 0.25, v: 1, ease: "out" },
        ] } },
      ],
    },
  ],
};
