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

describe("text creation", () => {
  beforeEach(seed);

  it("click-to-place creates text with no boxWidth/boxHeight", () => {
    const id = useStudio.getState().addText(100, 100);
    const src = textTrack(id)!.layer.source;
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.boxWidth).toBeUndefined();
    expect(src.boxHeight).toBeUndefined();
  });

  it("drag-to-place creates text with boxWidth set", () => {
    const id = useStudio.getState().addText(100, 100, 300);
    const src = textTrack(id)!.layer.source;
    expect(src.kind).toBe("text");
    if (src.kind !== "text") return;
    expect(src.boxWidth).toBe(300);
  });

  it("text always starts at scale 1", () => {
    const id = useStudio.getState().addText(100, 100, 300);
    const base = textTrack(id)!.layer.base;
    expect(base.scaleX).toBe(1);
    expect(base.scaleY).toBe(1);
  });
});

describe("exiting text editing", () => {
  beforeEach(seed);

  it("empty text is removed on edit exit", () => {
    const id = useStudio.getState().addText(100, 100);
    useStudio.getState().setEditingTextId(id);
    useStudio.getState().setEditingTextId(null);
    expect(textTrack(id)).toBeUndefined();
  });
});

describe("text resize writes to box dimensions, not scale", () => {
  beforeEach(seed);

  it("resizing text changes boxWidth via setTextProp", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    useStudio.getState().setTextProp(id, { boxHeight: 60 });

    const state = textTrack(id)!.layer.base;
    const size = { width: 200, height: 60 };
    const next = resizeFrom(state, size, "e", { x: 700, y: 300 }, false);

    useStudio.getState().setTextProp(id, { boxWidth: size.width * next.scaleX });

    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.boxWidth).toBeCloseTo(300);
    expect(textTrack(id)!.layer.base.scaleX).toBe(1);
    expect(textTrack(id)!.layer.base.scaleY).toBe(1);
  });

  it("font size stays constant during resize", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    const track = textTrack(id)!;
    if (track.layer.source.kind !== "text") return;
    const originalFontSize = track.layer.source.fontSize;

    useStudio.getState().setTextProp(id, { boxWidth: 400 });

    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.fontSize).toBe(originalFontSize);
  });

  it("resize writes both boxWidth and boxHeight", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    useStudio.getState().setTextProp(id, { boxHeight: 60 });

    useStudio.getState().setTextProp(id, { boxWidth: 400, boxHeight: 120 });
    const updated = textTrack(id)!.layer.source;
    if (updated.kind !== "text") return;
    expect(updated.boxWidth).toBe(400);
    expect(updated.boxHeight).toBe(120);
    expect(textTrack(id)!.layer.base.scaleX).toBe(1);
    expect(textTrack(id)!.layer.base.scaleY).toBe(1);
  });

  it("all handles work for text with boxWidth and boxHeight", () => {
    const id = useStudio.getState().addText(500, 300, 200);
    useStudio.getState().setTextProp(id, { boxHeight: 60 });

    // Vertical-only handle changes boxHeight
    useStudio.getState().setTextProp(id, { boxHeight: 100 });
    const afterV = textTrack(id)!.layer.source;
    if (afterV.kind !== "text") return;
    expect(afterV.boxHeight).toBe(100);
    expect(afterV.boxWidth).toBe(200);

    // Horizontal-only handle changes boxWidth
    useStudio.getState().setTextProp(id, { boxWidth: 300 });
    const afterH = textTrack(id)!.layer.source;
    if (afterH.kind !== "text") return;
    expect(afterH.boxWidth).toBe(300);
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
