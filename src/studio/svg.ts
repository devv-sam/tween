/**
 * Taking an SVG apart.
 *
 * A raster image is one thing you can move. An SVG is a document: its top-level
 * children are separately addressable, so a logo's letterform and its full stop are
 * two elements that happen to have arrived in one file. This turns the file into
 * those elements, and knows nothing about the studio beyond that.
 */

/** Children worth making an element of. Everything else — `defs`, `title`, comments,
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

/** Where a node's ink actually is, in the document's own user units. */
export type Rect = { x: number; y: number; width: number; height: number };

export type SvgNode = {
  /** What the node calls itself: its `id`, or its tag and place in the file. */
  label: string;
  /** This node alone, wrapped in an `<svg>` carrying the *original* document's
   *  viewBox — so every node from one file shares one canvas and they line up
   *  where the artist put them. */
  svgSource: string;
  preserveAspectRatio: string;
  /** A pure translation lifted out of the node's own `transform`, in user units.
   *  Everything else stays in the markup — see `liftTranslation`. */
  offset: { x: number; y: number };
  /**
   * The part of the canvas this node actually draws on.
   *
   * Every node is wrapped at the whole document's size so they keep their
   * arrangement, which leaves each of them nominally the size of the drawing. That is
   * right for placing them and wrong for pointing at them: without this, a click
   * anywhere would land on whichever node paints last. Undefined when the browser
   * would not measure it, and then the whole canvas stands in, as before.
   */
  content?: Rect;
};

export type Dissection = {
  /** The filename without its extension: what the group of nodes is called. */
  label: string;
  viewBox: string;
  /** The document's own size in user units — every node is wrapped at this size. */
  width: number;
  height: number;
  nodes: SvgNode[];
};

/** `translate(12 -4)`, `translate(12,-4)`, `translate(12)` — and nothing else. */
const TRANSLATE_ONLY = /^\s*translate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+))?\s*\)\s*$/;

/**
 * A node's `transform`, when it is only a move.
 *
 * A move is the one transform that means the same thing here as it does there: shift
 * the node, shift the element, same picture. A rotation or a scale in an SVG turns
 * about the document's origin, while an element's own rotation turns about its
 * centre — so those are left in the markup, where they already work, rather than
 * being copied into a base transform that would put the node somewhere else.
 */
export function liftTranslation(transform: string | null): { x: number; y: number } | null {
  if (!transform) return null;
  const m = TRANSLATE_ONLY.exec(transform);
  if (!m) return null;
  const x = Number(m[1]);
  const y = m[2] === undefined ? 0 : Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** The document's size in user units: its viewBox if it has one, its width and
 *  height otherwise, and a square if it has neither to say. */
function documentSize(root: SVGSVGElement, viewBox: string): { width: number; height: number } {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  const w = Number.parseFloat(root.getAttribute("width") ?? "");
  const h = Number.parseFloat(root.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  return { width: 300, height: 300 };
}

/** Strip the file's extension, however many dots the name has before it. */
export function labelFor(filename: string): string {
  return filename.replace(/\.svg$/i, "");
}

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * One node on the whole document's canvas.
 *
 * The viewBox is the original's on purpose. Cropping each node to its own bounds
 * would leave every one of them thinking it owns the frame, and they would stack up
 * at the same place instead of holding the arrangement they were drawn in.
 */
export function wrapNode(
  markup: string,
  viewBox: string,
  width: number,
  height: number,
  preserveAspectRatio: string,
): string {
  const box = viewBox ? ` viewBox="${escapeAttr(viewBox)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg"${box} width="${width}" height="${height}"` +
    ` preserveAspectRatio="${escapeAttr(preserveAspectRatio)}">${markup}</svg>`
  );
}

/**
 * The file, as the elements it is made of.
 *
 * `null` means there was nothing to take apart — the text did not parse, there is no
 * root, or nothing inside it draws. The caller falls back to treating the file as one
 * flat image, which is what it was before any of this.
 *
 * Groups are taken whole. A `<g>` with five children is one element here; going
 * inside it is a different job, and doing it now would turn one import into a tree
 * nobody asked for.
 */
export function dissect(text: string, filename: string): Dissection | null {
  let root: SVGSVGElement | null = null;
  try {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    // A parse failure is reported in-band, as a document containing an error report.
    if (doc.querySelector("parsererror")) return null;
    root = doc.documentElement as unknown as SVGSVGElement;
  } catch {
    return null;
  }
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  const viewBox = root.getAttribute("viewBox") ?? "";
  const { width, height } = documentSize(root, viewBox);

  const nodes: SvgNode[] = [];
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (!MEANINGFUL.has(tag)) continue;

    const index = nodes.length;
    const id = child.getAttribute("id")?.trim();
    const preserveAspectRatio = child.getAttribute("preserveAspectRatio") ?? DEFAULT_ASPECT;

    // The lifted move comes out of the markup, or it would be applied twice: once by
    // the node drawing itself offset, once by the element sitting offset.
    const offset = liftTranslation(child.getAttribute("transform"));
    const copy = child.cloneNode(true) as Element;
    if (offset) copy.removeAttribute("transform");

    nodes.push({
      content: measureInk(copy, viewBox, width, height),
      label: id && id.length > 0 ? id : `${tag}-${index}`,
      svgSource: wrapNode(copy.outerHTML, viewBox, width, height, preserveAspectRatio),
      preserveAspectRatio,
      offset: offset ?? { x: 0, y: 0 },
    });
  }

  if (nodes.length === 0) return null;
  return { label: labelFor(filename), viewBox, width, height, nodes };
}

/**
 * Where a node's ink falls, measured by the browser rather than worked out from path
 * data. The node is mounted out of sight on its own canvas, asked, and taken down.
 *
 * `getBBox` only answers for something laid out, and nothing outside a browser lays
 * SVG out — so `undefined` here is a normal answer, not a failure, and the caller
 * falls back to the whole canvas.
 */
function measureInk(
  node: Element,
  viewBox: string,
  width: number,
  height: number,
): Rect | undefined {
  if (typeof document === "undefined") return undefined;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden";
  host.innerHTML = wrapNode(node.outerHTML, viewBox, width, height, DEFAULT_ASPECT);
  document.body.appendChild(host);
  try {
    const drawn = host.querySelector("svg")?.firstElementChild as SVGGraphicsElement | null;
    const box = drawn?.getBBox?.();
    if (!box || !(box.width > 0) || !(box.height > 0)) return undefined;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    return undefined;
  } finally {
    host.remove();
  }
}

/** SVG by extension or by declared type — a file picker gives one, a drop may give
 *  the other, and either is enough to know not to treat it as a raster. */
export function isSvgFile(file: { name: string; type: string }): boolean {
  return (
    file.type.toLowerCase() === "image/svg+xml" || /\.svg$/i.test(file.name)
  );
}
