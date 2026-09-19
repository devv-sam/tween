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
    expandedTracks: [],
    selectedKeys: [],
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
    // One stop, on where the element already is: nothing moves, and no end frame
    // was invented to move towards.
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([200]);
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
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([200]);
    expect(keyframes().y.stops.map((s) => s.v)).toEqual([200]);
  });
});

describe("moving a keyframed element", () => {
  beforeEach(seed);

  const keyframes = () => useStudio.getState().composition.tracks[0].keyframes ?? {};
  /** A three-second element with position keyframes at 0s and 3s. */
  const keyframed = (): string => {
    const id = layer().id;
    useStudio.getState().addKeyframes(id, "position");
    useStudio.getState().setPositionStops(id, {
      x: [{ t: 0, v: 100 }, { t: 1, v: 400 }],
      y: [{ t: 0, v: 100 }, { t: 1, v: 400 }],
    });
    useStudio.getState().sealHistory();
    return id;
  };

  const drag = (id: string, dx: number, dy: number) => {
    const anchor = useStudio.getState().moveAnchor(id)!;
    useStudio.getState().moveLayer(id, anchor, dx, dy);
    useStudio.getState().sealHistory();
  };

  it("writes the keyframe the playhead is on, and leaves the others alone", () => {
    const id = keyframed();
    useStudio.getState().setT(0);
    drag(id, 50, -20);

    expect(keyframes().x.stops.map((s) => s.v)).toEqual([150, 400]);
    expect(keyframes().y.stops.map((s) => s.v)).toEqual([80, 400]);
  });

  it("captures a new keyframe at a time that had none", () => {
    const id = keyframed();
    // Halfway, where the element reads 250 on both axes.
    useStudio.getState().setT(0.5);
    drag(id, 30, 0);

    expect(keyframes().x.stops.map((s) => s.t)).toEqual([0, 0.5, 1]);
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([100, 280, 400]);
    // The axis that did not move still gets the keyframe, holding what it was showing.
    expect(keyframes().y.stops.map((s) => s.v)).toEqual([100, 250, 400]);
  });

  it("leaves one keyframe behind however far the pointer wanders", () => {
    const id = keyframed();
    useStudio.getState().setT(0.5);
    const anchor = useStudio.getState().moveAnchor(id)!;
    for (const dx of [5, 40, 12, -30, 60]) {
      useStudio.getState().moveLayer(id, anchor, dx, 0);
    }
    useStudio.getState().sealHistory();

    expect(keyframes().x.stops).toHaveLength(3);
    expect(keyframes().x.stops[1].v).toBe(310);
  });

  it("stays one undo step, and puts every keyframe back", () => {
    const id = keyframed();
    useStudio.getState().setT(0.5);
    drag(id, 30, 0);

    useStudio.getState().undo();
    expect(keyframes().x.stops.map((s) => s.v)).toEqual([100, 400]);
  });

  it("moves the base of an element that carries no keyframes", () => {
    const id = layer().id;
    drag(id, 50, 50);
    expect(layer().base).toMatchObject({ x: 250, y: 250 });
  });
});

