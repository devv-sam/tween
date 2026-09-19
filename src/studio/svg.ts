import type { Transform } from "../core/types";
import type { Point } from "./view";

/**
 * An SVG, and the parts it is made of.
 *
 * A file arrives whole and is treated as one picture, the same as a PNG — because
 * that is what it is until someone says otherwise. What it also is, underneath, is a
 * document with separately addressable children, and this is what lets the studio
 * reach one of them when it is asked to.
 */

/** Children worth reaching for. Everything else — `defs`, `title`, comments,
 *  `metadata` — is machinery for the drawing rather than part of it. */
const MEANINGFUL = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "g",
]);

/** What an SVG says to do with the spare room when it is drawn at a shape that is not
 *  its own. The spec's default, spelled out rather than left implied. */
export const DEFAULT_ASPECT = "xMidYMid meet";

export type Rect = { x: number; y: number; width: number; height: number };

export type SvgNode = {
  /** What the node calls itself: its `id`, or its tag and place in the file. */
  label: string;
  /** The node exactly as authored, transform and all. */
  markup: string;
  /**
   * Where this node's ink falls, in the document's own units — the browser's answer,
   * not one worked out from path data. Undefined when nothing would measure it, and
   * then the node has no bounds of its own to be cropped or pointed at by.
   */
  ink?: Rect;
};

export type SvgDoc = {
  /** The filename without its extension. */
  label: string;
  /** The document's own frame, in user units: what it says its size is. */
  box: Rect;
  /**
   * Gradients, clip paths, filters — anything a node might point at by id. Carried
   * into every wrapping, because a node cut loose from the `<defs>` it references
   * paints as nothing at all.
   */
  defs: string;
  nodes: SvgNode[];
};

/** The document's frame: its viewBox, or its width and height, or a square when it
 *  declares neither. */
function documentBox(root: Element): Rect {
  const parts = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  const w = Number.parseFloat(root.getAttribute("width") ?? "");
  const h = Number.parseFloat(root.getAttribute("height") ?? "");
  const width = Number.isFinite(w) && w > 0 ? w : 300;
  const height = Number.isFinite(h) && h > 0 ? h : 300;
  return { x: 0, y: 0, width, height };
}

/** Strip the file's extension, however many dots the name has before it. */
export function labelFor(filename: string): string {
  return filename.replace(/\.svg$/i, "");
}

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export const viewBoxOf = (box: Rect): string =>
  `${box.x} ${box.y} ${box.width} ${box.height}`;

/**
 * Some nodes, on a canvas of their own.
 *
 * `box` is the window onto the document — the whole of it when the element is the
 * whole file, and just far enough to hold what is left once parts have been taken
 * off it. That window is what makes an extracted piece its own real drawing rather
 * than a small shape adrift in a document-sized field of nothing.
 */
export function wrapNodes(nodes: SvgNode[], box: Rect, defs: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(viewBoxOf(box))}"` +
    ` width="${box.width}" height="${box.height}"` +
    ` preserveAspectRatio="${DEFAULT_ASPECT}">` +
    `${defs}${nodes.map((n) => n.markup).join("")}</svg>`
  );
}

