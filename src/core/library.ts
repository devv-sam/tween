import type { ElementModule, LinkedModule, ModuleAsset, ModuleData } from "./types";

export const isLinked = (em: ElementModule): em is LinkedModule =>
  "kind" in em && em.kind === "linked";

export const findAsset = (library: ModuleAsset[], id: string): ModuleAsset | undefined =>
  library.find((a) => a.id === id);

/**
 * What an element module actually runs.
 *
 * Behaviour it owns passes straight through. Behaviour it borrows comes back as the
 * asset's whole stack with this element's overrides folded into each entry's params,
 * which is why this returns a list rather than one module — a saved behaviour is a
 * stack, and one use of it is that whole stack.
 *
 * A reference with nothing behind it is a broken composition rather than a state to
 * render around: the library and the composition are saved together, and deleting an
 * asset detaches its uses first.
 */
export function resolveModule(em: ElementModule, library: ModuleAsset[]): ModuleData[] {
  if (!isLinked(em)) return [em];
  const asset = findAsset(library, em.ref);
  if (!asset) throw new Error(`module ref ${em.ref} not found`);
  return asset.stack.map((md, i) => {
    const over = em.overrides[i];
    return over ? { ...md, params: { ...md.params, ...over } } : md;
  });
}

export const resolveModules = (
  modules: ElementModule[],
  library: ModuleAsset[],
): ModuleData[] => modules.flatMap((em) => resolveModule(em, library));

/** Every element module this asset is used by, across the tracks handed in. */
export const usesOf = (modules: ElementModule[], assetId: string): number =>
  modules.filter((em) => isLinked(em) && em.ref === assetId).length;
