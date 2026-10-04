import { useEffect, useRef, useState } from "react";
import type {
  Distributor,
  DistributorType,
  ModuleData,
  Track,
  Transform,
} from "../core/types";
import { useStudio } from "./store";
import { capitalize, typeName } from "./text";
import {
  PROPS,
  PULSE_PROPS,
  baseValue,
  CLONER_BLURB,
  CLONER_TYPES,
  cloneCount,
  defaultDistributor,
  moduleProp,
  moduleStops,
  pulseDefaults,
  stackRows,
  type ClonerType,
  type KeyProp,
  type PulseProp,
  type StackRow,
} from "./modules";
import { addNode } from "./gizmo";
import { Popover } from "./Popover";
import { StopList } from "./StopList";
import {
  BOX,
  CloseIcon,
  GHOST_BTN,
  LABEL,
  NumberField,
  SECTION,
  SliderField,
} from "./fields";

/**
 * The cloners on an element.
 *
 * A cloner is not a module: it says how many of the element there are and where they
 * stand, and nothing about how any of them behaves over time. So it gets its own
 * section above the stack, and its types are picked from a menu rather than typed
 * into a field on something else.
 *
 * The section lists them and nothing else. A layout's own numbers live in a card
 * that opens beside the row, because a panel this narrow cannot hold five fields per
 * cloner and still read as a list of what the element has.
 *
 * One at a time for now — `expand` lays out a single distributor, so a second would
 * be a control with nothing behind it. The section is named for what it will hold.
 */
