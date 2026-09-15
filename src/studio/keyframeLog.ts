import type { KeyframeSet, Track } from "../core/types";
import type { Stop } from "../core/curve";
import type { Easing } from "../core/easing";
import { PROPS, positionSets, stopSeconds, type KeyTarget } from "./modules";

/**
 * One keyframe as the log reads it. Position is one entry holding both axes, because
 * an element is moved in one gesture and reading it back as two rows says something
 * the author never did.
 */
export type LogValue = number | { x: number; y: number };

export type LogEntry = {
  id: string;
  property: KeyTarget;
  /** Where the stop sits inside its own set — what an edit writes back through. */
  index: number;
  /** Absolute seconds on the ruler, not the normalized time the set stores. */
  t: number;
  /** What the property held coming in: the stop before it, or its own value at the
   *  head of a curve, where nothing precedes it. */
  from: LogValue;
  to: LogValue;
  /** The easing carrying the property into this keyframe. A combined position shares
   *  one across both axes, so there is only ever one to read. */
  ease?: Easing;
};

export type LogGroup = { property: KeyTarget; entries: LogEntry[] };

export const entryId = (property: KeyTarget, index: number): string =>
  `${property}:${index}`;

/**
 * The element's keyframes as one chronological record, grouped by the property each
 * belongs to. Derived on every read rather than stored: the sets on the track stay
 * the single source of truth, so the engine keeps reading exactly what it always has.
 */
export function keyframeLog(track: Track, duration: number): LogGroup[] {
  const out: LogGroup[] = [];
  const seconds = (set: KeyframeSet, stop: Stop) =>
    stopSeconds(stop.t, set.range, duration);

  const position = positionSets(track);
  if (position) {
    const { x, y } = position;
    out.push({
      property: "position",
      entries: x.stops.map((stop, i) => ({
        id: entryId("position", i),
        property: "position" as KeyTarget,
        index: i,
        t: seconds(x, stop),
        from: { x: x.stops[Math.max(0, i - 1)].v, y: y.stops[Math.max(0, i - 1)].v },
        to: { x: stop.v, y: y.stops[i].v },
        ease: stop.ease,
      })),
    });
  }
  // The same order the track blocks use, so a property sits where the eye last found
  // it rather than wherever it happened to be authored.
  for (const prop of PROPS) {
    if (position && (prop === "x" || prop === "y")) continue;
    const set = track.keyframes?.[prop];
    if (!set) continue;
    out.push({
      property: prop,
      entries: set.stops.map((stop, i) => ({
        id: entryId(prop, i),
        property: prop as KeyTarget,
        index: i,
        t: seconds(set, stop),
        from: set.stops[Math.max(0, i - 1)].v,
        to: stop.v,
        ease: stop.ease,
      })),
    });
  }
  return out;
}

/** Trailing zeros are noise in a log — 1.40 and 1.4 are the same keyframe. */
const trim = (v: number, precision = 2): string => String(Number(v.toFixed(precision)));

/** What a keyframe reads as in its row: the property's own units, so a rotation says
 *  degrees and an opacity says percent without anyone having to know the storage. */
export function formatValue(property: KeyTarget, v: LogValue): string {
  if (typeof v !== "number")
    return `${trim(v.x, 0)}, ${trim(v.y, 0)}`;
  if (property === "rotation") return `${trim(v)}°`;
  if (property === "scale") return `${trim(v)}×`;
  if (property === "opacity") return `${Math.round(v * 100)}%`;
  return trim(v, 0);
}

export const formatSeconds = (t: number): string => `${trim(t)}s`;

/**
 * Where a stop lands once it is moved in time and the set is re-sorted — what a
 * selection follows so an entry stays selected through the edit that moved it.
 */
export function indexAfterMove(stops: Stop[], index: number, t: number): number {
  return stops.filter((s, i) => i !== index && s.t < t).length;
}
