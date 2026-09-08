import type { Composition } from "./types";

/**
 * Where the composition's work actually ends, as normalized time.
 *
 * The nominal duration is how long the timeline *can* be; this is how much of it is
 * used. Playback wraps here so a loop restarts once everything has finished rather
 * than running out the empty tail. An empty composition has no work to measure, so
 * it plays its whole length.
 */
export function contentEnd(comp: Composition): number {
  let end = 0;
  for (const track of comp.tracks) {
    for (const set of Object.values(track.keyframes ?? {})) {
      end = Math.max(end, set.range[1]);
    }
    for (const md of track.modules) {
      end = Math.max(end, md.range[1]);
    }
  }
  return end > 0 ? Math.min(end, 1) : 1;
}
