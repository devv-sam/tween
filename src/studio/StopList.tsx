import type { Stop } from "../core/curve";
import type { Transform } from "../core/types";
import { clamp } from "../core/math";
import { useStudio } from "./store";
import { EaseSelect } from "./EasingControls";
import {
  PROP_STEP,
  baseValue,
  patchStop,
  removeStop,
  secondsToT,
  stopAtTime,
  stopSeconds,
  type KeyProp,
  type Range,
} from "./modules";
import { DiamondMinusIcon, DiamondPlusIcon, LABEL, NumberField } from "./fields";

/** One property inside a stop list. Two of them means a combined position, whose
 *  axes share every stop time and differ only in value. */
export type Axis = { prop: KeyProp; stops: Stop[] };

export function StopList({
  readState,
  axes,
  range,
  onChange,
}: {
  /** What the thing being keyed reads at the playhead right now — an element on the
   *  frame, or the bench's proxy. Undefined when there is nothing to read, and a new
   *  stop falls back to the value the curve already ends on. */
  readState: () => Transform | undefined;
  axes: Axis[];
  range: Range;
  onChange: (stops: Stop[][]) => void;
}) {
  const duration = useStudio((s) => s.composition.duration);
  // Times, easings, and the count are shared, so the first axis speaks for the row.
  const stops = axes[0].stops;
  /** The same edit on every axis — what keeps them in lockstep. */
  const all = (fn: (axis: Axis) => Stop[]) => onChange(axes.map(fn));

  /** At the playhead, each axis holding whatever it reads there right now. */
  const addAtPlayhead = () => {
    const { t } = useStudio.getState();
    const state = readState();
    const at = clamp(secondsToT(t * duration, range, duration), 0, 1);
    all((axis) => {
      const v = state
        ? baseValue(state, axis.prop)
        : axis.stops[axis.stops.length - 1].v;
      return stopAtTime(axis.stops, at, v);
    });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <p className={LABEL}>keyframes</p>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
          onClick={addAtPlayhead}
        >
          <DiamondPlusIcon />
          add keyframe
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {stops.map((stop, i) => {
          // One axis fits beside the time; two need a line of their own, so the row
          // wraps rather than squeezing four controls into 236px.
          const values = axes.map((axis) => (
            <div key={axis.prop} className="min-w-0 flex-1">
              <NumberField
                label={axes.length > 1 ? axis.prop : "v"}
                title={`${axis.prop} value`}
                value={axis.stops[i].v}
                step={PROP_STEP[axis.prop]}
                onChange={(v) =>
                  onChange(
                    axes.map((other, k) =>
                      k === axes.indexOf(axis)
                        ? patchStop(other.stops, i, { v })
                        : other.stops,
                    ),
                  )
                }
              />
            </div>
          ));
          return (
            <li key={i} className="flex flex-wrap items-center gap-1">
              <div className="w-[68px] shrink-0">
                <NumberField
                  label="s"
                  title="time in seconds"
                  value={stopSeconds(stop.t, range, duration)}
                  step={0.1}
                  min={0}
                  onChange={(v) =>
                    all((axis) =>
                      patchStop(axis.stops, i, { t: secondsToT(v, range, duration) }),
                    )
                  }
                />
              </div>
              {axes.length === 1 ? values : null}
              <EaseSelect
                className="w-[86px] shrink-0"
                ease={stop.ease}
                onChange={(ease) => all((axis) => patchStop(axis.stops, i, { ease }))}
              />
              <button
                type="button"
                aria-label="remove keyframe"
                title="remove keyframe"
                disabled={stops.length <= 1}
                className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-[#888] hover:bg-[#f0f0f0] hover:text-[#111] disabled:opacity-30 disabled:hover:bg-transparent"
                onClick={() => all((axis) => removeStop(axis.stops, i))}
              >
                <DiamondMinusIcon />
              </button>
              {axes.length > 1 ? (
                <div className="flex w-full items-center gap-1">{values}</div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