/** The smallest rect holding all of them. */
export function unionRect(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The window a set of nodes should be drawn through.
 *
 * A node whose ink nobody could measure has no bounds to crop to, so the whole
 * document stands in and the picture is at least right even if it is roomy.
 */
export function cropFor(nodes: SvgNode[], doc: Rect): Rect {
  const inks = nodes.map((n) => n.ink);
  if (inks.length === 0 || inks.some((i) => !i)) return doc;
  const box = unionRect(inks as Rect[]);
  return box && box.width > 0 && box.height > 0 ? box : doc;
}

/**
 * The file, and what it is made of. `null` when there was nothing to read — the text
 * did not parse, or there is no root — and the caller falls back to one flat image.
 *
 * Groups are taken whole. A `<g>` of five children is one part here; going inside it
 * is a different job.
 */
export function readSvg(text: string, filename: string): SvgDoc | null {
  let root: Element | null = null;
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    // A parse failure is reported in-band, as a document containing an error report.
    if (doc.querySelector("parsererror")) return null;
    root = doc.documentElement;
  } catch {
    return null;
  }
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const box = documentBox(root);
  const defs = Array.from(root.children)
    .filter((c) => c.tagName.toLowerCase() === "defs")
    .map((c) => c.outerHTML)
    .join("");

  const nodes: SvgNode[] = [];
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (!MEANINGFUL.has(tag)) continue;
    const id = child.getAttribute("id")?.trim();
    nodes.push({
      label: id && id.length > 0 ? id : `${tag}-${nodes.length}`,
      markup: child.outerHTML,
      ink: measureInk(child.outerHTML, box, defs),
    });
  }

  return { label: labelFor(filename), box, defs, nodes };
}

/**
 * Where a node's ink falls, measured by the browser rather than worked out from path
 * data. The node is mounted out of sight and asked.
 *
 * It is asked through a `<g>`, because a node's own `getBBox` answers in its own
 * coordinates and so leaves out the `transform` that put it where it is — while the
 * group around it has no transform, and answers in the document's.
 *
 * `undefined` is a normal answer, not a failure: nothing outside a browser lays SVG
 * out, and the caller falls back to the whole document.
 */
function measureInk(markup: string, box: Rect, defs: string): Rect | undefined {
  if (typeof document === "undefined") return undefined;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden";
  host.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxOf(box)}"` +
    ` width="${box.width}" height="${box.height}">${defs}<g>${markup}</g></svg>`;
  document.body.appendChild(host);
  try {
    const g = host.querySelector("g") as SVGGraphicsElement | null;
    const measured = g?.getBBox?.();
    if (!measured || !(measured.width > 0) || !(measured.height > 0)) return undefined;
    return {
      x: measured.x,
      y: measured.y,
      width: measured.width,
      height: measured.height,
    };
  } catch {
    return undefined;
  } finally {
    host.remove();
  }
}

/** SVG by extension or by declared type — a file picker gives one, a drop may give
 *  the other, and either is enough to know not to treat it as a raster. */
export function isSvgFile(file: { name: string; type: string }): boolean {
  return file.type.toLowerCase() === "image/svg+xml" || /\.svg$/i.test(file.name);
}

const axes = (rotation: number) => {
  const rad = (rotation * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
};

/**
 * A point in the document's own units, as a place on the frame.
 *
 * An element shows a window (`crop`) onto a drawing, centred on its own position and
 * turned and scaled by its own transform. This is that chain, and `worldToDoc` is it
 * run backwards — between them they are what lets a part come off a drawing and stay
 * exactly where it was sitting.
 */
export function docToWorld(p: Point, crop: Rect, state: Transform): Point {
  const lx = (p.x - crop.x - crop.width / 2) * state.scaleX;
  const ly = (p.y - crop.y - crop.height / 2) * state.scaleY;
  const { cos, sin } = axes(state.rotation);
  return { x: state.x + lx * cos - ly * sin, y: state.y + lx * sin + ly * cos };
}

export function worldToDoc(p: Point, crop: Rect, state: Transform): Point {
  const { cos, sin } = axes(state.rotation);
  const dx = p.x - state.x;
  const dy = p.y - state.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return {
    x: (state.scaleX === 0 ? 0 : lx / state.scaleX) + crop.x + crop.width / 2,
    y: (state.scaleY === 0 ? 0 : ly / state.scaleY) + crop.y + crop.height / 2,
  };
}

const withinRect = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/**
 * Which part of a drawing a point in document units falls on, latest first — so a
 * point where two overlap picks the one painted on top, the same rule the canvas
 * uses between elements.
 */
export function nodeAt(nodes: SvgNode[], p: Point): SvgNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const ink = nodes[i].ink;
    if (ink && withinRect(ink, p)) return nodes[i];
  }
  return null;
}
