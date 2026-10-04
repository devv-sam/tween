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