describe("what the timeline has open and picked", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();

  it("opens an element's property rows and closes them again", () => {
    const id = layer().id;
    expect(state().expandedTracks).toEqual([]);
    state().toggleTrackExpanded(id);
    expect(state().expandedTracks).toEqual([id]);
    state().toggleTrackExpanded(id);
    expect(state().expandedTracks).toEqual([]);
  });

  it("picks one keyframe, and unpicks it when it is picked again", () => {
    const id = layer().id;
    state().selectKey(id, "scale:0");
    expect(state().selectedKeys).toEqual(["scale:0"]);
    state().selectKey(id, "scale:1");
    expect(state().selectedKeys).toEqual(["scale:1"]);
    state().selectKey(id, "scale:1");
    expect(state().selectedKeys).toEqual([]);
  });

  it("gathers a bundle when the picks are additive", () => {
    const id = layer().id;
    state().selectKey(id, "scale:0");
    state().selectKey(id, "scale:2", true);
    expect(state().selectedKeys).toEqual(["scale:0", "scale:2"]);
    // Additive on one already in the bundle takes it back out.
    state().selectKey(id, "scale:0", true);
    expect(state().selectedKeys).toEqual(["scale:2"]);
  });

  it("drops the picks when a different element is selected", () => {
    const id = layer().id;
    state().selectKey(id, "scale:0");
    // Selecting the same element again leaves them where they are.
    state().select(id);
    expect(state().selectedKeys).toEqual(["scale:0"]);
    state().select(null);
    expect(state().selectedKeys).toEqual([]);
  });

  // The picks name rows on screen, not anything the document holds.
  it("keeps what is open and picked out of the undo history", () => {
    const id = layer().id;
    state().toggleTrackExpanded(id);
    state().selectKey(id, "scale:0");
    state().setLayerBase(id, { rotation: 45 });
    state().sealHistory();
    state().undo();
    expect(state().expandedTracks).toEqual([id]);
    expect(state().selectedKeys).toEqual(["scale:0"]);
  });
});

describe("a canvas gesture on a keyframed property", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const keyframes = () => state().composition.tracks[0].keyframes ?? {};

  it("writes the keyframe under the playhead, not the base it cannot reach", () => {
    const id = layer().id;
    state().addKeyframes(id, "scale");
    state().setT(0.5);
    state().captureTransform(id, { scaleX: 2, scaleY: 2 });

    // A keyframe at the playhead holding what the gesture landed on.
    expect(keyframes().scale.stops).toEqual([
      { t: 0, v: 1, ease: "linear" },
      { t: 0.5, v: 2, ease: "linear" },
    ]);
    // The base is what the curve overrides, so the gesture leaves it alone.
    expect(layer().base.scaleX).toBe(1);
  });

  it("revalues the keyframe already there rather than stacking a second one", () => {
    const id = layer().id;
    state().addKeyframes(id, "scale");
    state().setT(0.5);
    state().captureTransform(id, { scaleX: 2, scaleY: 2 });
    state().captureTransform(id, { scaleX: 3, scaleY: 3 });
    expect(keyframes().scale.stops.map((st) => st.v)).toEqual([1, 3]);
  });

  it("lands on the axis that is keyed, leaving the one that is not to its base", () => {
    const id = layer().id;
    state().addKeyframes(id, "scaleX");
    state().setT(0.5);
    // A handle drag reports both axes; only width has a curve to write into.
    state().captureTransform(id, { scaleX: 2, scaleY: 1.5 });

    expect(keyframes().scaleX.stops).toEqual([
      { t: 0, v: 1, ease: "linear" },
      { t: 0.5, v: 2, ease: "linear" },
    ]);
    expect(keyframes().scaleY).toBeUndefined();
    expect(layer().base.scaleX).toBe(1);
    expect(layer().base.scaleY).toBe(1.5);
  });

  it("writes the base of a property with no motion of its own", () => {
    const id = layer().id;
    state().addKeyframes(id, "scale");
    state().setT(0.5);
    state().captureTransform(id, { rotation: 30 });
    expect(layer().base.rotation).toBe(30);
    expect(keyframes().rotation).toBeUndefined();
  });

  it("keeps a combined position in lockstep, both axes keyed at one time", () => {
    const id = layer().id;
    state().addKeyframes(id, "position");
    state().setT(0.25);
    state().captureTransform(id, { x: 300, y: 400 });
    expect(keyframes().x.stops.map((st) => st.t)).toEqual([0, 0.25]);
    expect(keyframes().y.stops.map((st) => st.t)).toEqual([0, 0.25]);
    expect(keyframes().x.stops[1].v).toBe(300);
    expect(keyframes().y.stops[1].v).toBe(400);
  });
});