export function DistributorSection({
  distributor: d,
  onChange,
}: {
  distributor: Distributor | undefined;
  onChange: (d: Distributor | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);

  return (
    <section className={SECTION}>
      <div className={`flex items-center justify-between${d ? " mb-2" : ""}`}>
        <p className={LABEL}>Cloners</p>
        <button
          ref={addRef}
          type="button"
          aria-label="add cloner"
          aria-expanded={adding}
          title={d ? "One cloner at a time" : "Add cloner"}
          disabled={Boolean(d)}
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
          onClick={() => setAdding((v) => !v)}
        >
          <PlusIcon />
        </button>
      </div>

      {adding ? (
        <Popover
          anchorRef={addRef}
          placement="below"
          label="add cloner"
          onClose={() => setAdding(false)}
        >
          <ClonerMenu
            onPick={(type) => {
              setAdding(false);
              setFresh(true);
              onChange(defaultDistributor(type));
            }}
          />
        </Popover>
      ) : null}

      {d ? (
        <ClonerRow
          distributor={d}
          onChange={onChange}
          openOnMount={fresh}
          onOpened={() => setFresh(false)}
        />
      ) : null}
    </section>
  );
}

/** One cloner, as the section lists it: what it is, and a way to open the rest. */
function ClonerRow({
  distributor: d,
  onChange,
  openOnMount,
  onOpened,
}: {
  distributor: Distributor;
  onChange: (d: Distributor | null) => void;
  openOnMount: boolean;
  onOpened: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openOnMount) return;
    setOpen(true);
    onOpened();
  }, [openOnMount]);

  return (
    <div ref={rowRef} className="flex items-center gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${d.type} cloner settings`}
        className={`flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left text-[11px] ${
          open
            ? "border-accent bg-accent/10 text-text-primary"
            : "border-border text-text-primary/70 hover:bg-text-primary/5"
        }`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="shrink-0 opacity-70">
          <ClonerIcon type={d.type} />
        </span>
        <span className="truncate">{capitalize(d.type)}</span>
      </button>
      <button
        type="button"
        aria-label="remove cloner"
        title="Remove cloner"
        className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
        onClick={() => onChange(null)}
      >
        <CloseIcon />
      </button>
      {open ? (
        <Popover
          anchorRef={rowRef}
          placement="left"
          label={`${d.type} cloner`}
          draggable
          onClose={() => setOpen(false)}
        >
          <ClonerSettings
            distributor={d}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/** Everything about one cloner, in the card beside its row. */
function ClonerSettings({
  distributor: d,
  onChange,
  onClose,
}: {
  distributor: Distributor;
  onChange: (d: Distributor) => void;
  onClose: () => void;
}) {
  const [switching, setSwitching] = useState(false);

  return (
    <div className="w-[264px]">
      <div
        data-drag-handle
        className="relative flex cursor-grab touch-none items-center justify-between gap-1 px-3 py-2 active:cursor-grabbing"
      >
        <button
          type="button"
          aria-expanded={switching}
          className="flex min-w-0 items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-left text-[11px] text-text-primary hover:bg-text-primary/5"
          onClick={() => setSwitching((v) => !v)}
        >
          <span className="shrink-0 opacity-70">
            <ClonerIcon type={d.type} />
          </span>
          <span className="truncate">{capitalize(d.type)}</span>
          <span className="shrink-0 text-text-muted">
            <ChevronDownIcon />
          </span>
        </button>
        <button
          type="button"
          aria-label="close"
          className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        {switching ? (
          // Inside the card, so plain absolute placement is safe — nothing here
          // scrolls or clips the way the panel behind it does.
          <div className="absolute left-2 right-2 top-[34px] z-30 rounded-[7px] border border-border bg-bg p-1 shadow-[0_4px_14px_rgba(0,0,0,.12)]">
            <ClonerMenu
              compact
              onPick={(type) => {
                setSwitching(false);
                // The count is the author's; the rest belongs to the old layout and
                // means nothing to the new one.
                onChange({ ...defaultDistributor(type), count: d.count });
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="border-t border-border/60 p-3">
        <DistributorParams distributor={d} onChange={onChange} />
      </div>
    </div>
  );
}

/** The layouts, as a menu — picking one is adding a thing, and a select would read
 *  as changing a setting on nothing. */
function ClonerMenu({
  onPick,
  compact,
}: {
  onPick: (type: ClonerType) => void;
  /** Inside another card, where the blurbs would be a second column too many. */
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "" : "w-[186px] p-1"}>
      {CLONER_TYPES.map((type, i) => (
        <li key={type}>
          <button
            type="button"
            autoFocus={i === 0}
            className="flex w-full items-center gap-2 rounded-[5px] px-1.5 py-1.5 text-left text-[11px] text-text-primary hover:bg-accent hover:text-bg focus-visible:bg-accent focus-visible:text-bg focus-visible:outline-none"
            onClick={() => onPick(type)}
          >
            <span className="shrink-0 opacity-70">
              <ClonerIcon type={type} />
            </span>
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span>{capitalize(type)}</span>
              {compact ? null : (
                <span className="shrink-0 text-[9px] opacity-60">
                  {CLONER_BLURB[type]}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A glyph per layout: the shape the clones land in. */
function ClonerIcon({ type }: { type: DistributorType }) {
  const dots =
    type === "grid"
      ? [
          [4, 4],
          [10, 4],
          [16, 4],
          [4, 10],
          [10, 10],
          [16, 10],
          [4, 16],
          [10, 16],
          [16, 16],
        ]
      : type === "radial"
        ? [
            [10, 3],
            [15, 5],
            [17, 10],
            [15, 15],
            [10, 17],
            [5, 15],
            [3, 10],
            [5, 5],
          ]
        : [
            [3, 10],
            [7, 10],
            [11, 10],
            [15, 10],
          ];
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true">
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.6" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Lucide `plus`, at the size the section headers use. */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

/** Lucide `chevron-down` — the layout can be swapped from the card's own header. */
function ChevronDownIcon() {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
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

  const count = (
    <NumberField
      label="Count"
      value={d.count}
      step={1}
      min={1}
      max={200}
      precision={0}
      onChange={(v) => onChange({ ...d, count: Math.max(1, Math.round(v)) })}
    />
  );

  const align = (
    <label className={`${BOX} col-span-2 justify-between`}>
      <span className={LABEL}>Face along</span>
      <input
        type="checkbox"
        className="accent-accent"
        checked={Boolean(p.align)}
        onChange={(e) => set({ align: e.target.checked })}
      />
    </label>
  );

  if (d.type === "grid") {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{count}</div>
        <NumberField
          label="Cols"
          value={num("cols", Math.ceil(Math.sqrt(d.count)))}
          step={1}
          min={1}
          precision={0}
          onChange={(v) => set({ cols: Math.max(1, Math.round(v)) })}
        />
        <div />
        <div className="col-span-2 flex flex-col gap-2">
          <SliderField
            label="Gap X"
            value={num("gapX", 100)}
            min={0}
            max={600}
            onChange={(v) => set({ gapX: Math.max(0, v) })}
          />
          <SliderField
            label="Gap Y"
            value={num("gapY", 100)}
            min={0}
            max={600}
            onChange={(v) => set({ gapY: Math.max(0, v) })}
          />
        </div>
      </div>
    );
  }

  if (d.type === "radial") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {count}
        <NumberField
          label="Start"
          title="Start angle"
          value={num("startAngle", -90)}
          step={1}
          onChange={(v) => set({ startAngle: v })}
        />
        <div className="col-span-2 flex flex-col gap-2">
          <SliderField
            label="Radius"
            value={num("radius", 200)}
            min={1}
            max={600}
            onChange={(v) => set({ radius: Math.max(1, v) })}
          />
          <SliderField
            label="Sweep"
            value={num("sweep", 360)}
            min={0}
            max={360}
            step={5}
            onChange={(v) => set({ sweep: v })}
          />
        </div>
        {align}
      </div>
    );
  }

  // A path is shaped on the frame, not typed in here: the run, its anchors and the
  // ghosts of every clone are on the canvas while the element is picked. What is
  // left for the panel is the one thing the gizmo has nowhere to put.
  return (
    <>
      {count}
      <div className="mt-2">{align}</div>
      <button
        type="button"
        className={`${GHOST_BTN} mt-2 w-full text-left`}
        onClick={() => onChange(addNode(d))}
      >
        + Add anchor
      </button>
      <p className="mt-1 text-[10px] leading-snug text-text-muted/60">
        Drag the anchors on the frame. Double-click one to round it off,
        Alt-click to take it out.
      </p>
    </>
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
    master && typeof master.params.delay === "number"
      ? master.params.delay
      : undefined;
  const masterProp = master ? moduleProp(master) : undefined;

  return (
    <>
      <label className={`${BOX} justify-between`}>
        <span className={LABEL}>Property</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {masterProp !== undefined && masterProp !== prop ? (
            <Ghost>{capitalize(masterProp)}</Ghost>
          ) : null}
          <select
            className="bg-transparent text-[11px] text-text-primary outline-none"
            value={prop}
            onChange={(e) => {
              const next = e.target.value as KeyProp;
              const state = readState();
              const seed = state ? baseValue(state, next) : 0;
              onParams({
                property: next,
                stops: stops.map((s) => ({ ...s, v: seed })),
              });
            }}
          >
            {PROPS.map((p) => (
              <option key={p} value={p}>
                {capitalize(p)}
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
                label="Delay"
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
          <p className="mt-1 text-[10px] text-text-muted/60">
            Staggers clones across time. 0 = simultaneous
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
      className="shrink-0 text-[10px] tabular-nums text-text-muted/50 line-through"
      title="Module's own value"
    >
      {children}
    </span>
  );
}

export function ModuleStackSection({ track }: { track: Track }) {
  const library = useStudio((s) => s.moduleLibrary);
  const layerId = track.layer.id;
  const rows = stackRows(track.modules, library);

  return (
    <section className={SECTION}>
      <div className={`flex items-center justify-between${rows.length > 0 ? " mb-2" : ""}`}>
        <p className={LABEL}>Modules</p>
        <button
          type="button"
          aria-label="add pulse"
          title="Add pulse"
          className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
          onClick={() => useStudio.getState().addModule(layerId, "pulse")}
        >
          <PlusIcon />
        </button>
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <ModuleRow key={row.index} row={row} layerId={layerId} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ModuleRow({ row, layerId }: { row: StackRow; layerId: string }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const composition = useStudio((s) => s.composition);
  const track = composition.tracks.find((tr) => tr.layer.id === layerId);
  const clones = cloneCount(track?.layer.distributor);
  const isPulse = row.kind === "raw" && row.module.type === "pulse";
  const label =
    row.kind === "raw"
      ? isPulse
        ? `Pulse · ${capitalize((row.module.params.property as string) ?? "scale")}`
        : typeName(row.module.type)
      : row.asset.name;

  return (
    <li>
      <div ref={rowRef} className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={isPulse ? open : undefined}
          className={`flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left text-[11px] ${
            open
              ? "border-accent bg-accent/10 text-text-primary"
              : "border-border text-text-primary/70 hover:bg-text-primary/5"
          }`}
          onClick={() => {
            if (isPulse) setOpen((v) => !v);
          }}
        >
          {row.kind === "linked" ? (
            <span className="shrink-0 text-accent" title="Linked module">
              <ChainIcon />
            </span>
          ) : null}
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          aria-label={`remove ${label}`}
          title="Remove"
          className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
          onClick={() => useStudio.getState().removeModule(layerId, row.index)}
        >
          <CloseIcon />
        </button>
      </div>
      {open && isPulse && row.kind === "raw" ? (
        <Popover
          anchorRef={rowRef}
          placement="left"
          label="pulse settings"
          draggable
          onClose={() => setOpen(false)}
        >
          <PulseSettings
            module={row.module}
            clones={clones}
            onParams={(patch) =>
              useStudio.getState().setModuleParams(layerId, row.index, patch)
            }
            onClose={() => setOpen(false)}
          />
        </Popover>
      ) : null}
    </li>
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

function PulseSettings({
  module: md,
  clones,
  onParams,
  onClose,
}: {
  module: ModuleData;
  clones: number;
  onParams: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const property = (md.params.property as PulseProp) ?? "scale";
  const rhythm = typeof md.params.rhythm === "number" ? md.params.rhythm : 1;
  const stagger = typeof md.params.stagger === "number" ? md.params.stagger : 0;
  const min = typeof md.params.min === "number" ? md.params.min : 0.8;
  const max = typeof md.params.max === "number" ? md.params.max : 1.2;
  const blend = (md.params.blend as string) ?? "mul";
  const hasCloner = clones > 1;

  const setProperty = (p: PulseProp) => {
    const d = pulseDefaults(p);
    onParams({ property: p, min: d.min, max: d.max, blend: d.blend });
  };

  return (
    <div className="w-[264px]">
      <div
        data-drag-handle
        className="relative flex cursor-grab touch-none items-center justify-between gap-1 px-3 py-2 active:cursor-grabbing"
      >
        <span className="text-[11px] font-medium text-text-primary">
          Pulse · {capitalize(property)}
        </span>
        <button
          type="button"
          aria-label="close"
          className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="border-t border-border/60 p-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Property
            </span>
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value as PulseProp)}
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-text-primary outline-none focus:border-accent"
            >
              {PULSE_PROPS.map((p) => (
                <option key={p} value={p}>
                  {capitalize(
                    p === "y"
                      ? "Position Y"
                      : p === "x"
                        ? "Position X"
                        : p,
                  )}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Min
            </span>
            <NumberField
              label=""
              value={min}
              step={0.1}
              onChange={(v) => onParams({ min: v })}
              tight
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Max
            </span>
            <NumberField
              label=""
              value={max}
              step={0.1}
              onChange={(v) => onParams({ max: v })}
              tight
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Rhythm
            </span>
            <div className="flex flex-1 items-center gap-1">
              <NumberField
                label=""
                value={rhythm}
                step={0.1}
                min={0.01}
                onChange={(v) => onParams({ rhythm: v })}
                tight
              />
              <span className="text-[10px] text-text-muted/60">/s</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Stagger
            </span>
            <div className="flex flex-1 items-center gap-1">
              <NumberField
                label=""
                value={stagger}
                step={0.05}
                min={0}
                onChange={(v) => onParams({ stagger: v })}
                tight
              />
              <span className="text-[10px] text-text-muted/60">s</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-[10px] text-text-muted">
              Blend
            </span>
            <select
              value={blend}
              onChange={(e) => onParams({ blend: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px] text-text-primary outline-none focus:border-accent"
            >
              <option value="mul">Mul</option>
              <option value="add">Add</option>
              <option value="set">Set</option>
            </select>
          </div>

          {!hasCloner ? (
            <p className="text-[10px] text-text-muted/60">
              Add a cloner to stagger across clones
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
