import type { Composition, ModuleAsset } from "./types";
import { getModule } from "./registry";
import { resolveModules } from "./library";

export function emitComposition(comp: Composition, library: ModuleAsset[]): string {
  return comp.tracks
    .flatMap((tr) =>
      resolveModules(tr.modules, library).map((md) =>
        getModule(md.type).emit({ targetId: tr.layer.id }, md.params),
      ),
    )
    .join("\n");
}
