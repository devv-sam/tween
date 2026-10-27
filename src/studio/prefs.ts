/**
 * Small bits of layout the studio should remember between visits. Storage can be
 * unavailable or full — a private window, a browser set to block site data — and a
 * remembered panel width is never worth an exception, so every access is guarded.
 */
export function readNumber(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Nothing to recover: the width just does not survive this session.
  }
}
