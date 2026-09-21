import type { Stop } from "../core/curve";
import { easeKey, easeValue, type StopEase } from "../core/easing";
import { clamp } from "../core/math";
import type { Blend, KeyframeSet, Track } from "../core/types";
import {
  TRACK_PROPS,
  positionSets,
  propLabel,
  stopSeconds,
  type KeyTarget,
  type Range,
} from "./modules";

/**
 * The span between two consecutive stops — the thing that actually owns the motion.
 * A stop is a moment; what carries a value from one moment to the next is this, and
 * it is what an author edits when they want the motion to feel different.
 *
 * Named by the stop it arrives at, because that is where its easing, its blend and
 * its destination value are all stored. The first stop on a track has no incoming
 * segment, so indices start at 1.
 */
export type SegmentRef = { layerId: string; property: KeyTarget; index: number };

const SEP = "|";

export const segmentId = ({ layerId, property, index }: SegmentRef): string =>
  `${layerId}${SEP}${property}${SEP}${index}`;

export function parseSegment(id: string): SegmentRef | null {
  const parts = id.split(SEP);
  if (parts.length !== 3) return null;
  const index = Number(parts[2]);
  if (!Number.isInteger(index) || index < 1) return null;
  return { layerId: parts[0], property: parts[1] as KeyTarget, index };
}

/** What a segment carries where it is read rather than where it is stored. */
export type SegmentValue = number | { x: number; y: number };

/**
 * One segment, resolved against the composition: where it sits on the ruler, what it
 * eases with, and where it is heading.
 */
export type SegmentView = {
  id: string;
  ref: SegmentRef;
  property: KeyTarget;
  label: string;
  /** Absolute seconds on the ruler, so the panel and the strip read the same clock. */
  from: number;
  to: number;
  /** Normalized over the composition — what the strip places against. */
  fromT: number;
  toT: number;
  ease: StopEase | undefined;
  blend: Blend;
  value: SegmentValue;
};

/** The set behind a target, and its partner axis when the target is a position. */
type TargetSets = { x: KeyframeSet; y?: KeyframeSet };

function setsFor(track: Track, property: KeyTarget): TargetSets | null {
  if (property === "position") {
    const position = positionSets(track);
    return position ? { x: position.x, y: position.y } : null;
  }
  const set = track.keyframes?.[property];
  return set ? { x: set } : null;
}

const absolute = (range: Range, t: number): number => range[0] + t * (range[1] - range[0]);

/** Every segment on one property, in time order. */
function segmentsOf(
  layerId: string,
  property: KeyTarget,
  sets: TargetSets,
  duration: number,
): SegmentView[] {
  const { x, y } = sets;
  const out: SegmentView[] = [];
  for (let i = 1; i < x.stops.length; i++) {
    const prev = x.stops[i - 1];
    const stop = x.stops[i];
    const ref: SegmentRef = { layerId, property, index: i };
    out.push({
      id: segmentId(ref),
      ref,
      property,
      label: propLabel(property),
      from: stopSeconds(prev.t, x.range, duration),
      to: stopSeconds(stop.t, x.range, duration),
      fromT: absolute(x.range, prev.t),
      toT: absolute(x.range, stop.t),
      ease: stop.ease,
      blend: stop.blend ?? "set",
      value: y ? { x: stop.v, y: y.stops[i]?.v ?? stop.v } : stop.v,
    });
  }
  return out;
}

/** Every segment an element carries, in the order its rows are drawn. */
export function trackSegments(track: Track, duration: number): SegmentView[] {
  const layerId = track.layer.id;
  const out: SegmentView[] = [];
  const position = positionSets(track);
  if (position) {
    out.push(...segmentsOf(layerId, "position", { x: position.x, y: position.y }, duration));
  }
  for (const prop of TRACK_PROPS) {
    if (position && (prop === "x" || prop === "y")) continue;
    const set = track.keyframes?.[prop];
    if (set) out.push(...segmentsOf(layerId, prop, { x: set }, duration));
  }
  return out;
}

/** Find one, wherever on the composition it lives. */
export function findSegment(
  tracks: Track[],
  ref: SegmentRef,
  duration: number,
): SegmentView | null {
  const track = tracks.find((tr) => tr.layer.id === ref.layerId);
  if (!track) return null;
  const sets = setsFor(track, ref.property);
  if (!sets) return null;
  return (
    segmentsOf(ref.layerId, ref.property, sets, duration).find(
      (s) => s.ref.index === ref.index,
    ) ?? null
  );
}

export function findSegments(
  tracks: Track[],
  ids: string[],
  duration: number,
): SegmentView[] {
  const out: SegmentView[] = [];
  for (const id of ids) {
    const ref = parseSegment(id);
    const found = ref ? findSegment(tracks, ref, duration) : null;
    if (found) out.push(found);
  }
  return out;
}

/** One frame at 60fps — below this a segment has no time to move in. */
export const MIN_SEGMENT = 0.016;

/**
 * The destination stop moved so the segment lasts `seconds`. The source stays where
 * it is: a duration is the span in front of a keyframe, and dragging it should not
 * shift everything that came before.
 *
 * The stop after the destination is the ceiling — a segment that grew past it would
 * reorder the curve, which is not what asking for a longer one means.
 */
export function retimedStops(stops: Stop[], index: number, seconds: number, range: Range, duration: number): Stop[] {
  const span = (range[1] - range[0]) * duration;
  if (span <= 0) return stops;
  const source = stops[index - 1];
  if (!source) return stops;
  const next = stops[index + 1];
  const lo = source.t + MIN_SEGMENT / span;
  const hi = next ? next.t : 1;
  const t = clamp(source.t + seconds / span, lo, Math.max(lo, hi));
  return stops.map((s, i) => (i === index ? { ...s, t } : s));
}

/** Points across a segment, as a share of its own box: 0 at the source, 1 at the
 *  destination on both axes. What both the strip's overlay and the panel's graph
 *  draw, so the little shape on the line is the same curve as the big one. */
export function easeSamples(ease: StopEase | undefined, steps: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = i / steps;
    out.push({ x, y: easeValue(ease, x) });
  }
  return out;
}

/** Whether they are all on one curve. A spread has no starting state to open on, so
 *  the panel shows a neutral graph and lights no chip until something is chosen. */
export function easesAgree(segments: SegmentView[]): boolean {
  if (segments.length === 0) return false;
  const first = easeKey(segments[0].ease);
  return segments.every((s) => easeKey(s.ease) === first);
}

/** The curve every selected segment agrees on, or undefined when they do not. */
export function sharedEase(segments: SegmentView[]): StopEase | undefined {
  return easesAgree(segments) ? segments[0].ease : undefined;
}

/** The blend every selected segment agrees on, or null. */
export function sharedBlend(segments: SegmentView[]): Blend | null {
  if (segments.length === 0) return null;
  const first = segments[0].blend;
  return segments.every((s) => s.blend === first) ? first : null;
}

/** The property beneath the header: the one they share, or that they do not share one. */
export function sharedLabel(segments: SegmentView[]): string {
  if (segments.length === 0) return "";
  const first = segments[0].property;
  return segments.every((s) => s.property === first) ? propLabel(first) : "mixed";
}
