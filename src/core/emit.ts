import type { Composition } from "./types";
import { getModule } from "./registry";

export function emitComposition(comp: Composition): string {
  return comp.tracks
    .flatMap((tr) =>
      tr.modules.map((md) => getModule(md.type).emit({ targetId: tr.layer.id }, md.params))
    )
    .join("\n");
}
