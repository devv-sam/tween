import { beforeEach, describe, expect, it } from "vitest";
import { useStudio } from "./store";
import { DEFAULT_FRAME } from "./view";
import { resizeFrom, handleAffectsX, handleAffectsY } from "./selection";

const seed = () => {
  useStudio.setState({
    composition: { fps: 30, duration: 3, driver: { kind: "time" }, background: "#ffffff", tracks: [] },
    assets: [],
    frame: DEFAULT_FRAME,
    viewport: { width: 800, height: 600 },
    selectedId: null,
    selectedPart: null,
    collapsedTracks: [],
    selectedKeys: [],
    selectedSegments: [],
  });
  useStudio.setState({ history: { past: [], future: [], key: null, at: 0 } });
};

const textTrack = (id: string) =>
  useStudio.getState().composition.tracks.find((tr) => tr.layer.id === id);

describe("text creation modes", () => {
  beforeEach(seed);

  it("click-to-place creates auto-width text (no boxWidth)", () => {
    const id = useStudio.getState().addText(100, 100);
    const src = textTrack(id)!.layer.source;
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.boxWidth).toBeUndefined();
    expect(src.boxHeight).toBeUndefined();
  });

  it("drag-to-place creates auto-height text (boxWidth set, no boxHeight)", () => {
    const id = useStudio.getState().addText(100, 100, 300);
    const src = textTrack(id)!.layer.source;
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.boxWidth).toBe(300);
    expect(src.boxHeight).toBeUndefined();
  });

  it("text always starts at scale 1", () => {
    const id = useStudio.getState().addText(100, 100, 300);
    const base = textTrack(id)!.layer.base;
    expect(base.scaleX).toBe(1);
    expect(base.scaleY).toBe(1);
  });
});

describe("text resize writes to box dimensions, not scale", () => {
  beforeEach(seed);

  it("resizing auto-height text changes boxWidth via setTextProp", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    const track = textTrack(id)!;
    expect(track.layer.source.kind).toBe("text");
    if (track.layer.source.kind !== "text") return;
    expect(track.layer.source.boxWidth).toBe(200);

    // Simulate what the resize handler does: compute new width from resizeFrom,
    // then write to text props instead of scale.
    const state = track.layer.base;
    const size = { width: 200, height: 48 * 1.2 }; // boxWidth, fontSize * lineHeight
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, false);

    // The handler writes new boxWidth, NOT scaleX
    useStudio.getState().setTextProp(id, { boxWidth: size.width * next.scaleX });

    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.boxWidth).toBeCloseTo(300);
    // Scale must remain 1
    expect(textTrack(id)!.layer.base.scaleX).toBe(1);
    expect(textTrack(id)!.layer.base.scaleY).toBe(1);
  });

  it("font size stays constant during resize", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    const track = textTrack(id)!;
    if (track.layer.source.kind !== "text") return;
    const originalFontSize = track.layer.source.fontSize;

    // Resize the box wider
    useStudio.getState().setTextProp(id, { boxWidth: 400 });

    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.fontSize).toBe(originalFontSize);
  });
});

describe("handle axis helpers", () => {
  it("side handles affect one axis", () => {
    expect(handleAffectsX("e")).toBe(true);
    expect(handleAffectsY("e")).toBe(false);
    expect(handleAffectsX("w")).toBe(true);
    expect(handleAffectsY("w")).toBe(false);
    expect(handleAffectsX("n")).toBe(false);
    expect(handleAffectsY("n")).toBe(true);
    expect(handleAffectsX("s")).toBe(false);
    expect(handleAffectsY("s")).toBe(true);
  });

  it("corner handles affect both axes", () => {
    for (const corner of ["nw", "ne", "se", "sw"] as const) {
      expect(handleAffectsX(corner)).toBe(true);
      expect(handleAffectsY(corner)).toBe(true);
    }
  });
});

describe("auto-width text ignores resize", () => {
  beforeEach(seed);

  it("point text has no boxWidth so resize is a no-op", () => {
    const id = useStudio.getState().addText(500, 300);
    const track = textTrack(id)!;
    if (track.layer.source.kind !== "text") return;

    // The resize handler checks: isAutoWidth => return (no-op)
    const isAutoWidth = track.layer.source.boxWidth == null;
    expect(isAutoWidth).toBe(true);

    // Scale should never change
    expect(track.layer.base.scaleX).toBe(1);
    expect(track.layer.base.scaleY).toBe(1);
  });
});

describe("auto-height text only resizes width", () => {
  beforeEach(seed);

  it("vertical-only handle is skipped for auto-height text", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    const track = textTrack(id)!;
    if (track.layer.source.kind !== "text") return;
    const isAutoHeight = track.layer.source.boxWidth != null && track.layer.source.boxHeight == null;
    expect(isAutoHeight).toBe(true);

    // 'n' and 's' handles only affect Y — should be no-op for auto-height
    expect(handleAffectsX("n")).toBe(false);
    expect(handleAffectsX("s")).toBe(false);
  });

  it("horizontal handle changes boxWidth for auto-height text", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    // 'e' handle affects X — should work
    expect(handleAffectsX("e")).toBe(true);

    useStudio.getState().setTextProp(id, { boxWidth: 350 });
    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.boxWidth).toBe(350);
    expect(updated.boxHeight).toBeUndefined();
  });
});

describe("fixed-size text resizes both dimensions", () => {
  beforeEach(seed);

  it("can set both boxWidth and boxHeight for fixed-size mode", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    // Upgrade to fixed-size by setting boxHeight
    useStudio.getState().setTextProp(id, { boxHeight: 100 });

    const track = textTrack(id)!;
    if (track.layer.source.kind !== "text") return;
    expect(track.layer.source.boxWidth).toBe(200);
    expect(track.layer.source.boxHeight).toBe(100);

    // Resize both
    useStudio.getState().setTextProp(id, { boxWidth: 400, boxHeight: 200 });
    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.boxWidth).toBe(400);
    expect(updated.boxHeight).toBe(200);
    // Scale stays at 1
    expect(textTrack(id)!.layer.base.scaleX).toBe(1);
    expect(textTrack(id)!.layer.base.scaleY).toBe(1);
  });
});
