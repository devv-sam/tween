/**
 * Undo/redo, the way a design tool does it: a stack of the states an edit replaced,
 * a stack of the ones an undo took back, and a merge key so one interaction — a
 * drag, a run of keystrokes in a field — is one step rather than a hundred.
 *
 * The stacks hold whole snapshots. Every edit in the studio rebuilds the objects it
 * touches and shares the rest, so a snapshot is a handful of references, not a copy
 * of the composition.
 */

export type History<T> = {
  /** States an edit replaced, oldest first. The top is what an undo restores. */
  past: T[];
  /** States an undo took back, oldest first. The top is what a redo restores. */
  future: T[];
  /** The merge key of the entry on top of `past`, or null when that entry is closed
   *  and the next edit has to start its own. */
  key: string | null;
  /** When the top entry last took an edit, for the merge window. */
  at: number;
};

/** How many steps back the studio can go. Deep enough that no session reaches it by
 *  hand, shallow enough that the stack cannot grow without bound. */
export const LIMIT = 200;

/**
 * How long a merge key stays open without an explicit seal. Every interaction in the
 * studio closes itself — a drag on release, a field on blur — so this is only a
 * backstop for one that forgets to: long enough that a paused drag is still one step,
 * short enough that a forgotten seal cannot swallow the next edit.
 */
export const MERGE_MS = 4000;

export const emptyHistory = <T>(): History<T> => ({
  past: [],
  future: [],
  key: null,
  at: 0,
});

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;

/**
 * Record the state an edit is about to replace. `key` is the interaction the edit
 * belongs to: repeats of the same open key fold into the entry already on the stack,
 * so the whole interaction undoes at once. A null key is always its own step.
 *
 * Any edit drops the redo stack — the branch it would have replayed is gone.
 */
export function record<T>(
  h: History<T>,
  before: T,
  key: string | null,
  now: number,
): History<T> {
  const merges =
    key !== null && key === h.key && h.past.length > 0 && now - h.at <= MERGE_MS;
  if (merges) return { ...h, future: [], at: now };
  return { past: [...h.past, before].slice(-LIMIT), future: [], key, at: now };
}

/**
 * Close the open entry, so the next edit starts a new step even if it carries the
 * same key. Called when an interaction ends: a drag released, a field blurred.
 */
export const seal = <T>(h: History<T>): History<T> =>
  h.key === null ? h : { ...h, key: null };

/** The state to go back to, and the stacks that go with it — or null at the bottom. */
export function undo<T>(
  h: History<T>,
  current: T,
): { history: History<T>; state: T } | null {
  if (h.past.length === 0) return null;
  return {
    history: {
      past: h.past.slice(0, -1),
      future: [...h.future, current],
      key: null,
      at: 0,
    },
    state: h.past[h.past.length - 1],
  };
}

/** The state an undo took back, and the stacks that go with it — or null at the top. */
export function redo<T>(
  h: History<T>,
  current: T,
): { history: History<T>; state: T } | null {
  if (h.future.length === 0) return null;
  return {
    history: {
      past: [...h.past, current].slice(-LIMIT),
      future: h.future.slice(0, -1),
      key: null,
      at: 0,
    },
    state: h.future[h.future.length - 1],
  };
}
