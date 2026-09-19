// @vitest-environment jsdom
// End to end over the seam this increment is really about: a file goes in, and what
// comes out the far side is a page holding real vector nodes.
import { describe, expect, it } from "vitest";
import { dissect } from "./svg";
import { exportContent, type SvgNodeAsset } from "./store";
import { exportCode } from "../export/code";
import type { Composition } from "../core/types";

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 224 260" width="224" height="260">
  <title>tween</title>
  <defs><linearGradient id="unused"/></defs>
  <path id="letterform" d="M60 30 L60 180 L98 180 Z" fill="#1a0f00"/>
  <rect id="period" x="160" y="180" width="36" height="36" rx="4" fill="#ff5a1f"/>
</svg>`;

/** The shape the store builds on import, without the blob URLs a test has no use for. */
function assetsFor(text: string, filename: string): SvgNodeAsset[] {
  const cut = dissect(text, filename)!;
  const group = { id: "group-1", label: cut.label };
  return cut.nodes.map((node, i) => ({
    id: `asset-${i}`,
    kind: "svg-node",
    src: `blob:${i}`,
    name: node.label,
    naturalW: cut.width,
    naturalH: cut.height,
    svgSource: node.svgSource,
    viewBox: cut.viewBox,
    preserveAspectRatio: node.preserveAspectRatio,
    label: node.label,
    content: node.content,
    group,
    offset: node.offset,
  }));
}

const compositionOf = (assets: SvgNodeAsset[]): Composition => ({
  fps: 30,
  duration: 2,
  driver: { kind: "time" },
  tracks: assets.map((a) => ({
    layer: {
      id: a.label,
      source: { kind: "image", value: a.id },
      base: { x: 960, y: 540, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    },
    modules: [],
  })),
});

describe("a dissected svg, all the way to an exported page", () => {
  const assets = assetsFor(LOGO, "tween-logo.svg");
  const comp = compositionOf(assets);
  const html = exportCode(comp, 8, exportContent(comp, assets));

  it("comes apart into the nodes the file was drawn from", () => {
    expect(assets.map((a) => a.label)).toEqual(["letterform", "period"]);
    expect(assets.every((a) => a.group.label === "tween-logo")).toBe(true);
  });

  it("ships one wrapper per node", () => {
    expect(html.match(/class="layer is-svg"/g)).toHaveLength(2);
    expect(html).toContain('<div id="letterform" class="layer is-svg"');
    expect(html).toContain('<div id="period" class="layer is-svg"');
  });

  it("puts the real markup inside them, not a picture of it", () => {
    // Serialized out of an XML document, each node repeats the svg namespace it was
    // parsed under. Harmless — the wrapper declares the same one — so the markup is
    // checked by what it draws rather than by attribute order.
    expect(html).toMatch(/<path[^>]*d="M60 30 L60 180 L98 180 Z"[^>]*fill="#1a0f00"/);
    expect(html).toMatch(/<rect[^>]*id="period"[^>]*width="36"/);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("background-image");
  });

  it("gives every node the same canvas, which is what keeps them arranged", () => {
    expect(html.match(/viewBox="0 0 224 260"/g)).toHaveLength(2);
  });

  it("leaves the machinery out of the page", () => {
    expect(html).not.toContain("linearGradient");
    expect(html).not.toContain("<title>tween</title>");
  });

  it("drives each wrapper by id, as every other layer is driven", () => {
    expect(html).toContain('document.getElementById("letterform").animate');
    expect(html).toContain('document.getElementById("period").animate');
  });
});
