import type { Composition, Transform } from "../core/types";
import { renderState } from "../core/renderState";

/**
 * What an exported layer is made of, when it is made of something.
 *
 * Only SVG nodes have anything to contribute here: their markup ships as itself, so
 * the exported page holds real vector nodes that CSS can target and script can reach,
 * rather than a picture of them. Everything else keeps the placeholder box this
 * exporter has always drawn.
 */
export type LayerContent = { svgSource: string; width: number; height: number };

export function exportCode(
  comp: Composition,
  samples = 60,
  /** Markup per layer id. A layer with no entry is drawn as the standing box. */
  content: Record<string, LayerContent> = {},
): string {
  const layers = comp.tracks.map((tr) => tr.layer);
  const perLayer: Record<string, { offset: number; state: Transform }[]> = {};
  for (const l of layers) perLayer[l.id] = [];

  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    renderState(comp, t).forEach((item, i) => {
      perLayer[layers[i].id].push({ offset: t, state: item.state });
    });
  }

  const anims = layers.map((l) => {
    const kfs = perLayer[l.id]
      .map((k) => `{ offset:${r(k.offset)}, transform:"translate(${r(k.state.x)}px,${r(k.state.y)}px) rotate(${r(k.state.rotation)}deg) scale(${r(k.state.scaleX)},${r(k.state.scaleY)})", opacity:${r(k.state.opacity)} }`)
      .join(",\n    ");
    return `document.getElementById(${JSON.stringify(l.id)}).animate([\n    ${kfs}\n  ], { duration:${comp.duration * 1000}, iterations:Infinity, easing:"linear" });`;
  }).join("\n\n");

  // The wrapper is what the animation drives, the same for every layer. A node's
  // markup rides inside it, sized to its own canvas and offset so the box is centred
  // on the transform the way the placeholder already is.
  const boxes = layers
    .map((l) => {
      const inner = content[l.id];
      if (!inner) return `<div id="${l.id}" class="layer"></div>`;
      const box =
        `left:${-inner.width / 2}px;top:${-inner.height / 2}px;` +
        `width:${inner.width}px;height:${inner.height}px`;
      return (
        `<div id="${l.id}" class="layer is-svg" style="${box}">\n    ` +
        `${inner.svgSource}\n  </div>`
      );
    })
    .join("\n  ");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;background:#f4f4f6}
  .stage{position:relative;width:800px;height:600px;margin:24px auto;overflow:hidden}
  .layer{position:absolute;left:-70px;top:-70px;width:140px;height:140px;background:#ff5a1f;border-radius:14px}
  .layer.is-svg{background:none;border-radius:0}
  .layer.is-svg > svg{display:block;width:100%;height:100%}
</style></head>
<body>
  <div class="stage">
  ${boxes}
  </div>
  <script>
  ${anims}
  </script>
</body></html>`;
}

const r = (n: number) => Math.round(n * 1000) / 1000;
