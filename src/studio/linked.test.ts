import { describe, expect, it } from "vitest";
import type { Stop } from "../core/curve";
import { linkedFamilies, linkedMotion, motionKey, railCaps } from "./linked";
import type { BlockView, KeyTarget, Range } from "./modules";

const block = (
  prop: KeyTarget,
  stops: Stop[],
  range: Range = [0, 1],
  standalone = true,
): BlockView => ({
  part: standalone
    ? { kind: "keyframes", property: prop }
    : { kind: "module", index: 0 },
  prop,
  label: prop,
  range,
  stops,
  standalone,
});

const slide = (to: number): Stop[] => [
  { t: 0, v: 0, ease: "linear" },
  { t: 1, v: to, ease: "linear" },
];

describe("motionKey", () => {
  it("is the same for two elements sliding the same way from different places", () => {
    expect(motionKey(block("position", slide(300)))).toBe(
      motionKey(block("position", slide(900))),
    );
  });

  it("tells apart curves whose stops fall at different times", () => {
    const early: Stop[] = [
      { t: 0, v: 0, ease: "linear" },
      { t: 0.4, v: 10, ease: "linear" },
    ];
    expect(motionKey(block("position", early))).not.toBe(
      motionKey(block("position", slide(10))),
    );
  });

  it("tells apart curves running over different stretches of the ruler", () => {
    expect(motionKey(block("position", slide(1), [0, 0.5]))).not.toBe(
      motionKey(block("position", slide(1), [0.5, 1])),
    );
  });

  it("tells apart curves carried by different easings", () => {
    const eased: Stop[] = [
      { t: 0, v: 0, ease: "linear" },
      { t: 1, v: 10, ease: "inout" },
    ];
    expect(motionKey(block("position", eased))).not.toBe(
      motionKey(block("position", slide(10))),
    );
  });

  it("tells apart the same timing on different properties", () => {
    expect(motionKey(block("rotation", slide(90)))).not.toBe(
      motionKey(block("opacity", slide(1))),
    );
  });

  it("tells a packaged module apart from keyframes that happen to match it", () => {
    expect(motionKey(block("x", slide(1), [0, 1], false))).not.toBe(
      motionKey(block("x", slide(1), [0, 1], true)),
    );
  });
});

describe("linkedMotion", () => {
  it("gathers the elements running one curve the same way", () => {
    const groups = linkedMotion([
      { id: "a", blocks: [block("position", slide(300))] },
      { id: "b", blocks: [block("position", slide(900))] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].property).toBe("position");
    expect(groups[0].members).toEqual(["a", "b"]);
  });

  it("says nothing about a property only one element animates", () => {
    expect(
      linkedMotion([
        { id: "a", blocks: [block("position", slide(1))] },
        { id: "b", blocks: [block("rotation", slide(90))] },
      ]),
    ).toEqual([]);
  });

  it("keeps a group per property when a set was keyed on several", () => {
    const both = [block("position", slide(1)), block("rotation", slide(90))];
    const groups = linkedMotion([
      { id: "a", blocks: both },
      { id: "b", blocks: both },
    ]);
    expect(groups.map((g) => g.property)).toEqual(["position", "rotation"]);
    for (const g of groups) expect(g.members).toEqual(["a", "b"]);
  });

  it("drops an element out of the group once its curve is tweaked on its own", () => {
    const moved: Stop[] = [
      { t: 0, v: 0, ease: "linear" },
      { t: 0.6, v: 300, ease: "linear" },
    ];
    const groups = linkedMotion([
      { id: "a", blocks: [block("position", slide(300))] },
      { id: "b", blocks: [block("position", moved)] },
      { id: "c", blocks: [block("position", slide(900))] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toEqual(["a", "c"]);
  });

  it("has nothing to say about a composition with no motion in it", () => {
    expect(linkedMotion([{ id: "a", blocks: [] }])).toEqual([]);
  });
});

describe("linkedFamilies", () => {
  it("puts the members of a group in one family", () => {
    const families = linkedFamilies(
      linkedMotion([
        { id: "a", blocks: [block("position", slide(1))] },
        { id: "b", blocks: [block("position", slide(2))] },
      ]),
    );
    expect(families.get("a")).toBe(families.get("b"));
    expect(families.has("c")).toBe(false);
  });

  it("joins up elements tied by different properties", () => {
    // a and b share a position, b and c share a rotation, so all three move
    // together as far as the rail down the gutter is concerned.
    const families = linkedFamilies(
      linkedMotion([
        { id: "a", blocks: [block("position", slide(1))] },
        { id: "b", blocks: [block("position", slide(2)), block("rotation", slide(90))] },
        { id: "c", blocks: [block("rotation", slide(45))] },
      ]),
    );
    expect(families.get("a")).toBe(families.get("c"));
  });

  it("keeps two unrelated pairs apart", () => {
    const families = linkedFamilies(
      linkedMotion([
        { id: "a", blocks: [block("position", slide(1))] },
        { id: "b", blocks: [block("position", slide(2))] },
        { id: "c", blocks: [block("opacity", slide(0), [0, 0.5])] },
        { id: "d", blocks: [block("opacity", slide(1), [0, 0.5])] },
      ]),
    );
    expect(families.get("a")).toBe(families.get("b"));
    expect(families.get("c")).toBe(families.get("d"));
    expect(families.get("a")).not.toBe(families.get("c"));
  });
});

describe("railCaps", () => {
  const fam = (pairs: [string, string][]) => new Map(pairs);

  it("caps the ends of a run and leaves the middle open", () => {
    const rows = [{ id: "a" }, { id: "a" }, { id: "b" }, { id: "b" }];
    expect(railCaps(rows, fam([["a", "f"], ["b", "f"]]))).toEqual([
      "top",
      "middle",
      "middle",
      "bottom",
    ]);
  });

  it("leaves the rows of an element in no family alone", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(railCaps(rows, fam([["a", "f"], ["c", "f"]]))).toEqual([
      "only",
      null,
      "only",
    ]);
  });

  it("draws one bracket per run when a family is split up the timeline", () => {
    const rows = [{ id: "a" }, { id: "a" }, { id: "x" }, { id: "b" }, { id: "b" }];
    expect(railCaps(rows, fam([["a", "f"], ["b", "f"]]))).toEqual([
      "top",
      "bottom",
      null,
      "top",
      "bottom",
    ]);
  });

  it("has nothing to draw when nothing is linked", () => {
    expect(railCaps([{ id: "a" }, { id: "b" }], new Map())).toEqual([null, null]);
  });
});
