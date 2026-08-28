export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export const MSG_TYPE = "tween takes png, jpg, or webp.";
export const MSG_SIZE = "that one's over 20mb, try a lighter file.";

const TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const EXT = /\.(png|jpe?g|webp)$/i;

export function imageError(file: File): string | null {
  const type = file.type.toLowerCase();
  const typed = type.length > 0;
  if (typed ? !TYPES.has(type) : !EXT.test(file.name)) return MSG_TYPE;
  if (file.size > MAX_IMAGE_BYTES) return MSG_SIZE;
  return null;
}
