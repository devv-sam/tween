const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

export function loadGoogleFont(family: string, weight = 400): Promise<void> {
  const key = `${family}:${weight}`;
  if (loaded.has(key)) return Promise.resolve();
  const inflight = loading.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const id = `gf-${family.replace(/\s+/g, "-")}-${weight}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`;
      document.head.appendChild(link);
    }
    try {
      await document.fonts.load(`${weight} 48px "${family}"`);
    } catch {
      // font may still render via the stylesheet
    }
    loaded.add(key);
    loading.delete(key);
  })();

  loading.set(key, p);
  return p;
}

export function ensureFontLoaded(family: string, weight = 400): boolean {
  const key = `${family}:${weight}`;
  if (loaded.has(key)) return true;
  void loadGoogleFont(family, weight);
  return false;
}

let measureCtx: CanvasRenderingContext2D | null = null;

export function measureTextWidth(
  text: string,
  family: string,
  weight: number,
  fontSize: number,
  letterSpacing: number,
): number {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d")!;
  }
  measureCtx.font = `${weight} ${fontSize}px "${family}", system-ui, sans-serif`;
  if (letterSpacing === 0) {
    return measureCtx.measureText(text || " ").width;
  }
  const chars = [...(text || " ")];
  let w = 0;
  for (const ch of chars) w += measureCtx.measureText(ch).width;
  w += letterSpacing * Math.max(0, chars.length - 1);
  return w;
}
