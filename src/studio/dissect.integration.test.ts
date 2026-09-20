// @vitest-environment jsdom
// End to end over the seam this increment is about: a file comes in as one drawing,
// a part comes off it, and what ships is two real vector elements.
import { describe, expect, it } from "vitest";
import { cropFor, readSvg, wrapNodes } from "./svg";
import { exportContent, type SvgAsset } from "./store";
import { exportCode } from "../export/code";
import type { Composition } from "../core/types";

const HOUSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <title>house</title>
  <defs><linearGradient id="sky"/></defs>
  <rect id="body" x="40" y="90" width="120" height="90" fill="#c8c8c8"/>
  <polygon id="roof" points="30,90 100,20 170,90" fill="#1a0f00"/>
  <circle id="window" cx="100" cy="120" r="18" fill="#3b7dff"/>
</svg>`;

/** The shape the store builds, without the blob URLs a test has no use for. jsdom
 *  does not lay SVG out, so nothing measures — which is the un-croppable path. */
function assetFor(
  nodes: ReturnType<typeof readSvg>,
  labels: string[],
  taken?: string,
  name = taken === undefined ? "house.svg" : labels[0],
): SvgAsset {
  const read = nodes!;
  const kept = read.nodes.filter((n) => labels.includes(n.label));
  const crop = taken === undefined ? read.box : cropFor(kept, read.box);
  return {
    id: `asset-${labels.join("-")}`,
    kind: "svg",
    src: "blob:x",
    name,
    naturalW: crop.width,
    naturalH: crop.height,
    nodes: kept,
    crop,
    doc: read.box,
    defs: read.defs,
    svgSource: wrapNodes(kept, crop, read.defs),
    takenFrom: taken,
  };
}

const compositionOf = (assets: SvgAsset[]): Composition => ({
  fps: 30,
  duration: 2,
  driver: { kind: "time" },
  tracks: assets.map((a) => ({
    layer: {
      id: a.name.replace(/\W+/g, "-"),
      source: { kind: "image", value: a.id },
      base: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    },
    modules: [],
  })),
});

describe("a house with its roof taken off", () => {
  const read = readSvg(HOUSE, "house.svg");
  // The element keeps the file's own name; only what it draws got smaller.
const rest = assetFor(read, ["body", "window"], "file-1", "house.svg");
  const roof = assetFor(read, ["roof"], "file-1");
  const comp = compositionOf([rest, roof]);
  const html = exportCode(comp, [], 8, exportContent(comp, [rest, roof]));

  it("reads the parts the file was drawn from", () => {
    expect(read!.nodes.map((n) => n.label)).toEqual(["body", "roof", "window"]);
  });

  it("leaves the rest of the house behind, without the part that was taken", () => {
    expect(rest.nodes.map((n) => n.label)).toEqual(["body", "window"]);
    expect(rest.svgSource).not.toContain("<polygon");
    expect(rest.svgSource).toContain('id="body"');
  });

  it("ships the part as its own drawing, with its own markup", () => {
    // Serialized out of an XML document, a node repeats the namespace it was parsed
    // under — harmless, since the wrapper declares the same one.
    expect(roof.svgSource).toMatch(/<polygon[^>]*points="30,90 100,20 170,90"/);
    expect(roof.svgSource).not.toContain('id="body"');
  });

  it("carries the defs into both halves, so neither loses what it points at", () => {
    expect(roof.svgSource).toContain("linearGradient");
    expect(rest.svgSource).toContain("linearGradient");
  });

  it("leaves the machinery that does not draw out of both", () => {
    expect(roof.svgSource).not.toContain("<title>");
    expect(rest.svgSource).not.toContain("<title>");
  });

  it("exports two elements, each with real markup and no image tag", () => {
    expect(html.match(/class="layer is-svg"/g)).toHaveLength(2);
    expect(html).toContain("<polygon");
    expect(html).toContain("<circle");
    expect(html).not.toContain("<img");
  });

  it("drives each of them by id, as every other layer is driven", () => {
    expect(html).toContain('document.getElementById("house-svg").animate');
    expect(html).toContain('document.getElementById("roof").animate');
  });
});

describe("a whole file, before anyone reaches into it", () => {
  const read = readSvg(HOUSE, "house.svg");
  const whole = assetFor(read, ["body", "roof", "window"]);

  it("is one drawing, seen through the frame the file declares", () => {
    expect(whole.crop).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect([whole.naturalW, whole.naturalH]).toEqual([200, 200]);
  });

  it("is not offered as a part, because it is the file itself", () => {
    expect(whole.takenFrom).toBeUndefined();
  });

  it("holds every part, ready to be reached for", () => {
    expect(whole.nodes).toHaveLength(3);
    expect(whole.svgSource).toContain("<polygon");
    expect(whole.svgSource).toContain("<circle");
    expect(whole.svgSource).toContain("<rect");
  });
});
