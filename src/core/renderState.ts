import type { Composition, ModuleAsset, Prop, Scene, EvalCtx } from "./types";
import { getModule } from "./registry";
import { clamp, remap } from "./math";
import { blendAt, sampleStops } from "./curve";
import { apply } from "./blend";
import { expand } from "./distribute";
import { fieldValue } from "./fields";
import { resolveModules } from "./library";

/**
 * `library` is not optional: a composition holding linked modules does not describe
 * itself, and a caller that forgot to bring the library would render a scene quietly
 * missing half its motion.
 */
export function renderState(comp: Composition, t: number, library: ModuleAsset[]): Scene {
  const scene: Scene = [];
  const fields = comp.fields ?? [];
  const sample = (id: string, x: number, y: number): number => {
    const def = fields.find((f) => f.id === id);
    return def ? fieldValue(def, x, y, t) : 0;
  };
  for (const track of comp.tracks) {
    for (const inst of expand(track.layer)) {
      let state = { ...inst.base };
      // Standalone keyframes are the element's own authored motion, so they settle
      // first and modules layer over the result.
      for (const [prop, set] of Object.entries(track.keyframes ?? {})) {
        if (t < set.range[0] || t > set.range[1]) continue;
        const local = remap(t, set.range);
        const value = sampleStops(set.stops, local);
        state = apply(state, prop as Prop, value, blendAt(set.stops, local));
      }
      for (const md of resolveModules(track.modules, library)) {
        if (t < md.range[0] || t > md.range[1]) continue;
        // Each clone reads the module a little later than the one before it, so a
        // cloner staggers instead of moving as one block.
        const delay = typeof md.params.delay === "number" ? md.params.delay : 0;
        const localT = clamp(remap(t, md.range) - inst.u * delay, 0, 1);
        const ctx: EvalCtx = { t, localT, u: inst.u, i: inst.i, count: inst.count, field: sample };
        state = getModule(md.type).evaluate(state, ctx, md.params);
      }
      scene.push({ id: track.layer.id, source: track.layer.source, state });
    }
  }
  return scene;
}