describe("removing the picked keyframes", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const keyframes = () => state().composition.tracks[0].keyframes ?? {};

  /** Scale keyframed at 0, 0.5 and 1 — three to pick from. */
  const keyed = (): string => {
    const id = layer().id;
    state().addKeyframes(id, "scale");
    state().setKeyframeStops(id, "scale", [
      { t: 0, v: 1 },
      { t: 0.5, v: 2 },
      { t: 1, v: 3 },
    ]);
    state().sealHistory();
    return id;
  };

  it("takes out the one that is picked, and nothing else", () => {
    const id = keyed();
    state().selectKey(id, "scale:1");
    state().removeSelectedKeys();
    expect(keyframes().scale.stops.map((st) => st.v)).toEqual([1, 3]);
    expect(state().selectedKeys).toEqual([]);
  });

  it("takes out a whole bundle in one step", () => {
    const id = keyed();
    state().selectKey(id, "scale:0");
    state().selectKey(id, "scale:2", true);
    state().removeSelectedKeys();
    expect(keyframes().scale.stops.map((st) => st.v)).toEqual([2]);
    // One step, whatever it removed: undo puts all three back.
    state().undo();
    expect(keyframes().scale.stops.map((st) => st.v)).toEqual([1, 2, 3]);
  });

  it("stops the property animating when its last keyframe goes", () => {
    const id = keyed();
    state().selectKey(id, "scale:0");
    state().selectKey(id, "scale:1", true);
    state().selectKey(id, "scale:2", true);
    state().selectPart(id, { kind: "keyframes", property: "scale" });
    // Selecting the part kept the picks, since it is the same element.
    expect(state().selectedKeys).toHaveLength(3);
    state().removeSelectedKeys();
    expect(keyframes().scale).toBeUndefined();
    // Nothing left to be focused on.
    expect(state().selectedPart).toBeNull();
  });

  it("takes both axes of a position together", () => {
    const id = layer().id;
    state().addKeyframes(id, "position");
    state().setPositionStops(id, {
      x: [{ t: 0, v: 1 }, { t: 1, v: 2 }],
      y: [{ t: 0, v: 3 }, { t: 1, v: 4 }],
    });
    state().selectKey(id, "position:1");
    state().removeSelectedKeys();
    expect(keyframes().x.stops.map((st) => st.v)).toEqual([1]);
    expect(keyframes().y.stops.map((st) => st.v)).toEqual([3]);
  });

  it("has nothing to do with nothing picked", () => {
    const id = keyed();
    state().select(id);
    state().removeSelectedKeys();
    expect(keyframes().scale.stops).toHaveLength(3);
  });
});

describe("centring an element on the frame", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const centre = () => ({
    x: state().frame.width / 2,
    y: state().frame.height / 2,
  });

  it("puts the element on the vertical centre line without touching the other axis", () => {
    const id = layer().id;
    state().centreLayer(id, "x");
    expect(layer().base.x).toBe(centre().x);
    expect(layer().base.y).toBe(200);
  });

  it("puts the element on the horizontal centre line", () => {
    const id = layer().id;
    state().centreLayer(id, "y");
    expect(layer().base).toMatchObject({ x: 200, y: centre().y });
  });

  it("lands dead centre when both are asked for", () => {
    const id = layer().id;
    state().centreLayer(id, "x");
    state().centreLayer(id, "y");
    expect({ x: layer().base.x, y: layer().base.y }).toEqual(centre());
  });

  it("is one undo step, because it was one click", () => {
    const id = layer().id;
    state().centreLayer(id, "x");
    state().undo();
    expect(layer().base.x).toBe(200);
  });

  it("does nothing at all to an element already on the line", () => {
    const id = layer().id;
    state().centreLayer(id, "x");
    const steps = state().history.past.length;
    state().centreLayer(id, "x");
    expect(state().history.past).toHaveLength(steps);
  });

  it("writes the keyframe under the playhead rather than a base nothing reads", () => {
    const id = layer().id;
    state().addKeyframes(id, "position");
    state().setT(0.5);
    state().centreLayer(id, "x");

    // The curve owns x, so centring lands in it — and leaves the base where it was.
    const stops = state().composition.tracks[0].keyframes!.x.stops;
    expect(stops.find((s) => s.t === 0.5)?.v).toBe(centre().x);
    expect(layer().base.x).toBe(200);
  });

  it("centres where the element reads now, not where its base started", () => {
    const id = layer().id;
    state().addKeyframes(id, "position");
    // Give x somewhere to travel, then centre from half way along it.
    state().setKeyframeStops(id, "x", [
      { t: 0, v: 0, ease: "linear" },
      { t: 1, v: 400, ease: "linear" },
    ]);
    state().setT(0.5);
    state().centreLayer(id, "x");

    const at = state().composition.tracks[0].keyframes!.x.stops.find((s) => s.t === 0.5);
    // Read at 200 mid-curve; centring moved it the rest of the way to the middle.
    expect(at?.v).toBe(centre().x);
  });
});

