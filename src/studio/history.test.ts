import { describe, expect, it } from "vitest";
import {
  LIMIT,
  MERGE_MS,
  canRedo,
  canUndo,
  emptyHistory,
  record,
  redo,
  seal,
  undo,
} from "./history";

const h0 = () => emptyHistory<string>();

describe("record", () => {
  it("stacks one step per discrete edit", () => {
    const h = record(record(h0(), "a", null, 0), "b", null, 1);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("folds an interaction's repeats into the step it opened", () => {
    let h = record(h0(), "a", "move:1", 0);
    h = record(h, "b", "move:1", 10);
    h = record(h, "c", "move:1", 20);
    expect(h.past).toEqual(["a"]);
  });

  it("keeps two interactions apart, even under one key", () => {
    let h = record(h0(), "a", "move:1", 0);
    h = record(seal(h), "b", "move:1", 10);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("stops merging once the window has passed", () => {
    let h = record(h0(), "a", "move:1", 0);
    h = record(h, "b", "move:1", MERGE_MS + 1);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("drops the redo branch an edit replaces", () => {
    const back = undo(record(h0(), "a", null, 0), "b");
    expect(back && canRedo(back.history)).toBe(true);
    const h = record(back!.history, "a", null, 1);
    expect(h.future).toEqual([]);
  });

  it("forgets the oldest steps rather than growing without bound", () => {
    let h = h0();
    for (let i = 0; i < LIMIT + 5; i++) h = record(h, String(i), null, i);
    expect(h.past).toHaveLength(LIMIT);
    expect(h.past[0]).toBe("5");
  });
});

describe("undo and redo", () => {
  it("walks back and forward over the same states", () => {
    let h = record(h0(), "a", null, 0);
    h = record(h, "b", null, 1);

    const back1 = undo(h, "c")!;
    expect(back1.state).toBe("b");
    const back2 = undo(back1.history, back1.state)!;
    expect(back2.state).toBe("a");
    expect(canUndo(back2.history)).toBe(false);

    const fwd1 = redo(back2.history, back2.state)!;
    expect(fwd1.state).toBe("b");
    const fwd2 = redo(fwd1.history, fwd1.state)!;
    expect(fwd2.state).toBe("c");
    expect(canRedo(fwd2.history)).toBe(false);
  });

  it("has nothing to do at either end", () => {
    expect(undo(h0(), "a")).toBeNull();
    expect(redo(h0(), "a")).toBeNull();
  });

  it("closes the open step, so the next edit does not merge into a restored one", () => {
    const h = record(h0(), "a", "move:1", 0);
    const back = undo(h, "b")!;
    const next = record(back.history, "a", "move:1", 1);
    expect(next.past).toEqual(["a"]);
  });
});

describe("seal", () => {
  it("leaves a closed history alone", () => {
    const h = record(h0(), "a", null, 0);
    expect(seal(h)).toBe(h);
  });
});
