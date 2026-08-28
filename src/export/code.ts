import type { Composition, Transform } from "../core/types";
import { renderState } from "../core/renderState";

export function exportCode(comp: Composition, samples = 60): string {
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

  const boxes = layers.map((l) => `<div id="${l.id}" class="layer"></div>`).join("\n  ");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;background:#f4f4f6}
  .stage{position:relative;width:800px;height:600px;margin:24px auto;overflow:hidden}
  .layer{position:absolute;left:-70px;top:-70px;width:140px;height:140px;background:#ff5a1f;border-radius:14px}
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
