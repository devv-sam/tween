/**
 * Small bits of layout the studio should remember between visits. Storage can be
 * unavailable or full — a private window, a browser set to block site data — and a
 * remembered panel width is never worth an exception, so every access is guarded.
 */
const ASSETS_COLLAPSED = "tween:assets-collapsed";

export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Nothing to recover: the preference just does not survive this session.
  }
}

export const readAssetsCollapsed = (): boolean => readFlag(ASSETS_COLLAPSED, false);
export const writeAssetsCollapsed = (v: boolean): void => writeFlag(ASSETS_COLLAPSED, v);
