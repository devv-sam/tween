import { beforeEach, describe, expect, it } from "vitest";
import { expand } from "../core/distribute";
import { isLinked } from "../core/library";
import type { LinkedModule, ModuleData } from "../core/types";
import { useStudio, type ImageAsset } from "./store";
import { defaultDistributor } from "./modules";
import { DEFAULT_FRAME } from "./view";

const asset: ImageAsset = {
  id: "asset-1",
  kind: "image",
  src: "blob:test",
  name: "square.png",
  naturalW: 100,
  naturalH: 100,
};

const seed = (): string => {
  useStudio.setState({
    composition: {
      fps: 30,
      duration: 3,
      driver: { kind: "time" },
      background: "#ffffff",
      tracks: [],
    },
    moduleLibrary: [],
    bench: null,
    pendingAttach: null,
    assets: [asset],
    frame: DEFAULT_FRAME,
    viewport: { width: 800, height: 600 },
    selectedId: null,
    selectedPart: null,
    collapsedTracks: [],
    selectedKeys: [],
  });
  useStudio.getState().placeElement(asset.id, { x: 200, y: 200 });
  useStudio.setState({ history: { past: [], future: [], key: null, at: 0 } });
  return useStudio.getState().selectedId!;
};

const modulesOf = (i = 0) => useStudio.getState().composition.tracks[i].modules;
const library = () => useStudio.getState().moduleLibrary;
const raw = (i: number) => modulesOf()[i] as ModuleData;
const link = (i: number) => modulesOf()[i] as LinkedModule;

describe("adding modules to an element", () => {
  beforeEach(seed);

  it("adds one and opens it", () => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    expect(modulesOf()).toHaveLength(1);
    expect(raw(0).type).toBe("keyframes");
    expect(useStudio.getState().selectedPart).toEqual({ kind: "module", index: 0 });
  });

  it("turns a cloner on spread along a path, and off again without a trace", () => {
    const id = seed();
    useStudio.getState().setDistributor(id, defaultDistributor("path"));

    const d = useStudio.getState().composition.tracks[0].layer.distributor;
    expect(d?.type).toBe("path");
    expect(d?.count).toBeGreaterThan(1);
    // Clones land somewhere, rather than piling on the origin for want of a path.
    const xs = expand(useStudio.getState().composition.tracks[0].layer).map((i) => i.base.x);
    expect(new Set(xs).size).toBe(xs.length);

    useStudio.getState().setDistributor(id, null);
    expect(
      "distributor" in useStudio.getState().composition.tracks[0].layer,
    ).toBe(false);
  });
});

describe("saving a stack as a module", () => {
  beforeEach(seed);

  it("bundles the raw entries and links them back", () => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    useStudio.getState().addModule(id, "clonerGraph");
    useStudio.getState().saveStackAsModule(id, "  card fan  ");

    expect(library()).toHaveLength(1);
    expect(library()[0].name).toBe("card fan");
    expect(library()[0].stack.map((md) => md.type)).toEqual(["keyframes", "clonerGraph"]);
    expect(modulesOf()).toHaveLength(1);
    expect(isLinked(modulesOf()[0])).toBe(true);
  });

  it("refuses a nameless one", () => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    useStudio.getState().saveStackAsModule(id, "   ");
    expect(library()).toHaveLength(0);
    expect(modulesOf()).toHaveLength(1);
  });
});

describe("a linked instance", () => {
  const attached = (): string => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    useStudio.getState().saveStackAsModule(id, "scale in");
    return id;
  };

  beforeEach(seed);

  it("writes a param to the element's overrides, not the master", () => {
    const id = attached();
    useStudio.getState().setLinkedOverride(id, 0, 0, { delay: 0.2 });
    expect(link(0).overrides[0]).toEqual({ delay: 0.2 });
    expect(library()[0].stack[0].params.delay).toBe(0);
  });

  it("keeps overrides on the entry they were written for", () => {
    const id = attached();
    useStudio.setState({
      moduleLibrary: library().map((a) => ({
        ...a,
        stack: [...a.stack, { type: "clonerGraph", range: [0, 1], params: { delay: 0 } }],
      })),
    });
    useStudio.getState().setLinkedOverride(id, 0, 1, { delay: 0.5 });
    expect(link(0).overrides[0]).toBeUndefined();
    expect(link(0).overrides[1]).toEqual({ delay: 0.5 });
  });

  it("detaches into the entries it was running", () => {
    const id = attached();
    useStudio.getState().setLinkedOverride(id, 0, 0, { delay: 0.3 });
    useStudio.getState().detachModule(id, 0);
    expect(isLinked(modulesOf()[0])).toBe(false);
    expect(raw(0).params.delay).toBe(0.3);
    // The asset is untouched: detaching is the element leaving, not the module going.
    expect(library()).toHaveLength(1);
  });
});