describe("picking more than one element", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  /** A second and third element, so there is a selection to make. */
  const three = () => {
    state().placeElement(asset.id, { x: 400, y: 200 });
    state().placeElement(asset.id, { x: 600, y: 200 });
    return state().composition.tracks.map((tr) => tr.layer.id);
  };

  it("has no single element to point at once a second one is picked", () => {
    const [a, b] = three();
    state().setSelectedIds([a]);
    expect(state().selectedId).toBe(a);
    // Which is what lets the handles, the keyframe log and the element panel — all
    // of which read `selectedId` — step aside without being told about selections.
    state().setSelectedIds([a, b]);
    expect(state().selectedId).toBeNull();
    expect(state().selectedIds).toEqual([a, b]);
  });

  it("adds with a toggle, and takes back out with the same one", () => {
    const [a, b, c] = three();
    state().setSelectedIds([a]);
    state().toggleSelectedId(b);
    state().toggleSelectedId(c);
    expect(state().selectedIds).toEqual([a, b, c]);
    state().toggleSelectedId(b);
    expect(state().selectedIds).toEqual([a, c]);
  });

  it("comes back to a single element when a toggle leaves one standing", () => {
    const [a, b] = three();
    state().setSelectedIds([a, b]);
    state().toggleSelectedId(b);
    expect(state().selectedId).toBe(a);
  });

  it("drops the picked keyframes when the selection is not the same one element", () => {
    const [a, b] = three();
    state().setSelectedIds([a]);
    state().setSelectedKeys(["position:0"]);
    state().setSelectedIds([a, b]);
    expect(state().selectedKeys).toEqual([]);
  });

  it("forgets what was deleted and keeps what was not", () => {
    const [a, b, c] = three();
    state().setSelectedIds([a, b, c]);
    state().deleteSelected();
    expect(state().composition.tracks).toHaveLength(0);
    expect(state().selectedIds).toEqual([]);
  });
});

describe("moving a whole selection", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const at = (id: string) => {
    const tr = state().composition.tracks.find((t) => t.layer.id === id)!;
    return { x: tr.layer.base.x, y: tr.layer.base.y };
  };
  const two = () => {
    state().placeElement(asset.id, { x: 400, y: 300 });
    const ids = state().composition.tracks.map((tr) => tr.layer.id);
    state().setSelectedIds(ids);
    return ids;
  };

  it("moves everything picked by the same amount", () => {
    const [a, b] = two();
    state().moveSelection(state().selectionAnchors(), 60, -40);
    expect(at(a)).toEqual({ x: 260, y: 160 });
    expect(at(b)).toEqual({ x: 460, y: 260 });
  });

  it("is one step to undo, however many it moved", () => {
    const [a, b] = two();
    const before = [at(a), at(b)];
    state().moveSelection(state().selectionAnchors(), 60, -40);
    state().sealHistory();
    state().undo();
    expect([at(a), at(b)]).toEqual(before);
  });

  it("stops the whole selection when one of them reaches the frame", () => {
    const [a, b] = two();
    // Far enough right that the second element would leave the frame first.
    state().moveSelection(state().selectionAnchors(), 100000, 0);
    const moved = { a: at(a).x - 200, b: at(b).x - 400 };
    // Both travelled the same distance: a selection that deformed at the edge would
    // not be a selection.
    expect(moved.a).toBe(moved.b);
    expect(moved.a).toBeGreaterThan(0);
  });

  it("measures every element from where it started, not from where it has got to", () => {
    const [a] = two();
    const anchors = state().selectionAnchors();
    state().moveSelection(anchors, 10, 0);
    state().moveSelection(anchors, 30, 0);
    // The second call is the whole move so far, not thirty more on top of ten.
    expect(at(a).x).toBe(230);
  });

  it("writes a keyframed element's share into its curve, not a base nothing reads", () => {
    const [a, b] = two();
    state().addKeyframes(a, "position");
    state().setSelectedIds([a, b]);
    state().setT(0.5);
    state().moveSelection(state().selectionAnchors(), 50, 0);

    expect(state().composition.tracks[0].keyframes!.x.stops).toContainEqual(
      expect.objectContaining({ t: 0.5, v: 250 }),
    );
    expect(at(a).x).toBe(200);
    // The one with no motion of its own still moves the ordinary way.
    expect(at(b).x).toBe(450);
  });
});

