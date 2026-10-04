import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStudio } from "./store";
import { DEFAULT_FRAME } from "./view";

vi.mock("../render/images", async (original) => ({
  ...(await original<typeof import("../render/images")>()),
  ensureImage: async () => ({ naturalWidth: 200, naturalHeight: 100 }),
}));

const png = (name: string) => new File(["x"], name, { type: "image/png" });

const state = () => useStudio.getState();

beforeEach(() => {
  useStudio.setState({
    composition: { fps: 30, duration: 3, driver: { kind: "time" }, background: "#ffffff", tracks: [] },
    assets: [],
    frame: DEFAULT_FRAME,
    selectedId: null,
    selectedIds: [],
    selectedPart: null,
    importError: null,
    history: { past: [], future: [], key: null, at: 0 },
  });
});

describe("importing with a drop point", () => {
  it("shelves the file and puts it on the frame, centred on the drop", async () => {
    await state().importImages([png("a.png")], { x: 600, y: 400 });

    const { assets, composition, selectedId } = state();
    expect(assets).toHaveLength(1);
    expect(composition.tracks).toHaveLength(1);
    const { layer } = composition.tracks[0];
    expect(layer.source).toEqual({ kind: "image", value: assets[0].id });
    expect(layer.base).toMatchObject({ x: 600, y: 400 });
    expect(selectedId).toBe(layer.id);
  });

  it("lands the whole element inside the frame when dropped on an edge", async () => {
    await state().importImages([png("a.png")], { x: 0, y: 0 });
    expect(state().composition.tracks[0].layer.base).toMatchObject({ x: 100, y: 50 });
  });

  it("steps several files apart and picks them all", async () => {
    await state().importImages([png("a.png"), png("b.png")], { x: 600, y: 400 });

    const { composition, selectedIds } = state();
    const [a, b] = composition.tracks.map((tr) => tr.layer.base);
    expect(b.x - a.x).toBeGreaterThan(0);
    expect(b.y - a.y).toBeGreaterThan(0);
    expect(selectedIds).toEqual(composition.tracks.map((tr) => tr.layer.id));
  });

  it("is one undo step, taking the asset and the element back together", async () => {
    await state().importImages([png("a.png")], { x: 600, y: 400 });
    expect(state().history.past).toHaveLength(1);

    state().undo();
    expect(state().assets).toHaveLength(0);
    expect(state().composition.tracks).toHaveLength(0);
  });

  it("without a drop point only shelves the file", async () => {
    await state().importImages([png("a.png")]);
    expect(state().assets).toHaveLength(1);
    expect(state().composition.tracks).toHaveLength(0);
  });

  it("places nothing for a file it cannot take", async () => {
    await state().importImages([new File(["x"], "notes.txt", { type: "text/plain" })], {
      x: 600,
      y: 400,
    });
    expect(state().assets).toHaveLength(0);
    expect(state().composition.tracks).toHaveLength(0);
    expect(state().importError).not.toBeNull();
  });
});