describe("deleting a module asset", () => {
  beforeEach(seed);

  it("counts the elements that would be cut loose", () => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    useStudio.getState().saveStackAsModule(id, "scale in");
    expect(useStudio.getState().moduleUses(library()[0].id)).toBe(1);
  });

  it("detaches every use before it goes, so nothing points at nothing", () => {
    const id = seed();
    useStudio.getState().addModule(id, "keyframes");
    useStudio.getState().saveStackAsModule(id, "scale in");
    useStudio.getState().deleteModuleAsset(library()[0].id);

    expect(library()).toHaveLength(0);
    expect(modulesOf()).toHaveLength(1);
    expect(isLinked(modulesOf()[0])).toBe(false);
    expect(raw(0).type).toBe("keyframes");
  });
});

describe("the bench", () => {
  beforeEach(seed);

  it("saves a named module and closes", () => {
    const store = useStudio.getState();
    store.openBench();
    store.setBenchName("fan");
    store.addBenchModule("keyframes");
    store.saveBench();

    expect(useStudio.getState().bench).toBeNull();
    expect(library()).toHaveLength(1);
    expect(library()[0].stack).toHaveLength(1);
  });

  it("refuses a nameless one and says so on the field", () => {
    const store = useStudio.getState();
    store.openBench();
    store.addBenchModule("keyframes");
    store.saveBench();

    expect(library()).toHaveLength(0);
    expect(useStudio.getState().bench?.nameMissing).toBe(true);
  });

  it("leaves nothing behind when it closes unsaved", () => {
    const store = useStudio.getState();
    const before = useStudio.getState().composition;
    store.openBench();
    store.setBenchName("fan");
    store.addBenchModule("keyframes");
    store.closeBench();

    expect(useStudio.getState().bench).toBeNull();
    expect(library()).toHaveLength(0);
    expect(useStudio.getState().composition).toBe(before);
  });

  it("edits a master in place rather than making a second one", () => {
    const store = useStudio.getState();
    store.openBench();
    store.setBenchName("fan");
    store.addBenchModule("keyframes");
    store.saveBench();

    const id = library()[0].id;
    useStudio.getState().openBench(id);
    useStudio.getState().setBenchName("big fan");
    useStudio.getState().saveBench();

    expect(library()).toHaveLength(1);
    expect(library()[0].id).toBe(id);
    expect(library()[0].name).toBe("big fan");
  });
});

describe("dropping a module that brings a cloner", () => {
  beforeEach(seed);

  const withCloner = (): string => {
    const store = useStudio.getState();
    store.openBench();
    store.setBenchName("ring");
    store.setBenchDistributor({ type: "radial", count: 6, params: {} });
    store.addBenchModule("keyframes");
    store.saveBench();
    return library()[0].id;
  };

  it("takes the module's cloner when the element has none", () => {
    const id = seed();
    const assetId = withCloner();
    useStudio.getState().dropModule(id, assetId);
    expect(useStudio.getState().pendingAttach).toBeNull();
    expect(useStudio.getState().composition.tracks[0].layer.distributor?.type).toBe("radial");
  });

  it("asks before overwriting one the element already has", () => {
    const id = seed();
    const assetId = withCloner();
    useStudio.getState().setDistributor(id, { type: "grid", count: 4, params: {} });
    useStudio.getState().dropModule(id, assetId);

    expect(useStudio.getState().pendingAttach).toEqual({ assetId, layerId: id });
    expect(modulesOf()).toHaveLength(0);

    useStudio.getState().resolveAttach(false);
    expect(useStudio.getState().composition.tracks[0].layer.distributor?.type).toBe("grid");
    expect(modulesOf()).toHaveLength(1);
  });

  it("replaces it when told to", () => {
    const id = seed();
    const assetId = withCloner();
    useStudio.getState().setDistributor(id, { type: "grid", count: 4, params: {} });
    useStudio.getState().dropModule(id, assetId);
    useStudio.getState().resolveAttach(true);
    expect(useStudio.getState().composition.tracks[0].layer.distributor?.type).toBe("radial");
  });
});
