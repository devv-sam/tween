import type { Composition, Scene } from "./types";

/** The composition without its hidden elements: what the frame and every export draw. */
export function visibleElements(comp: Composition): Composition {
  const tracks = comp.tracks.filter((tr) => tr.layer.visible !== false);
  return tracks.length === comp.tracks.length ? comp : { ...comp, tracks };
}

/** How much of itself an element keeps while something else is soloed. */
export const SOLO_DIM = 0.2;

/**
 * Solo as the canvas shows it: while anything in the scene is soloed, everything
 * else stays in place but fades back. Solo ids with nothing drawn count for nothing.
 */
export function dimUnsoloed(scene: Scene, soloIds: readonly string[]): Scene {
  if (!scene.some((it) => soloIds.includes(it.id))) return scene;
  return scene.map((it) =>
    soloIds.includes(it.id) ? it : { ...it, state: { ...it.state, opacity: it.state.opacity * SOLO_DIM } },
  );
}
