import type { Composition, Scene, Transform, EvalCtx } from "./types";
import { getModule } from "./registry";
import { remap } from "./math";

export function renderState(comp: Composition, t: number): Scene {
  const scene: Scene = [];
  for (const track of comp.tracks) {
    const count = track.layer.distributor?.count ?? 1;
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 0;
      let state: Transform = { ...track.layer.base };
      for (const md of track.modules) {
        if (t < md.range[0] || t > md.range[1]) continue;
        const ctx: EvalCtx = { t, localT: remap(t, md.range), u, i, count };
        state = getModule(md.type).evaluate(state, ctx, md.params);
      }
      scene.push({ source: track.layer.source, state });
    }
  }
  return scene;
}
