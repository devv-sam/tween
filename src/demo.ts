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

const arc = [{ x: 150, y: 300 }, { x: 300, y: 150 }, { x: 500, y: 150 }, { x: 650, y: 300 }];

export const demo3: Composition = {
  fps: 30,
  duration: 3,
  driver: { kind: "time" },
  fields: [{ id: "beam", radius: 170, falloff: 0.6, motion: { kind: "alongPath", points: arc } }],
  tracks: [
    {
      layer: {
        id: "cloner",
        source: { kind: "shape", value: "#111111" },
        base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.4 },
        distributor: { type: "path", count: 12, params: { points: arc, align: false } },
      },
      modules: [
        { type: "clonerGraph", range: [0, 1], params: { property: "scale", blend: "mul", stops: [
          { t: 0, v: 0.5 }, { t: 0.5, v: 1.2, ease: "inout" }, { t: 1, v: 0.5 } ] } },
        { type: "field", range: [0, 1], params: { fieldId: "beam", property: "scale", amount: 1.8, blend: "mul" } },
        { type: "field", range: [0, 1], params: { fieldId: "beam", property: "opacity", amount: 0.6, blend: "add" } },
      ],
    },
  ],
};
