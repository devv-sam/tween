// @vitest-environment jsdom
// The only suite here that needs a DOM: `dissect` is a wrapper around the browser's
// own XML parser, and a hand-rolled stand-in would test the stand-in.
import { describe, expect, it } from "vitest";
import { DEFAULT_ASPECT, dissect, isSvgFile, labelFor, liftTranslation, wrapNode } from "./svg";

const doc = (inner: string, attrs = 'viewBox="0 0 224 260"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

const LOGO = doc(
  `<title>tween</title>` +
    `<defs><linearGradient id="g"/></defs>` +
    `<path id="letter" d="M 40 20 L 60 20" fill="#1a0f00"/>` +
    `<rect id="stop" x="150" y="200" width="30" height="30"/>`,
);

describe("dissect", () => {
  it("makes one node per meaningful child and skips the machinery", () => {
    const out = dissect(LOGO, "tween-logo.svg")!;
    expect(out.nodes.map((n) => n.label)).toEqual(["letter", "stop"]);
  });

  it("names the group after the file, without its extension", () => {
    expect(dissect(LOGO, "tween-logo.svg")!.label).toBe("tween-logo");
    expect(labelFor("my.logo.v2.SVG")).toBe("my.logo.v2");
  });

  it("falls back to tag and place when a node has no id of its own", () => {
    const out = dissect(doc(`<path d="M0 0"/><g><circle r="4"/></g>`), "x.svg")!;
    expect(out.nodes.map((n) => n.label)).toEqual(["path-0", "g-1"]);
  });

  it("wraps every node in the document's own viewBox, not its local bounds", () => {
    const out = dissect(LOGO, "tween-logo.svg")!;
    for (const node of out.nodes) {
      expect(node.svgSource).toContain('viewBox="0 0 224 260"');
      expect(node.svgSource).toContain('width="224"');
      expect(node.svgSource).toContain('height="260"');
    }
  });

  it("carries the node's own markup through, and nothing else's", () => {
    const [letter, stop] = dissect(LOGO, "tween-logo.svg")!.nodes;
    expect(letter.svgSource).toContain('d="M 40 20 L 60 20"');
    expect(letter.svgSource).not.toContain("<rect");
    expect(stop.svgSource).toContain("<rect");
    expect(stop.svgSource).not.toContain("<path");
  });

  it("keeps file order, which is paint order", () => {
    const out = dissect(doc(`<rect id="under"/><path id="over" d="M0 0"/>`), "x.svg")!;
    expect(out.nodes.map((n) => n.label)).toEqual(["under", "over"]);
  });

  it("takes a group whole rather than going inside it", () => {
    const out = dissect(doc(`<g id="badge"><path d="M0 0"/><circle r="2"/></g>`), "x.svg")!;
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].svgSource).toContain("<circle");
  });

  it("reads the document's size from width and height when there is no viewBox", () => {
    const out = dissect(doc(`<path d="M0 0"/>`, 'width="120" height="90"'), "x.svg")!;
    expect([out.width, out.height]).toEqual([120, 90]);
    expect(out.nodes[0].svgSource).not.toContain("viewBox");
  });

  it("has nothing to take apart when the file does not parse", () => {
    expect(dissect("<svg><path", "x.svg")).toBeNull();
    expect(dissect("not xml at all", "x.svg")).toBeNull();
  });

  it("has nothing to take apart when nothing in the file draws", () => {
    expect(dissect(doc(`<defs><path id="p" d="M0 0"/></defs><title>hi</title>`), "x.svg")).toBeNull();
  });

  it("refuses a document that is not an svg", () => {
    expect(dissect(`<html><body><path/></body></html>`, "x.svg")).toBeNull();
  });
});

describe("a node's own transform", () => {
  it("lifts a plain move out of the markup and into the element", () => {
    const out = dissect(doc(`<path id="p" transform="translate(30, 40)" d="M0 0"/>`), "x.svg")!;
    expect(out.nodes[0].offset).toEqual({ x: 30, y: 40 });
    // Out of the markup too: applied in both places it would move twice.
    expect(out.nodes[0].svgSource).not.toContain("transform");
  });

  it("reads a one-argument move as moving on x alone", () => {
    expect(liftTranslation("translate(12)")).toEqual({ x: 12, y: 0 });
    expect(liftTranslation("translate(12 -4)")).toEqual({ x: 12, y: -4 });
  });

  it("leaves a turn or a resize where it already works", () => {
    // These turn about the document's origin; an element turns about its own centre,
    // so copying the number across would put the node somewhere else entirely.
    expect(liftTranslation("rotate(45)")).toBeNull();
    expect(liftTranslation("translate(10,10) scale(2)")).toBeNull();
    expect(liftTranslation("matrix(1,0,0,1,10,10)")).toBeNull();

    const out = dissect(doc(`<path id="p" transform="rotate(45)" d="M0 0"/>`), "x.svg")!;
    expect(out.nodes[0].offset).toEqual({ x: 0, y: 0 });
    expect(out.nodes[0].svgSource).toContain('transform="rotate(45)"');
  });

  it("has no move to lift when there is no transform", () => {
    expect(liftTranslation(null)).toBeNull();
  });
});

describe("what counts as an svg", () => {
  it("takes the declared type, or the extension when there is none", () => {
    expect(isSvgFile({ name: "a.svg", type: "" })).toBe(true);
    expect(isSvgFile({ name: "a", type: "image/svg+xml" })).toBe(true);
    expect(isSvgFile({ name: "a.png", type: "image/png" })).toBe(false);
  });
});

describe("wrapNode", () => {
  it("defaults the aspect rule to the one the spec already implies", () => {
    expect(wrapNode("<path/>", "0 0 10 10", 10, 10, DEFAULT_ASPECT)).toContain(
      'preserveAspectRatio="xMidYMid meet"',
    );
  });
});
