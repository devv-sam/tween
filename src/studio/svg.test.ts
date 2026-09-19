// @vitest-environment jsdom
// The only suite here that needs a DOM: `readSvg` is a wrapper around the browser's
// own XML parser, and a hand-rolled stand-in would test the stand-in.
import { describe, expect, it } from "vitest";
import {
  cropFor,
  docToWorld,
  isSvgFile,
  labelFor,
  nodeAt,
  readSvg,
  unionRect,
  viewBoxOf,
  worldToDoc,
  wrapNodes,
  type SvgNode,
} from "./svg";

const doc = (inner: string, attrs = 'viewBox="0 0 224 260"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

const LOGO = doc(
  `<title>tween</title>` +
    `<defs><linearGradient id="g"/></defs>` +
    `<path id="letter" d="M 40 20 L 60 20" fill="#1a0f00"/>` +
    `<rect id="stop" x="150" y="200" width="30" height="30"/>`,
);

describe("reading a file", () => {
  it("finds the parts that draw and skips the machinery", () => {
    expect(readSvg(LOGO, "tween-logo.svg")!.nodes.map((n) => n.label)).toEqual([
      "letter",
      "stop",
    ]);
  });

  it("names the drawing after the file, without its extension", () => {
    expect(readSvg(LOGO, "tween-logo.svg")!.label).toBe("tween-logo");
    expect(labelFor("my.logo.v2.SVG")).toBe("my.logo.v2");
  });

  it("falls back to tag and place when a part has no id of its own", () => {
    const out = readSvg(doc(`<path d="M0 0"/><g><circle r="4"/></g>`), "x.svg")!;
    expect(out.nodes.map((n) => n.label)).toEqual(["path-0", "g-1"]);
  });

  it("keeps file order, which is paint order", () => {
    const out = readSvg(doc(`<rect id="under"/><path id="over" d="M0 0"/>`), "x.svg")!;
    expect(out.nodes.map((n) => n.label)).toEqual(["under", "over"]);
  });

  it("takes a group whole rather than going inside it", () => {
    const out = readSvg(doc(`<g id="badge"><path d="M0 0"/><circle r="2"/></g>`), "x.svg")!;
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].markup).toContain("<circle");
  });

  it("keeps each part's own markup, transform and all", () => {
    const out = readSvg(doc(`<path id="p" transform="rotate(45)" d="M0 0"/>`), "x.svg")!;
    // Nothing is lifted out of the markup: where a part sits inside the drawing is
    // the drawing's business, and the window onto it is what places it on the frame.
    expect(out.nodes[0].markup).toContain('transform="rotate(45)"');
  });

  it("holds on to the defs, which a part cut loose would otherwise paint without", () => {
    expect(readSvg(LOGO, "x.svg")!.defs).toContain("linearGradient");
  });

  it("reads the frame from the viewBox, or from width and height", () => {
    expect(readSvg(LOGO, "x.svg")!.box).toEqual({ x: 0, y: 0, width: 224, height: 260 });
    const sized = readSvg(doc(`<path d="M0 0"/>`, 'width="120" height="90"'), "x.svg")!;
    expect(sized.box).toEqual({ x: 0, y: 0, width: 120, height: 90 });
  });

  it("keeps a viewBox that does not start at the origin", () => {
    const out = readSvg(doc(`<path d="M0 0"/>`, 'viewBox="-10 -20 100 50"'), "x.svg")!;
    expect(out.box).toEqual({ x: -10, y: -20, width: 100, height: 50 });
  });

  it("has nothing to read when the file does not parse, or is not an svg", () => {
    expect(readSvg("<svg><path", "x.svg")).toBeNull();
    expect(readSvg("not xml at all", "x.svg")).toBeNull();
    expect(readSvg(`<html><body><path/></body></html>`, "x.svg")).toBeNull();
  });

  it("finds no parts in a file where nothing draws", () => {
    expect(readSvg(doc(`<defs><path id="p" d="M0 0"/></defs>`), "x.svg")!.nodes).toEqual([]);
  });
});

