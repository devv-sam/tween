import { describe, it, expect } from "vitest";
import "./index";
import { getModule } from "../registry";
import { fieldValue } from "../fields";
import type { Transform, EvalCtx, FieldDef } from "../types";

const def: FieldDef = { id: "b", radius: 100, falloff: 0.5, motion: { kind: "static", x: 0, y: 0 } };
const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const ctx = (): EvalCtx => ({ t: 0, localT: 0, u: 0, i: 0, count: 1, field: (_id, fx, fy) => fieldValue(def, fx, fy, 0) });
const fm = getModule("field");
const params = { fieldId: "b", property: "scale", amount: 2, blend: "mul" };

describe("field module", () => {
  it("drives higher near the center, none far away", () => {
    const near = fm.evaluate({ ...base, x: 0 }, ctx(), params);
    const far = fm.evaluate({ ...base, x: 200 }, ctx(), params);
    expect(near.scaleX).toBeCloseTo(2);
    expect(far.scaleX).toBeCloseTo(1);
    // `scale` is virtual — both axes move together.
    expect(near.scaleY).toBeCloseTo(2);
  });
});
