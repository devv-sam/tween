export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

export const MSG_TYPE = "tween takes png, jpg, webp, or svg.";
export const MSG_SIZE = "that one's over 20mb, try a lighter file.";
/** Said on the asset's own card, not as an import error: the file came in, it just
 *  came in whole. */
export const MSG_UNDISSECTED = "Could not dissect. Imported as single element";

const TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);
const EXT = /\.(png|jpe?g|webp|svg)$/i;

export function imageError(file: File): string | null {
  const type = file.type.toLowerCase();
  const typed = type.length > 0;
  if (typed ? !TYPES.has(type) : !EXT.test(file.name)) return MSG_TYPE;
  if (file.size > MAX_IMAGE_BYTES) return MSG_SIZE;
  return null;
}

export type ImageExt = "png" | "jpg" | "webp" | "svg";

/** The type chip's label. jpeg reads as jpg; a name we don't recognise gets no chip. */
export function extensionOf(name: string): ImageExt | null {
  const ext = EXT.exec(name)?.[1].toLowerCase();
  if (!ext) return null;
  return ext === "jpeg" ? "jpg" : (ext as ImageExt);
}

/** The name without its extension — the chip carries the type, so the row needn't repeat it. */
export function baseName(name: string): string {
  return name.replace(EXT, "");
}
