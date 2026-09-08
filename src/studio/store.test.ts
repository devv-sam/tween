import { beforeEach, describe, expect, it } from "vitest";
import { useStudio, type ImageAsset } from "./store";
import { DEFAULT_FRAME } from "./view";

const asset: ImageAsset = {
  id: "asset-1",
  kind: "image",
  src: "blob:test",
  name: "square.png",
  naturalW: 100,
  naturalH: 100,
};

/** A studio with one asset placed, and nothing recorded — the state each case starts
 *  from, so a step counted here is a step the case took. */
const seed = () => {
  useStudio.setState({
    composition: { fps: 30, duration: 3, driver: { kind: "time" }, background: "#ffffff", tracks: [] },
    assets: [asset],
    frame: DEFAULT_FRAME,
    viewport: { width: 800, height: 600 },
    selectedId: null,
    selectedPart: null,
  });
  useStudio.getState().placeElement(asset.id, { x: 200, y: 200 });
  useStudio.setState({ history: { past: [], future: [], key: null, at: 0 } });
  return useStudio.getState().selectedId!;
};

const layer = () => useStudio.getState().composition.tracks[0].layer;

describe("undo and redo", () => {
  beforeEach(seed);

  it("puts back what an edit replaced, and the selection with it", () => {
    const id = layer().id;
    useStudio.getState().select(null);
    useStudio.getState().setLayerBase(id, { rotation: 45 });

    useStudio.getState().undo();
    expect(layer().base.rotation).toBe(0);
    // The edit was made with nothing selected, and undo says so again.
    expect(useStudio.getState().selectedId).toBeNull();

    useStudio.getState().redo();
    expect(layer().base.rotation).toBe(45);
  });

  it("counts a whole drag as one step", () => {
    const id = layer().id;
    const anchor = useStudio.getState().moveAnchor(id)!;
    for (let dx = 1; dx <= 20; dx++) useStudio.getState().moveLayer(id, anchor, dx, 0);
    useStudio.getState().sealHistory();

    useStudio.getState().undo();
    expect(layer().base.x).toBe(200);
    expect(useStudio.getState().history.past).toHaveLength(0);
  });

  it("starts a new step once an interaction has ended", () => {
    const id = layer().id;
    const first = useStudio.getState().moveAnchor(id)!;
    useStudio.getState().moveLayer(id, first, 10, 0);
    useStudio.getState().sealHistory();
    const second = useStudio.getState().moveAnchor(id)!;
    useStudio.getState().moveLayer(id, second, 5, 0);
    useStudio.getState().sealHistory();

    useStudio.getState().undo();
    expect(layer().base.x).toBe(210);
    useStudio.getState().undo();
    expect(layer().base.x).toBe(200);
  });

  it("brings a deleted element back", () => {
    useStudio.getState().select(layer().id);
    useStudio.getState().deleteSelected();
    expect(useStudio.getState().composition.tracks).toHaveLength(0);

    useStudio.getState().undo();
    expect(useStudio.getState().composition.tracks).toHaveLength(1);
    expect(useStudio.getState().selectedId).toBe(layer().id);
  });

  it("leaves the playhead and the view where they are", () => {
    const id = layer().id;
    useStudio.getState().setLayerBase(id, { opacity: 0.5 });
    useStudio.getState().setT(0.5);
    useStudio.getState().zoomAroundPoint({ x: 400, y: 300 }, 2);
    const zoom = useStudio.getState().view.zoom;

    useStudio.getState().undo();
    expect(layer().base.opacity).toBe(1);
    expect(useStudio.getState().t).toBe(0.5);
    expect(useStudio.getState().view.zoom).toBe(zoom);
  });

  it("does nothing at the ends of the stack", () => {
    const before = useStudio.getState().composition;
    useStudio.getState().undo();
    useStudio.getState().redo();
    expect(useStudio.getState().composition).toBe(before);
  });

  it("drops the redo branch once a new edit lands", () => {
    const id = layer().id;
    useStudio.getState().setLayerBase(id, { rotation: 45 });
    useStudio.getState().undo();
    useStudio.getState().sealHistory();
    useStudio.getState().setLayerBase(id, { opacity: 0.2 });
    useStudio.getState().redo();
    expect(layer().base.rotation).toBe(0);
    expect(layer().base.opacity).toBe(0.2);
  });

  it("refits the frame when a resolution change is undone", () => {
    useStudio.getState().setResolution({ width: 400, height: 400 });
    const scaled = useStudio.getState().view.scale;
    useStudio.getState().undo();
    expect(useStudio.getState().frame).toEqual(DEFAULT_FRAME);
    expect(useStudio.getState().view.scale).not.toBe(scaled);
  });
});