describe("shifting the opacity of several elements", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const opacities = () => state().composition.tracks.map((tr) => tr.layer.base.opacity);

  const spread = () => {
    state().placeElement(asset.id, { x: 400, y: 300 });
    const ids = state().composition.tracks.map((tr) => tr.layer.id);
    state().setLayerBase(ids[1], { opacity: 0.5 });
    return ids;
  };

  it("moves each one from where it already was", () => {
    const ids = spread();
    state().nudgeOpacity(ids, -0.2);
    expect(opacities()).toEqual([0.8, 0.3]);
  });

  it("holds each one inside its own range without holding the others back", () => {
    const ids = spread();
    state().nudgeOpacity(ids, 0.4);
    // The first was already full and stays there; the second still gets its share.
    expect(opacities()).toEqual([1, 0.9]);
  });

  it("does nothing at all for a shift of nothing", () => {
    const ids = spread();
    const before = opacities();
    state().nudgeOpacity(ids, 0);
    expect(opacities()).toEqual(before);
  });

  it("settles them all on one value when one is typed", () => {
    const ids = spread();
    state().setOpacity(ids, 0.4);
    expect(opacities()).toEqual([0.4, 0.4]);
  });

  it("keeps a typed value inside the range opacity has", () => {
    const ids = spread();
    state().setOpacity(ids, 4);
    expect(opacities()).toEqual([1, 1]);
  });
});

describe("what several elements agree their opacity is", () => {
  beforeEach(seed);

  const state = () => useStudio.getState();
  const two = () => {
    state().placeElement(asset.id, { x: 400, y: 300 });
    return state().composition.tracks.map((tr) => tr.layer.id);
  };

  it("is the value, when they hold the same one", () => {
    expect(state().sharedOpacity(two())).toBe(1);
  });

  it("is nothing at all, when they do not", () => {
    const ids = two();
    state().setLayerBase(ids[1], { opacity: 0.5 });
    expect(state().sharedOpacity(ids)).toBeNull();
  });

  it("is the one element's own value, for a selection of one", () => {
    const ids = two();
    state().setLayerBase(ids[1], { opacity: 0.25 });
    expect(state().sharedOpacity([ids[1]])).toBe(0.25);
  });

  it("has nothing to report about nothing", () => {
    two();
    expect(state().sharedOpacity([])).toBeNull();
  });

  it("counts values that show the same as the same", () => {
    const ids = two();
    // Two thousandths apart is one number once the field has rounded it.
    state().setLayerBase(ids[0], { opacity: 0.5001 });
    state().setLayerBase(ids[1], { opacity: 0.4999 });
    expect(state().sharedOpacity(ids)).toBe(0.5);
  });

  it("reads where the elements are now, not where their base transforms started", () => {
    const ids = two();
    state().addKeyframes(ids[0], "opacity");
    state().setKeyframeStops(ids[0], "opacity", [
      { t: 0, v: 1, ease: "linear" },
      { t: 1, v: 0, ease: "linear" },
    ]);
    state().setT(0.5);
    // Half way down its own fade, so it no longer agrees with the one holding still.
    expect(state().sharedOpacity(ids)).toBeNull();
    expect(state().sharedOpacity([ids[0]])).toBe(0.5);
  });
});
