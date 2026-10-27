const requested = new Set<string>();

/** Loads just enough of a Google font to set its own name in its own face. */
export function ensureFontPreview(family: string): void {
  if (requested.has(family)) return;
  requested.add(family);
  const name = encodeURIComponent(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/%20/g, "+")}&text=${name}&display=swap`;
  document.head.appendChild(link);
}

export const faceOf = (family: string): string => `"${family}", system-ui, sans-serif`;
