import type { Composition } from "./types";

/**
 * The composition as it should be drawn: hidden elements out, and when anything is
 * soloed, everything that isn't. Solo ids for elements that no longer exist count
 * for nothing, so deleting the only soloed element brings the rest back.
 */
export function visibleElements(comp: Composition, soloIds: readonly string[] = []): Composition {
  const soloing = comp.tracks.some((tr) => soloIds.includes(tr.layer.id));
  const tracks = comp.tracks.filter(
    (tr) => tr.layer.visible !== false && (!soloing || soloIds.includes(tr.layer.id)),
  );
  return tracks.length === comp.tracks.length ? comp : { ...comp, tracks };
}
