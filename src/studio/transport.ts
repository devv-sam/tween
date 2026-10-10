import type { ModuleAsset, Track } from "../core/types";
import { trackBlocks } from "./modules";

const SAME = 1e-4;
const EPSILON = 1e-6;

export function collectKeyframeTimes(
  tracks: Track[],
  library: ModuleAsset[],
  selectedIds: string[],
): number[] {
  const scoped =
    selectedIds.length > 0
      ? tracks.filter((tr) => selectedIds.includes(tr.layer.id))
      : tracks;

  const times: number[] = [];
  for (const track of scoped) {
    for (const block of trackBlocks(track, library)) {
      if (block.standalone) {
        const [from, to] = block.range;
        for (const stop of block.stops) times.push(from + stop.t * (to - from));
      } else {
        times.push(block.range[0], block.range[1]);
      }
    }
  }
  return dedupe(times);
}

function dedupe(times: number[]): number[] {
  const sorted = [...times].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) {
    if (out.length === 0 || t - out[out.length - 1] > SAME) out.push(t);
  }
  return out;
}

export function nextKeyframe(times: number[], t: number): number {
  for (const time of times) if (time > t + EPSILON) return time;
  return 1;
}

export function previousKeyframe(times: number[], t: number): number {
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] < t - EPSILON) return times[i];
  }
  return 0;
}
