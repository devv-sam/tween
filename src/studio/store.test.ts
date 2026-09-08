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

describe("position keyframes", () => {
  beforeEach(seed);

  const keyframes = () => useStudio.getState().composition.tracks[0].keyframes ?? {};

  it("keyframes both axes at once, and selects the pair", () => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    expect(Object.keys(keyframes())).toEqual(["x", "y"]);
    expect(useStudio.getState().selectedPart).toEqual({
      kind: "keyframes",
      property: "position",
    });
    // Flat on where the element already is, so nothing moves until a value changes.
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([200, 200]);
  });

  it("removes both axes together", () => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    useStudio.getState().removeKeyframes(id, "position");
    expect(Object.keys(keyframes())).toEqual([]);
  });

  it("moves one window when the block is dragged", () => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    useStudio.getState().setKeyframeRange(id, "position", [0.2, 0.8]);
    expect(keyframes().x.range).toEqual([0.2, 0.8]);
    expect(keyframes().y.range).toEqual([0.2, 0.8]);
  });

  it("splits into two properties and back into one", () => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    useStudio.getState().setSeparatePosition(id, true);
    expect(layer().separatePosition).toBe(true);
    // The selection follows the split rather than going blank.
    expect(useStudio.getState().selectedPart).toEqual({
      kind: "keyframes",
      property: "x",
    });

    // A time authored on y alone survives the trip back.
    useStudio.getState().setKeyframeStops(id, "y", [
      { t: 0, v: 0 },
      { t: 0.5, v: 100 },
      { t: 1, v: 0 },
    ]);
    useStudio.getState().setSeparatePosition(id, false);
    expect(layer().separatePosition).toBe(false);
    expect(keyframes().x.stops.map((s) => s.t)).toEqual([0, 0.5, 1]);
    expect(keyframes().y.stops.map((s) => s.v)).toEqual([0, 100, 0]);
    // x had no keyframe at 0.5, so it takes the value it was already showing there.
    expect(keyframes().x.stops[1].v).toBe(200);
  });

  it("does not invent keyframes when an element without any is recombined", () => {
    const id = layer().id;
    useStudio.getState().setSeparatePosition(id, true);
    useStudio.getState().setSeparatePosition(id, false);
    expect(Object.keys(keyframes())).toEqual([]);
  });

  it("writes both axes as one undo step", () => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    useStudio.getState().setPositionStops(id, {
      x: [{ t: 0, v: 1 }, { t: 1, v: 2 }],
      y: [{ t: 0, v: 3 }, { t: 1, v: 4 }],
    });
    useStudio.getState().sealHistory();
    useStudio.getState().undo();
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([200, 200]);
    expect(keyframes().y.stops.map((s) => s.v)).toEqual([200, 200]);
  });
});
