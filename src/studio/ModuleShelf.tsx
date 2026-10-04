import { useState } from "react";
import { useStudio, proxyBase, type Bench } from "./store";
import { cloneCount, stackSummary } from "./modules";
import { DistributorSection, ModuleParams } from "./ModuleStack";
import { typeName } from "./text";
import { BOX, CloseIcon, GHOST_BTN, INPUT, LABEL, SECTION, SUBLABEL } from "./fields";

export const MODULE_DRAG = "application/x-tween-module";

/** The drawer's second panel: every behaviour that has been kept. */
export function ModuleShelf() {
  const library = useStudio((s) => s.moduleLibrary);

  return (
    <>
      {/* The same header the Assets shelf has, so the way you add a module is the
          way you add a picture. */}
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 bg-bg px-3 pt-3 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">
          Modules
        </span>
        <button
          type="button"
          className="grid h-[22px] w-[22px] place-items-center rounded-[5px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-text-primary"
          aria-label="New module"
          title="New module"
          onClick={() => useStudio.getState().openBench()}
        >
          <PlusIcon />
        </button>
      </div>
      {library.length === 0 ? (
        <p className="m-0 px-3 pt-1 pb-3 text-xs leading-normal text-text-muted/60">
          No modules yet
        </p>
      ) : (
        <ul className="flex flex-col gap-1 px-3 pt-1 pb-3.5">
          {library.map((asset) => (
            <ModuleCard key={asset.id} id={asset.id} />
          ))}
        </ul>
      )}
    </>
  );
}

/** Lucide `plus`, matched to the Assets header's own. */
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

function ModuleCard({ id }: { id: string }) {
  const asset = useStudio((s) => s.moduleLibrary.find((a) => a.id === id));
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!asset) return null;
  const uses = useStudio.getState().moduleUses(asset.id);

  return (
    <li className="flex flex-col gap-1">
      <div
        className="group/module flex min-w-0 cursor-grab items-center gap-1 rounded-[7px] border border-border px-2 py-1.5 hover:border-text-muted/50"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(MODULE_DRAG, asset.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11px] leading-[1.3] text-text-primary" title={asset.name}>
            {asset.name}
          </span>
          <span className="truncate text-[9px] leading-[1.35] text-text-muted/60">
            {stackSummary(asset.stack) || "empty"}
          </span>
        </span>
        <button
          type="button"
          aria-label={`more for ${asset.name}`}
          aria-expanded={menu}
          title="More"
          className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded text-text-muted hover:bg-text-primary/5 hover:text-text-primary"
          draggable={false}
          onClick={() => setMenu((v) => !v)}
        >
          ···
        </button>
      </div>

      {menu ? (
        <div className="flex flex-col gap-0.5 rounded-md border border-border bg-text-primary/[0.03] p-1">
          <button
            type="button"
            className="rounded px-1.5 py-1 text-left text-[11px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary"
            onClick={() => {
              setMenu(false);
              useStudio.getState().openBench(asset.id);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded px-1.5 py-1 text-left text-[11px] text-text-primary/70 hover:bg-text-primary/5 hover:text-text-primary"
            onClick={() => {
              setMenu(false);
              setConfirming(true);
            }}
          >
            Delete
          </button>
        </div>
      ) : null}

      {confirming ? (
        <div className="rounded-md border border-border bg-text-primary/[0.03] p-2">
          {uses > 0 ? (
            <p className="mb-1.5 text-[11px] leading-snug text-text-primary/70">
              {uses} element{uses === 1 ? "" : "s"} use this module. deleting will detach
              them.
            </p>
          ) : null}
          <div className="flex gap-1.5">
            <button
              type="button"
              className={GHOST_BTN}
              onClick={() => {
                setConfirming(false);
                useStudio.getState().deleteModuleAsset(asset.id);
              }}
            >
              Delete
            </button>
            <button type="button" className={GHOST_BTN} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The bench: a module written with no element in front of you.
 *
 * It takes the inspector's place while it is open, so the frame stays visible and
 * the proxy on it answers every change. Nothing here reaches the composition until
 * save — closing leaves no trace, which is the whole reason it is a separate surface
 * rather than a scratch element on the canvas.
 */
export function BenchPanel({ bench }: { bench: Bench }) {
  const frame = useStudio((s) => s.frame);
  const store = useStudio.getState();
  const clones = cloneCount(bench.distributor ?? undefined);
  const base = proxyBase(frame);

  return (
    <>
      <section className={SECTION}>
        <p className={`${LABEL} mb-2`}>{bench.editing ? "Edit module" : "New module"}</p>
        {/* Shaking says the same thing the red border does, in the one channel a
            field with nothing typed in it still has. */}
        <label
          className={`${BOX} ${bench.nameMissing ? "border-[#ff3b6b] bench-shake" : ""}`}
        >
          <input
            className={`${INPUT} w-full`}
            placeholder="Untitled module"
            aria-label="module name"
            value={bench.name}
            onChange={(e) => store.setBenchName(e.target.value)}
          />
        </label>
        <div className="mt-2 flex gap-1.5">
          <button type="button" className={GHOST_BTN} onClick={() => store.saveBench()}>
            Save module
          </button>
          <button type="button" className={GHOST_BTN} onClick={() => store.closeBench()}>
            Cancel
          </button>
        </div>
      </section>

      <DistributorSection
        distributor={bench.distributor ?? undefined}
        onChange={(d) => store.setBenchDistributor(d)}
      />

      <section className={SECTION}>
        <p className={`${LABEL} mb-2`}>Stack</p>
        {bench.stack.length === 0 ? (
          <p className="mb-2 text-[11px] text-text-muted/60">Nothing on the stack yet</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1">
            {bench.stack.map((md, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-text-primary/70">
                  <span className="truncate">{typeName(md.type)}</span>
                </span>
                <StackButton
                  label="Move up"
                  disabled={i === 0}
                  onClick={() => store.moveBenchModule(i, i - 1)}
                >
                  ↑
                </StackButton>
                <StackButton
                  label="Move down"
                  disabled={i === bench.stack.length - 1}
                  onClick={() => store.moveBenchModule(i, i + 1)}
                >
                  ↓
                </StackButton>
                <StackButton label="Remove" onClick={() => store.removeBenchModule(i)}>
                  <CloseIcon />
                </StackButton>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={`${GHOST_BTN} w-full text-left`}
          onClick={() => store.addBenchModule("pulse")}
        >
          + Add pulse
        </button>
      </section>

      {bench.stack.map((md, i) => (
        <section key={i} className={`${SECTION} bg-text-primary/[0.03]`}>
          <p className={`${SUBLABEL} mb-1.5`}>{typeName(md.type)}</p>
          <ModuleParams
            module={md}
            clones={clones}
            readState={() => base}
            onParams={(patch) => useStudio.getState().setBenchModuleParams(i, patch)}
          />
        </section>
      ))}
    </>
  );
}

function StackButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="grid h-[26px] w-[22px] shrink-0 place-items-center rounded-md text-text-muted hover:bg-text-primary/5 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