describe("the window a drawing is seen through", () => {
  const ink = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  const node = (label: string, box?: ReturnType<typeof ink>): SvgNode => ({
    label,
    markup: `<rect id="${label}"/>`,
    ink: box,
  });
  const DOC = ink(0, 0, 290, 290);

  it("is the union of what the parts actually cover", () => {
    const crop = cropFor([node("a", ink(20, 20, 40, 40)), node("b", ink(100, 10, 50, 90))], DOC);
    expect(crop).toEqual({ x: 20, y: 10, width: 130, height: 90 });
  });

  it("hugs a single part, which is what stops it floating in a field of nothing", () => {
    expect(cropFor([node("circle", ink(48, 48, 194, 194))], DOC)).toEqual(
      ink(48, 48, 194, 194),
    );
  });

  it("falls back to the whole drawing when a part could not be measured", () => {
    expect(cropFor([node("a", ink(20, 20, 40, 40)), node("b")], DOC)).toEqual(DOC);
    expect(cropFor([], DOC)).toEqual(DOC);
  });

  it("writes itself as the viewBox the wrapped drawing carries", () => {
    expect(viewBoxOf(ink(48, 48, 194, 194))).toBe("48 48 194 194");
    const svg = wrapNodes([node("circle")], ink(48, 48, 194, 194), "<defs/>");
    expect(svg).toContain('viewBox="48 48 194 194"');
    expect(svg).toContain('width="194"');
    // The defs come along, or a part that referenced a gradient paints as nothing.
    expect(svg).toContain("<defs/>");
  });

  it("has no union of nothing", () => {
    expect(unionRect([])).toBeUndefined();
  });
});

describe("a drawing's own units, and the frame", () => {
  const crop = { x: 48, y: 48, width: 194, height: 194 };
  const flat = { x: 500, y: 300, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

  it("puts the window's middle at the element's own position", () => {
    expect(docToWorld({ x: 145, y: 145 }, crop, flat)).toEqual({ x: 500, y: 300 });
  });

  it("runs backwards to the same place", () => {
    const there = docToWorld({ x: 60, y: 220 }, crop, flat);
    const back = worldToDoc(there, crop, flat);
    expect(back.x).toBeCloseTo(60);
    expect(back.y).toBeCloseTo(220);
  });

  it("carries the element's scale and turn, so a part comes off where it was sitting", () => {
    const turned = { ...flat, scaleX: 2, scaleY: 2, rotation: 90 };
    const there = docToWorld({ x: 60, y: 220 }, crop, turned);
    const back = worldToDoc(there, crop, turned);
    expect(back.x).toBeCloseTo(60);
    expect(back.y).toBeCloseTo(220);
  });
});

describe("finding the part under a point", () => {
  const nodes: SvgNode[] = [
    { label: "plate", markup: "<rect/>", ink: { x: 0, y: 0, width: 290, height: 290 } },
    { label: "circle", markup: "<circle/>", ink: { x: 48, y: 48, width: 194, height: 194 } },
  ];

  it("takes the one painted on top where two overlap", () => {
    expect(nodeAt(nodes, { x: 145, y: 145 })?.label).toBe("circle");
  });

  it("takes the one underneath where only it reaches", () => {
    expect(nodeAt(nodes, { x: 10, y: 10 })?.label).toBe("plate");
  });

  it("finds nothing off the drawing, or on a part that was never measured", () => {
    expect(nodeAt(nodes, { x: 400, y: 400 })).toBeNull();
    expect(nodeAt([{ label: "x", markup: "<rect/>" }], { x: 1, y: 1 })).toBeNull();
  });
});

describe("what counts as an svg", () => {
  it("takes the declared type, or the extension when there is none", () => {
    expect(isSvgFile({ name: "a.svg", type: "" })).toBe(true);
    expect(isSvgFile({ name: "a", type: "image/svg+xml" })).toBe(true);
    expect(isSvgFile({ name: "a.png", type: "image/png" })).toBe(false);
  });
});
