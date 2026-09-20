import { useState } from "react";
import type { Distributor, DistributorType, ModuleData, Track, Transform } from "../core/types";
import { renderState } from "../core/renderState";
import { useStudio } from "./store";
import {
  MODULE_BLURB,
  MODULE_TYPES,
  PROPS,
  baseValue,
  cloneCount,
  defaultDistributor,
  moduleProp,
  moduleStops,
  stackRows,
  stackSummary,
  type KeyProp,
  type ModuleType,
  type StackRow,
} from "./modules";
import { StopList } from "./StopList";
import { BOX, GHOST_BTN, INPUT, LABEL, NumberField, SECTION, SUBLABEL } from "./fields";

const DISTRIBUTORS: { value: DistributorType; label: string }[] = [
  { value: "path", label: "path" },
  { value: "grid", label: "grid" },
  { value: "radial", label: "radial" },
];

/**
 * The cloner on an element: how many of it there are, and how they are laid out.
 *
 * Off is the absence of a distributor rather than one set to nothing, so an element
 * that was never cloned carries no trace of the control.
 */
export function DistributorSection({
  distributor,
  base,
  onChange,
}: {
  distributor: Distributor | undefined;
  base: Transform;
  onChange: (d: Distributor | null) => void;
}) {
  const on = Boolean(distributor);
  const d = distributor;

  return (
    <section className={SECTION}>
      <div className="mb-2 flex items-center justify-between">
        <p className={LABEL}>cloner</p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="cloner"
          className={`h-[18px] w-[30px] shrink-0 rounded-full border transition-colors ${
            on ? "border-[#0d99ff] bg-[#0d99ff]" : "border-[#e0e0e0] bg-[#f0f0f0]"
          }`}
          onClick={() => onChange(on ? null : defaultDistributor(base))}
        >
          <span
            className={`block h-[14px] w-[14px] rounded-full bg-white transition-transform ${
              on ? "translate-x-[14px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>

      {d ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <label className={`${BOX} justify-between`} title="layout">
              <span className={LABEL}>type</span>
              <select
                className="min-w-0 bg-transparent text-[11px] text-[#111] outline-none"
                value={d.type === "none" ? "path" : d.type}
                onChange={(e) =>
                  onChange({ ...d, type: e.target.value as DistributorType, params: {} })
                }
              >
                {DISTRIBUTORS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="count"
              value={d.count}
              step={1}
              min={1}
              max={200}
              precision={0}
              onChange={(v) => onChange({ ...d, count: Math.max(1, Math.round(v)) })}
            />
          </div>
          <DistributorParams distributor={d} onChange={onChange} />
        </>
      ) : null}
    </section>
  );
}

/** Only what the picked layout actually reads. A grid has no radius and a ring has
 *  no columns, so neither is offered one. */
function DistributorParams({
  distributor: d,
  onChange,
}: {
  distributor: Distributor;
  onChange: (d: Distributor) => void;
}) {
  const p = d.params ?? {};
  const num = (key: string, fallback: number): number =>
    typeof p[key] === "number" ? (p[key] as number) : fallback;
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...d, params: { ...p, ...patch } });

  const align = (
    <label className={`${BOX} col-span-2 justify-between`}>
      <span className={LABEL}>face along</span>
      <input
        type="checkbox"
        className="accent-[#0d99ff]"
        checked={Boolean(p.align)}
        onChange={(e) => set({ align: e.target.checked })}
      />
    </label>
  );

  if (d.type === "grid") {
    return (
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField
          label="cols"
          value={num("cols", Math.ceil(Math.sqrt(d.count)))}
          step={1}
          min={1}
          precision={0}
          onChange={(v) => set({ cols: Math.max(1, Math.round(v)) })}
        />
        <div />
        <NumberField label="gap x" value={num("gapX", 100)} step={1} onChange={(v) => set({ gapX: v })} />
        <NumberField label="gap y" value={num("gapY", 100)} step={1} onChange={(v) => set({ gapY: v })} />
      </div>
    );
  }

  if (d.type === "radial") {
    return (
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField label="radius" value={num("radius", 200)} step={1} onChange={(v) => set({ radius: v })} />
        <NumberField label="start" title="start angle" value={num("startAngle", -90)} step={1} onChange={(v) => set({ startAngle: v })} />
        <NumberField label="sweep" value={num("sweep", 360)} step={5} onChange={(v) => set({ sweep: v })} />
        <div />
        {align}
      </div>
    );
  }

  // A path is two ends and the straight run between them — the shape an author drags
  // on the canvas is a later increment, and these are the numbers behind it.
  const points = Array.isArray(p.points) ? (p.points as { x: number; y: number }[]) : [];
  const at = (i: number, axis: "x" | "y") => points[i]?.[axis] ?? 0;
  const movePoint = (i: number, axis: "x" | "y", v: number) => {
    const next = [points[0] ?? { x: 0, y: 0 }, points[1] ?? { x: 0, y: 0 }];
    next[i] = { ...next[i], [axis]: v };
    set({ points: next });
  };
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1.5">
      <NumberField label="x₁" value={at(0, "x")} step={1} onChange={(v) => movePoint(0, "x", v)} />
      <NumberField label="y₁" value={at(0, "y")} step={1} onChange={(v) => movePoint(0, "y", v)} />
      <NumberField label="x₂" value={at(1, "x")} step={1} onChange={(v) => movePoint(1, "x", v)} />
      <NumberField label="y₂" value={at(1, "y")} step={1} onChange={(v) => movePoint(1, "y", v)} />
      {align}
    </div>
  );
}

/**
 * One module's own controls: what it drives, how it staggers across clones, and its
 * curve. Shared by the element inspector and the bench, because a module being
 * configured is the same thing in both places.
 */
export function ModuleParams({
  module: md,
  clones,
  readState,
  onParams,
  /** Ghosted behind each field: what the master says, where this is a linked
   *  instance and the value shown is this element's own. */
  master,
}: {
  module: ModuleData;
  clones: number;
  readState: () => Transform | undefined;
  onParams: (patch: Record<string, unknown>) => void;
  master?: ModuleData;
}) {
  const prop = moduleProp(md);
  const stops = moduleStops(md);
  const delay = typeof md.params.delay === "number" ? md.params.delay : 0;
  const masterDelay =
    master && typeof master.params.delay === "number" ? master.params.delay : undefined;
  const masterProp = master ? moduleProp(master) : undefined;

  return (
    <>
      <label className={`${BOX} justify-between`}>
        <span className={LABEL}>property</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {masterProp !== undefined && masterProp !== prop ? <Ghost>{masterProp}</Ghost> : null}
          <select
            className="bg-transparent text-[11px] text-[#111] outline-none"
            value={prop}
            onChange={(e) => {
              const next = e.target.value as KeyProp;
              const state = readState();
              const seed = state ? baseValue(state, next) : 0;
              onParams({ property: next, stops: stops.map((s) => ({ ...s, v: seed })) });
            }}
          >
            {PROPS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </span>
      </label>

      {clones > 1 ? (
        <>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <NumberField
                label="delay"
                title="clone delay"
                value={delay}
                step={0.01}
                min={0}
                max={1}
                onChange={(v) => onParams({ delay: v })}
              />
            </div>
            {masterDelay !== undefined && masterDelay !== delay ? (
              <Ghost>{masterDelay.toFixed(2)}</Ghost>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-[#b0b0b0]">
            staggers clones across time. 0 = simultaneous
          </p>
        </>
      ) : null}

      <StopList
        readState={readState}
        axes={[{ prop, stops }]}
        range={md.range}
        onChange={(next) => onParams({ stops: next[0] })}
      />
    </>
  );
}

/** What the master holds, behind what this element says instead. */
function Ghost({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="shrink-0 text-[10px] tabular-nums text-[#c8c8c8] line-through"
      title="the module's own value"
    >
      {children}
    </span>
  );
}

/**
 * The element's stack: one row per thing it carries, whether it wrote that thing or
 * borrowed it. Under the list are the two ways to get more — add one here, or take
 * what is already here and make it reusable.
 */
export function ModuleStackSection({ track }: { track: Track }) {
  const library = useStudio((s) => s.moduleLibrary);
  const selectedPart = useStudio((s) => s.selectedPart);
  const layerId = track.layer.id;
  const rows = stackRows(track.modules, library);
  const hasRaw = rows.some((r) => r.kind === "raw");
  const selected = selectedPart?.kind === "module" ? selectedPart.index : null;

  return (
    <section className={SECTION}>
      <p className={`${LABEL} mb-2`}>modules</p>
      {rows.length === 0 ? (
        <p className="mb-2 text-[11px] text-[#b0b0b0]">nothing on this element yet</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {rows.map((row) => (
            <ModuleRow
              key={row.index}
              row={row}
              layerId={layerId}
              selected={row.index === selected}
            />
          ))}
        </ul>
      )}
      <AddModuleButton onAdd={(type) => useStudio.getState().addModule(layerId, type)} />
      {hasRaw ? <SaveStackButton layerId={layerId} /> : null}
    </section>
  );
}

function ModuleRow({
  row,
  layerId,
  selected,
}: {
  row: StackRow;
  layerId: string;
  selected: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const store = useStudio.getState();
  const label = row.kind === "raw" ? moduleProp(row.module) : row.asset.name;
  const summary =
    row.kind === "raw" ? row.module.type : stackSummary(row.resolved);

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-pressed={selected}
          className={`flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left text-[11px] ${
            selected
              ? "border-[#0d99ff] bg-[#e8f4ff] text-[#111]"
              : "border-[#e0e0e0] text-[#555] hover:bg-[#f5f5f5]"
          }`}
          onClick={() =>
            useStudio
              .getState()
              .selectPart(layerId, selected ? null : { kind: "module", index: row.index })
          }
        >
          {row.kind === "linked" ? (
            <span className="shrink-0 text-[#0d99ff]" title="linked to a saved module">
              <ChainIcon />
            </span>
          ) : null}
          <span className="truncate">{label}</span>
          <span className="ml-auto shrink-0 text-[10px] text-[#999]">{summary}</span>
        </button>
        <button
          type="button"
          aria-label={`more for ${label}`}
          aria-expanded={menu}
          title="more"
          className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-[#888] hover:bg-[#f5f5f5] hover:text-[#111]"
          onClick={() => setMenu((v) => !v)}
        >
          ···
        </button>
      </div>

      {menu && row.kind === "linked" ? (
        <div className="flex flex-col gap-0.5 rounded-md border border-[#e0e0e0] bg-[#fbfbfb] p-1">
          <MenuItem
            onClick={() => {
              setMenu(false);
              useStudio.getState().openBench(row.asset.id);
            }}
          >
            edit master
          </MenuItem>
          <MenuItem
            onClick={() => {
              setConfirming(true);
              setMenu(false);
            }}
          >
            detach
          </MenuItem>
          <MenuItem
            onClick={() => {
              setMenu(false);
              store.removeModule(layerId, row.index);
            }}
          >
            remove
          </MenuItem>
        </div>
      ) : null}

      {menu && row.kind === "raw" ? (
        <div className="flex flex-col gap-0.5 rounded-md border border-[#e0e0e0] bg-[#fbfbfb] p-1">
          <MenuItem
            onClick={() => {
              setMenu(false);
              store.removeModule(layerId, row.index);
            }}
          >
            remove
          </MenuItem>
        </div>
      ) : null}

      {confirming ? (
        <div className="rounded-md border border-[#e0e0e0] bg-[#fbfbfb] p-2">
          <p className="mb-1.5 text-[11px] text-[#555]">
            detach from module? changes won't sync.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className={GHOST_BTN}
              onClick={() => {
                setConfirming(false);
                useStudio.getState().detachModule(layerId, row.index);
              }}
            >
              detach
            </button>
            <button type="button" className={GHOST_BTN} onClick={() => setConfirming(false)}>
              cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded px-1.5 py-1 text-left text-[11px] text-[#555] hover:bg-[#f0f0f0] hover:text-[#111]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AddModuleButton({ onAdd }: { onAdd: (type: ModuleType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${GHOST_BTN} w-full text-left`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        + add module
      </button>
      {open ? (
        <ul className="mt-1 flex flex-col gap-0.5 rounded-md border border-[#e0e0e0] bg-[#fbfbfb] p-1">
          {MODULE_TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                className="flex w-full flex-col rounded px-1.5 py-1 text-left hover:bg-[#f0f0f0]"
                onClick={() => {
                  setOpen(false);
                  onAdd(type);
                }}
              >
                <span className="text-[11px] text-[#111]">{type}</span>
                <span className="text-[10px] text-[#b0b0b0]">{MODULE_BLURB[type]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Take what is on the element and keep it. The raw entries leave the stack and come
 *  back as one linked row, so what runs is unchanged and now has a name. */
function SaveStackButton({ layerId }: { layerId: string }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (!naming) {
    return (
      <button
        type="button"
        className={`${GHOST_BTN} mt-1 w-full text-left`}
        onClick={() => setNaming(true)}
      >
        save stack as module
      </button>
    );
  }

  const save = () => {
    if (!name.trim()) return;
    useStudio.getState().saveStackAsModule(layerId, name);
    setNaming(false);
    setName("");
  };

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <label className={`${BOX} min-w-0 flex-1`}>
        <input
          className={`${INPUT} w-full`}
          placeholder="name this module"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setNaming(false);
          }}
        />
      </label>
      <button type="button" className={GHOST_BTN} onClick={save}>
        save
      </button>
    </div>
  );
}

/** Lucide `link` — a row the element does not own outright. */
function ChainIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </svg>
  );
}

/**
 * The picked module, opened up.
 *
 * A raw one writes straight to the element. A linked one writes to that element's
 * overrides, one entry at a time, and shows what the master says behind every field
 * it has been told differently about — so the two readings are never in doubt.
 */
export function ModuleInspector({ track, index }: { track: Track; index: number }) {
  const library = useStudio((s) => s.moduleLibrary);
  const composition = useStudio((s) => s.composition);
  const t = useStudio((s) => s.t);
  const layerId = track.layer.id;
  const clones = cloneCount(track.layer.distributor);
  const row = stackRows(track.modules, library)[index];
  if (!row) return null;

  /** What the element reads on the frame right now — the first clone of it, which is
   *  the one a value typed here is being judged against. */
  const readState = (): Transform | undefined =>
    renderState(composition, t, library).find((it) => it.id === layerId)?.state;

  if (row.kind === "raw") {
    return (
      <section className={`${SECTION} bg-[#fbfbfb]`}>
        <p className={`${LABEL} mb-2`}>
          {row.module.type} · {moduleProp(row.module)}
        </p>
        <ModuleParams
          module={row.module}
          clones={clones}
          readState={readState}
          onParams={(patch) => useStudio.getState().setModuleParams(layerId, index, patch)}
        />
      </section>
    );
  }

  return (
    <section className={`${SECTION} bg-[#fbfbfb]`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="shrink-0 text-[#0d99ff]">
          <ChainIcon />
        </span>
        <p className={`${LABEL} min-w-0 truncate`}>{row.asset.name}</p>
      </div>
      {row.resolved.map((md, entry) => (
        <div key={entry} className={entry > 0 ? "mt-3 border-t border-[#ededed] pt-3" : ""}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <p className={SUBLABEL}>{md.type}</p>
            {row.link.overrides[entry] ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#0d99ff]"
                title="this element has its own value here"
              />
            ) : null}
          </div>
          <ModuleParams
            module={md}
            clones={clones}
            readState={readState}
            master={row.asset.stack[entry]}
            onParams={(patch) =>
              useStudio.getState().setLinkedOverride(layerId, index, entry, patch)
            }
          />
        </div>
      ))}
    </section>
  );
}
