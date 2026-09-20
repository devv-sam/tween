import { describe, it, expect } from "vitest";
import "../core/modules/index";
import { exportCode } from "./code";
import { demo } from "../demo";

describe("code export", () => {
  it("bakes a runnable waapi snippet per layer", () => {
    const html = exportCode(demo, [], 30);
    expect(html).toContain("animate");
    expect(html).toContain("translate(");
    expect(html).toContain('id="card"');
  });
  it("is deterministic", () => {
    expect(exportCode(demo, [], 30)).toBe(exportCode(demo, [], 30));
  });
});

describe("an svg node in the export", () => {
  const comp = {
    fps: 30,
    duration: 2,
    driver: { kind: "time" as const },
    tracks: [
      {
        layer: {
          id: "path-0",
          source: { kind: "image" as const, value: "a" },
          base: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        },
        modules: [],
      },
      {
        layer: {
          id: "photo",
          source: { kind: "image" as const, value: "b" },
          base: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        },
        modules: [],
      },
    ],
  };
  const content = {
    "path-0": {
      svgSource:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 260" width="224" height="260"><path d="M 40 20" fill="#1a0f00"/></svg>',
      width: 224,
      height: 260,
    },
  };

  it("ships the node's own markup, not a picture of it", () => {
    const html = exportCode(comp, [], 4, content);
    expect(html).toContain('<path d="M 40 20" fill="#1a0f00"/>');
    expect(html).toContain('viewBox="0 0 224 260"');
    expect(html).not.toContain("<img");
  });

  it("wraps it in the same animated div every other layer gets", () => {
    const html = exportCode(comp, [], 4, content);
    expect(html).toContain('<div id="path-0" class="layer is-svg"');
    // The animation still drives the wrapper by id — the markup inside is along for
    // the ride, which is what leaves it addressable by anything else.
    expect(html).toContain('document.getElementById("path-0").animate');
  });

  it("centres the node's canvas on the transform, as the standing box is", () => {
    expect(exportCode(comp, [], 4, content)).toContain("left:-112px;top:-130px");
  });

  it("leaves a layer with no markup as the box it has always been", () => {
    expect(exportCode(comp, [], 4, content)).toContain('<div id="photo" class="layer"></div>');
  });

  it("is still deterministic", () => {
    expect(exportCode(comp, [], 4, content)).toBe(exportCode(comp, [], 4, content));
  });
});
