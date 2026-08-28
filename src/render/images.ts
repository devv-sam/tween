const cache = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();

export function getCachedImage(id: string): HTMLImageElement | undefined {
  return cache.get(id);
}

export function ensureImage(id: string, src: string): Promise<HTMLImageElement> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const load = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(id, img);
      inflight.delete(id);
      resolve(img);
    };
    img.onerror = () => {
      inflight.delete(id);
      reject(new Error("image"));
    };
    img.src = src;
  });
  inflight.set(id, load);
  return load;
}

export function forgetImage(id: string): void {
  cache.delete(id);
  inflight.delete(id);
}
