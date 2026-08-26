import type { Composition, Scene, EvalCtx } from "./types";
import { getModule } from "./registry";
import { remap } from "./math";
import { expand } from "./distribute";
import { fieldValue } from "./fields";

export function renderState(comp: Composition, t: number): Scene {
  const scene: Scene = [];
  const fields = comp.fields ?? [];
  const sample = (id: string, x: number, y: number): number => {
    const def = fields.find((f) => f.id === id);
    return def ? fieldValue(def, x, y, t) : 0;
  };
  for (const track of comp.tracks) {
    for (const inst of expand(track.layer)) {
      let state = { ...inst.base };
      for (const md of track.modules) {
        if (t < md.range[0] || t > md.range[1]) continue;
        const ctx: EvalCtx = { t, localT: remap(t, md.range), u: inst.u, i: inst.i, count: inst.count, field: sample };
        state = getModule(md.type).evaluate(state, ctx, md.params);
      }
      scene.push({ source: track.layer.source, state });
    }
  }
  return scene;
}
