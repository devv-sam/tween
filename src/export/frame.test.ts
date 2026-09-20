import { describe, expect, it } from "vitest";
import type { Composition } from "../core/types";
import { renderFrame } from "./frame";
import { avcCodec } from "./mp4";

const comp: Composition = {
  fps: 30,
  duration: 1,
  driver: { kind: "time" },
  background: "#fff",
  tracks: [
    {
      layer: {
        id: "a",
        source: { kind: "shape", value: "#000" },
        base: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      },
      modules: [],
    },
  ],
};

/** Records the calls `drawScene` makes, so a frame can be checked without a canvas. */
function stub() {
  const calls: { scale: [number, number][]; fillRect: number[][] } = { scale: [], fillRect: [] };
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    font: "",
    textAlign: "",
    textBaseline: "",
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    translate: () => {},
    rotate: () => {},
    scale: (x: number, y: number) => calls.scale.push([x, y]),
    fillRect: (...a: number[]) => calls.fillRect.push(a),
    fillText: () => {},
    drawImage: () => {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("renderFrame", () => {
  it("scales the composition to fill a smaller frame rather than cropping it", () => {
    const { ctx, calls } = stub();
    renderFrame(ctx, comp, 0, 540, 540, undefined, { width: 1080, height: 1080 });
    // The outer scale is the one renderFrame applies; the layer's own is 1:1.
    expect(calls.scale[0]).toEqual([0.5, 0.5]);
    // The background still covers the whole layout, which the scale maps onto the frame.
    expect(calls.fillRect[0]).toEqual([0, 0, 1080, 1080]);
  });

  it("leaves the frame alone when the output is the size it was laid out at", () => {
    const { ctx, calls } = stub();
    renderFrame(ctx, comp, 0, 800, 600);
    expect(calls.scale[0]).toEqual([1, 1]);
    expect(calls.fillRect[0]).toEqual([0, 0, 800, 600]);
  });
});

describe("avcCodec", () => {
  // Level 3.1 caps out at 720p, which is smaller than this app's own default frame.
  it("climbs past level 3.1 once the frame is bigger than it allows", () => {
    expect(avcCodec(1280, 720)).toBe("avc1.42001f");
    expect(avcCodec(1080, 1080)).not.toBe("avc1.42001f");
    expect(avcCodec(1920, 1080)).toBe("avc1.420028");
    expect(avcCodec(3840, 2160)).toBe("avc1.420033");
  });

  it("counts the coded area in whole macroblocks, the way the encoder does", () => {
    // 1080 rounds up to 1088 per side, which is what pushed 1080² over level 3.1.
    expect(avcCodec(1080, 1080)).toBe("avc1.420028");
  });
});
