import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SceneItem, Transform } from "../core/types";
import { renderState } from "../core/renderState";
import { ensureImage, getCachedImage } from "../render/images";
import { GHOST_BTN, LockIcon, LockOpenIcon } from "./fields";
import { MODULE_DRAG } from "./ModuleShelf";
import { alignmentFor, type Alignment, type Box } from "./guides";
import {
  angleAt,
  boxCentre,
  mustStayUniform,
  resizeFactors,
  snapSwing,
  unionBox,
  type Box as GroupBox,
} from "./group";
import { paintComposition } from "../render/paint";
import {
  PROXY_SIZE,
  benchComposition,
  useStudio,
  type MoveAnchor,
  type SelectionStart,
} from "./store";
import {
  CORNERS,
  HANDLES,
  HANDLE_CURSOR,
  HANDLE_SIZE,
  LOCK_OFFSET,
  angleTo,
  boundsHalf,
  boxSize,
  clampToFrame,
  containsPoint,
  cornerPoints,
  gripAtScreen,
  handlePositions,
  hitTest,
  normalizeAngle,
  regionAngle,
  resizeFrom,
  ROTATE_SNAP,
  rotateCursor,
  rotateFrom,
  withinLock,
  type Handle,
} from "./selection";
import {
  compositionToScreen,
  contentScale,
  frameOrigin,
  frameSize,
  screenToComposition,
  type Point,
  type Size,
} from "./view";

/** An in-flight move, resize, or rotate. `handle` is set only when resizing. */
type Drag = {
  id: string;
  pointerId: number;
  mode: "move" | "resize" | "rotate";
  handle: Handle | null;
  startBase: Transform;
  startRendered: Transform;
  /** Where the element's position was held when the drag began — a module's stops
   *  when one owns the axis, `base` otherwise. */
  anchor: MoveAnchor | null;
  size: Size;
  from: Point;
  /** Pointer angle about the element's centre when a rotate drag began. */
  startAngle: number;
  /** Cursor orientation for the region grabbed, carried so it turns with the element. */
  cursorAngle: number;
  lockAspect: boolean;
  /**
   * Every picked element's starting hold, when the drag began on one of several.
   * Null for a plain single-element move, which keeps its own anchor above.
   */
  selection: { id: string; anchor: MoveAnchor }[] | null;
};

/**
 * A rectangle being drawn over empty canvas to gather up what it touches. Screen
 * space, because that is where it is drawn and where the pointer is.
 */
type Marquee = { pointerId: number; from: Point; to: Point };

/**
 * A resize or turn of the whole selection, in flight.
 *
 * The box it started from is held here rather than recomputed, so the gesture
 * measures against where things were when it began. `spin` is what the overlay is
 * turned by while a rotation is under way — the box has no orientation of its own
 * once the pointer is up, being only the union of what is picked.
 */
type GroupDrag = {
  pointerId: number;
  mode: "resize" | "rotate";
  handle: Handle | null;
  box: GroupBox;
  starts: SelectionStart[];
  uniform: boolean;
  startAngle: number;
  spin: number;
};

/** Axis-aligned bounds of an element on the frame, at the playhead. */
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const boundsOf = (state: Transform, size: Size): Bounds => {
  const half = boundsHalf(state, size);
  return {
    minX: state.x - half.x,
    minY: state.y - half.y,
    maxX: state.x + half.x,
    maxY: state.y + half.y,
  };
};

const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

const centreOf = (state: Transform): Point => ({ x: state.x, y: state.y });

/**
 * How close, in screen px, a line has to come before the drag snaps to it. Screen
 * rather than composition px so the pull feels the same at any zoom — six pixels
 * under the pointer is six pixels of forgiveness whatever the ruler says.
 */
const SNAP = 6;

/**
 * How far past the snap band a near miss is still worth measuring. Inside `SNAP` the
 * guide is drawn and taken; between the two the element is deliberately off the line,
 * so the distance is reported instead and nothing is drawn.
 */
const MEASURE_REACH = 28;

const NUDGE = 1;
const NUDGE_COARSE = 10;
const BADGE_GAP = 10;

export function StudioCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const composition = useStudio((s) => s.composition);
  const moduleLibrary = useStudio((s) => s.moduleLibrary);
  const bench = useStudio((s) => s.bench);
  const pendingAttach = useStudio((s) => s.pendingAttach);
  const assets = useStudio((s) => s.assets);
  const frame = useStudio((s) => s.frame);
  const t = useStudio((s) => s.t);
  const viewport = useStudio((s) => s.viewport);
  const view = useStudio((s) => s.view);
  const selectedId = useStudio((s) => s.selectedId);
  const selectedIds = useStudio((s) => s.selectedIds);
  const dpr = useDevicePixelRatio();
  const [imagesReady, setImagesReady] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  // The lock only shows while the pointer is on the element, so idle chrome stays quiet.
  const [hovering, setHovering] = useState(false);
  // While rotating, the badge reports the angle instead of the box size.
  const [rotating, setRotating] = useState(false);
  // What the element in flight has lined up with. Chrome only — it is drawn over the
  // render, never into it, and it is dropped the moment the pointer comes up.
  const [alignment, setAlignment] = useState<Alignment | null>(null);
  // The rectangle being dragged over empty canvas, while it is being dragged.
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // A group resize or turn in flight. Held in state, not a ref, because the overlay
  // turns with it.
  const [groupDrag, setGroupDrag] = useState<GroupDrag | null>(null);

  const origin = frameOrigin(viewport, frame, view);
  const size = frameSize(frame, view.scale);
  const scale = contentScale(view);

  /**
   * What the frame is showing. The bench borrows it: a module is written against its
   * proxy, and the composition underneath is not what is being worked on.
   */
  const painted = useMemo(
    () => (bench ? benchComposition(bench, composition, frame) : composition),
    [bench, composition, frame],
  );

  /** Evaluated scene, for hit testing and selection chrome. Painting evaluates its own. */
  const scene = useMemo(
    () => renderState(painted, t, moduleLibrary),
    [painted, t, moduleLibrary],
  );

  const sizeOf = useMemo(() => {
    const byId = new Map(
      assets.map((a) => [a.id, { width: a.naturalW, height: a.naturalH }]),
    );
    return (item: SceneItem): Size | undefined =>
      item.source.kind === "image" ? byId.get(item.source.value) : undefined;
  }, [assets]);

  /**
   * The box around everything picked, when more than one thing is.
   *
   * It is the union of what is picked and nothing more — the selection is not a thing
   * the composition holds, so there is no orientation to remember between gestures.
   * While one is being turned the box turns with it, and on release it goes back to
   * being the plain union of wherever everything ended up.
   */
  const group = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const boxes: GroupBox[] = [];
    const states: Transform[] = [];
    for (const id of selectedIds) {
      const item = scene.find((it) => it.id === id);
      const size = item && sizeOf(item);
      if (!item || !size) continue;
      const b = boundsOf(item.state, size);
      boxes.push({ minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY });
      states.push(item.state);
    }
    /**
     * What is drawn is the union of what is picked, including while it is being
     * stretched — the box has to follow the elements, or a resize leaves the handles
     * behind the thing they are resizing.
     *
     * A turn is the exception. The elements keep their upright bounds as they swing,
     * so their union would swell and shrink around them rather than turning; there
     * the box holds the shape it started as and turns with the pointer instead.
     *
     * Neither is what the gesture measures against. That is `groupDrag.box`, taken
     * once at the start, so the drag cannot compound against its own result.
     */
    const box = groupDrag?.mode === "rotate" ? groupDrag.box : unionBox(boxes);
    if (!box) return null;
    const centre = boxCentre(box);
    return {
      box,
      /**
       * The box as a transform and a size, so the same grip and handle helpers a
       * single element uses can answer for it.
       */
      state: {
        x: centre.x,
        y: centre.y,
        scaleX: 1,
        scaleY: 1,
        rotation: groupDrag?.spin ?? 0,
        opacity: 1,
      } as Transform,
      size: { width: box.maxX - box.minX, height: box.maxY - box.minY },
      // A turn anywhere in the selection is a shape this model cannot hold out of
      // square, so the whole group stays square. See `mustStayUniform`.
      uniform: mustStayUniform(states),
      /** Each picked element's own outline, so a large box still says what is in it. */
      outlines: boxes.map((b) => {
        const a = compositionToScreen({ x: b.minX, y: b.minY }, viewport, frame, view);
        const c = compositionToScreen({ x: b.maxX, y: b.maxY }, viewport, frame, view);
        return { x: a.x, y: a.y, width: c.x - a.x, height: c.y - a.y };
      }),
    };
  }, [selectedIds, scene, sizeOf, viewport, frame, view, groupDrag]);

  /** The group's outline and handles in screen space, drawn like a single element's. */
  const groupChrome = useMemo(() => {
    if (!group) return null;
    const toScreen = (p: Point) => compositionToScreen(p, viewport, frame, view);
    const at = handlePositions(group.state, group.size);
    const handles = {} as Record<Handle, Point>;
    for (const k of HANDLES) handles[k] = toScreen(at[k]);
    return {
      outline: cornerPoints(group.state, group.size).map(toScreen),
      handles,
      rotation: group.state.rotation,
    };
  }, [group, viewport, frame, view]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const item = scene.find((it) => it.id === selectedId);
    if (!item) return null;
    const intrinsic = sizeOf(item);
    if (!intrinsic) return null;
    const track = composition.tracks.find((tr) => tr.layer.id === selectedId);
    return {
      item,
      size: intrinsic,
      lockAspect: Boolean(track?.layer.lockAspect),
    };
  }, [scene, selectedId, sizeOf, composition]);

  /**
   * Every other element on the frame, as a box to line up against.
   *
   * Measured from `scene`, which is the composition evaluated at the playhead — so an
   * element part-way through its own animation offers the edges it has right now, not
   * the ones its base transform started from. Alignment during motion authoring means
   * what it looks like it means.
   */
  const alignTargets = (movingId: string): Box[] => {
    const out: Box[] = [];
    for (const item of scene) {
      if (item.id === movingId) continue;
      const itemSize = sizeOf(item);
      if (!itemSize) continue;
      out.push({
        id: item.id,
        centre: { x: item.state.x, y: item.state.y },
        half: boundsHalf(item.state, itemSize),
      });
    }
    return out;
  };

  useEffect(() => setHovering(false), [selectedId]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      useStudio.getState().setViewport({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const { view: v, zoomAroundPoint } = useStudio.getState();
      const delta =
        e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);
      zoomAroundPoint(screen, v.zoom * Math.exp(-delta * 0.0018));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const mapPoint = (e: DragEvent) => {
      const rect = el.getBoundingClientRect();
      const { viewport: vp, frame: fr, view: v } = useStudio.getState();
      return screenToComposition(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        vp,
        fr,
        v,
      );
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (e: DragEvent) => {
      const { importImages, placeElement } = useStudio.getState();
      const moduleId = e.dataTransfer?.getData(MODULE_DRAG);
      const assetId = e.dataTransfer?.getData("application/x-tween-asset");
      const files = e.dataTransfer?.files;
      if (!moduleId && !assetId && !files?.length) return;
      e.preventDefault();
      const at = mapPoint(e);
      if (moduleId) {
        const layerId = pickRef.current(at);
        if (layerId) useStudio.getState().dropModule(layerId, moduleId);
        return;
      }
      if (assetId) {
        placeElement(assetId, at);
        return;
      }
      if (files?.length) void importImages(files);
    };

    el.addEventListener("dragover", onDragOver, true);
    el.addEventListener("drop", onDrop, true);
    return () => {
      el.removeEventListener("dragover", onDragOver, true);
      el.removeEventListener("drop", onDrop, true);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const editing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // ⌘Z / ⌘⇧Z, with ctrl+y for the Windows hand. It works from a field too: every
      // keystroke there is already in the composition, so the studio's own undo is
      // the one that can take the edit back — the field just has to let go first.
      const key = e.key.toLowerCase();
      const undoing = (e.metaKey || e.ctrlKey) && key === "z";
      const redoing = (e.ctrlKey && !e.metaKey && key === "y") || (undoing && e.shiftKey);
      if (undoing || redoing) {
        e.preventDefault();
        if (editing) (e.target as HTMLElement).blur();
        const { undo, redo } = useStudio.getState();
        if (redoing) redo();
        else undo();
        return;
      }
      if (editing) return;

      const {
        viewport: vp,
        view: v,
        // Commands act on the whole selection, so they ask what is picked rather
        // than asking for *the* picked element — which is null on purpose the moment
        // there is more than one, and would switch these off just when they are
        // wanted most.
        selectedIds: picked,
        resetZoom,
        zoomAroundPoint,
        select,
        nudgeSelected,
        deleteSelected,
        selectedKeys,
        selectedPart,
        removeSelectedKeys,
        removeSelectedPart,
      } = useStudio.getState();
      const center = { x: vp.width / 2, y: vp.height / 2 };

      if (e.key === "Escape") {
        if (picked.length > 0) select(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Narrowest first: a keyframe, then its property, and only then the element.
        if (selectedKeys.length > 0) {
          e.preventDefault();
          removeSelectedKeys();
          return;
        }
        if (selectedPart) {
          e.preventDefault();
          removeSelectedPart();
          return;
        }
        if (picked.length > 0) {
          e.preventDefault();
          deleteSelected();
          return;
        }
      }
      if (picked.length > 0 && e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? NUDGE_COARSE : NUDGE;
        const by =
          e.key === "ArrowLeft"
            ? { x: -step, y: 0 }
            : e.key === "ArrowRight"
              ? { x: step, y: 0 }
              : e.key === "ArrowUp"
                ? { x: 0, y: -step }
                : { x: 0, y: step };
        e.preventDefault();
        nudgeSelected(by.x, by.y);
        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomAroundPoint(center, v.zoom * 1.15);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomAroundPoint(center, v.zoom / 1.15);
      }
    };
    // A held arrow key is one nudge; releasing it ends that nudge, so the next run
    // starts its own undo step.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) useStudio.getState().sealHistory();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    for (const asset of assets) {
      if (getCachedImage(asset.id)) continue;
      void ensureImage(asset.id, asset.src).then(() => {
        if (!cancelled) setImagesReady((n) => n + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [assets]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width < 1 || viewport.height < 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bw = Math.max(1, Math.round(viewport.width * dpr));
    const bh = Math.max(1, Math.round(viewport.height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(
      dpr * scale,
      0,
      0,
      dpr * scale,
      (origin.x + view.panX) * dpr,
      (origin.y + view.panY) * dpr,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, frame.width, frame.height);
    ctx.clip();
    paintComposition(ctx, painted, t, frame.width, frame.height, moduleLibrary, (id) => {
      const img = getCachedImage(id);
      if (!img || img.naturalWidth < 1) return undefined;
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
    });
    ctx.restore();
  }, [
    painted,
    assets,
    t,
    frame,
    view,
    viewport,
    dpr,
    origin.x,
    origin.y,
    scale,
    imagesReady,
  ]);

  /** The listener below is attached once; this keeps it looking at the scene as it
   *  is now rather than the one it closed over. */
  const pickRef = useRef<(p: Point) => string | null>(() => null);
  pickRef.current = (p) => hitTest(scene, sizeOf, p);

  const screenAt = (e: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const baseOf = (id: string): Transform | undefined =>
    useStudio.getState().composition.tracks.find((tr) => tr.layer.id === id)
      ?.layer.base;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const screen = screenAt(e);
    const point = screenToComposition(screen, viewport, frame, view);
    const begin = (
      item: SceneItem,
      itemSize: Size,
      mode: Drag["mode"],
      handle: Handle | null,
      near: Handle | null = null,
    ) => {
      const base = baseOf(item.id);
      if (!base) return false;
      const track = useStudio
        .getState()
        .composition.tracks.find((tr) => tr.layer.id === item.id);
      dragRef.current = {
        id: item.id,
        pointerId: e.pointerId,
        mode,
        handle,
        startBase: { ...base },
        startRendered: { ...item.state },
        anchor: useStudio.getState().moveAnchor(item.id),
        size: itemSize,
        from: point,
        startAngle: angleTo(centreOf(item.state), point),
        cursorAngle: near ? regionAngle(item.state, itemSize, near) : 0,
        lockAspect: Boolean(track?.layer.lockAspect),
        // Several picked means the drag moves all of them, each from its own hold.
        selection:
          mode === "move" && useStudio.getState().selectedIds.length > 1
            ? useStudio.getState().selectionAnchors()
            : null,
      };
      // Capture keeps the drag alive past the viewport edge. If the pointer is
      // already gone the drag would strand, so drop it rather than leave it stuck.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        dragRef.current = null;
        return false;
      }
      return true;
    };

    // A group's handles are reached for before anything under them: they sit outside
    // the elements they belong to, and whatever they overlap is not what is grabbed.
    if (group) {
      const grip = gripAtScreen(group.state, group.size, screen, viewport, frame, view);
      if (grip) {
        const starts = useStudio.getState().selectionStarts();
        if (starts.length > 0) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            return;
          }
          setCursor(
            grip.kind === "resize"
              ? HANDLE_CURSOR[grip.handle]
              : rotateCursor(regionAngle(group.state, group.size, grip.near)),
          );
          setGroupDrag({
            pointerId: e.pointerId,
            mode: grip.kind,
            handle: grip.kind === "resize" ? grip.handle : null,
            box: group.box,
            starts,
            uniform: group.uniform,
            startAngle: angleAt(boxCentre(group.box), point),
            spin: 0,
          });
          return;
        }
      }
    }

    if (selected) {
      const grip = gripAtScreen(
        selected.item.state,
        selected.size,
        screen,
        viewport,
        frame,
        view,
      );
      if (grip) {
        setHovering(true);
        if (grip.kind === "resize") {
          setCursor(HANDLE_CURSOR[grip.handle]);
          if (begin(selected.item, selected.size, "resize", grip.handle)) return;
        } else {
          setCursor(
            rotateCursor(regionAngle(selected.item.state, selected.size, grip.near)),
          );
          if (begin(selected.item, selected.size, "rotate", null, grip.near)) {
            setRotating(true);
            return;
          }
        }
      }
    }

    const store = useStudio.getState();
    const picked = store.selectedIds;
    const id = hitTest(scene, sizeOf, point);

    // Nothing under the pointer: this is a rectangle being drawn, not a move. The
    // selection is left alone until the release says what the rectangle caught — a
    // plain click ends up catching nothing, which clears it.
    if (!id) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        return;
      }
      setMarquee({ pointerId: e.pointerId, from: screen, to: screen });
      return;
    }

    if (e.shiftKey) {
      // Shift adds, or takes back out. Either way nothing is dragged: the gesture was
      // about the selection, not about moving what is in it.
      store.toggleSelectedId(id);
      return;
    }
    // An element already in the selection keeps the selection — otherwise starting to
    // drag three things would throw two of them away before the drag began.
    if (!picked.includes(id)) store.setSelectedIds([id]);

    const item = scene.find((it) => it.id === id);
    const itemSize = item && sizeOf(item);
    if (!item || !itemSize) return;
    setCursor("move");
    setHovering(true);
    begin(item, itemSize, "move", null);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const screen = screenAt(e);
    const drag = dragRef.current;

    if (marquee && marquee.pointerId === e.pointerId) {
      setMarquee({ ...marquee, to: screen });
      return;
    }

    if (groupDrag && groupDrag.pointerId === e.pointerId) {
      const point = screenToComposition(screen, viewport, frame, view);
      const store = useStudio.getState();
      if (groupDrag.mode === "resize" && groupDrag.handle) {
        // Shift flips the lock, the usual canvas convention — except where the
        // selection has no choice, and there it is held square either way.
        const uniform = groupDrag.uniform || e.shiftKey;
        const { about, fx, fy } = resizeFactors(
          groupDrag.box,
          groupDrag.handle,
          point,
          uniform,
        );
        store.transformSelection(groupDrag.starts, { kind: "scale", about, fx, fy });
      } else {
        const pivot = boxCentre(groupDrag.box);
        const deg = snapSwing(
          angleAt(pivot, point) - groupDrag.startAngle,
          ROTATE_SNAP,
          e.shiftKey,
        );
        store.transformSelection(groupDrag.starts, { kind: "rotate", about: pivot, deg });
        setGroupDrag({ ...groupDrag, spin: deg });
      }
      return;
    }

    if (!drag) {
      if (!selected) {
        setCursor(null);
        setHovering(false);
        return;
      }
      const grip = gripAtScreen(
        selected.item.state,
        selected.size,
        screen,
        viewport,
        frame,
        view,
      );
      if (grip) {
        setCursor(
          grip.kind === "resize"
            ? HANDLE_CURSOR[grip.handle]
            : rotateCursor(
                regionAngle(selected.item.state, selected.size, grip.near),
              ),
        );
        setHovering(true);
        return;
      }
      const point = screenToComposition(screen, viewport, frame, view);
      const inside = containsPoint(selected.item.state, selected.size, point);
      setCursor(inside ? "move" : null);
      // The lock sits outside the bounds, so its own area counts as hovering too —
      // otherwise it would vanish as the pointer crossed the gap to reach it.
      setHovering(inside || (chrome !== null && withinLock(screen, chrome.lock)));
      return;
    }

    const point = screenToComposition(screen, viewport, frame, view);
    // A gesture on a keyframed property writes the keyframe under the playhead rather
    // than the base it cannot reach — turning or scaling an element at a moment is
    // how that moment gets a keyframe, the same way moving one already works.
    const { captureTransform } = useStudio.getState();

    if (drag.mode === "rotate") {
      const nextRotation = rotateFrom(
        drag.startRendered,
        point,
        drag.startAngle,
        e.shiftKey,
      );
      // Glue the cursor to the region it grabbed as the element turns under it.
      setCursor(
        rotateCursor(
          drag.cursorAngle + (nextRotation - drag.startRendered.rotation),
        ),
      );
      captureTransform(drag.id, {
        rotation:
          drag.startBase.rotation + (nextRotation - drag.startRendered.rotation),
      });
      return;
    }

    if (!drag.handle) {
      const half = boundsHalf(drag.startRendered, drag.size);
      const wanted = {
        x: drag.startRendered.x + (point.x - drag.from.x),
        y: drag.startRendered.y + (point.y - drag.from.y),
      };
      // The bands are given in screen px, so they come back through the zoom before
      // anything is measured in composition space.
      const perPx = scale > 0 ? 1 / scale : 0;
      const found = alignmentFor(
        { id: drag.id, centre: wanted, half },
        alignTargets(drag.id),
        frame,
        SNAP * perPx,
        MEASURE_REACH * perPx,
      );
      setAlignment(found.guides.length || found.measures.length ? found : null);
      // Bound the rendered centre, then apply the result to `base` as a delta — same as
      // resize, so an offset an active module contributed survives the clamp.
      const at = clampToFrame(
        { x: wanted.x + found.delta.x, y: wanted.y + found.delta.y },
        half,
        frame,
      );
      const store = useStudio.getState();
      const dx = at.x - drag.startRendered.x;
      const dy = at.y - drag.startRendered.y;
      // Several picked: the whole selection takes the same step, agreed across all of
      // them so the one nearest an edge decides how far everyone gets to go.
      if (drag.selection) store.moveSelection(drag.selection, dx, dy);
      else if (drag.anchor) store.moveLayer(drag.id, drag.anchor, dx, dy);
      return;
    }

    // Shift flips the lock for the duration of the drag, the usual canvas convention.
    const lock = drag.lockAspect !== e.shiftKey;
    // Handles sit on the rendered box, but the edit lands on `base`. Applying the
    // result as a delta keeps any offset an active module contributed.
    const next = resizeFrom(
      drag.startRendered,
      drag.size,
      drag.handle,
      point,
      lock,
    );
    const rx =
      drag.startRendered.scaleX > 0
        ? next.scaleX / drag.startRendered.scaleX
        : 1;
    const ry =
      drag.startRendered.scaleY > 0
        ? next.scaleY / drag.startRendered.scaleY
        : 1;
    captureTransform(drag.id, {
      x: drag.startBase.x + (next.x - drag.startRendered.x),
      y: drag.startBase.y + (next.y - drag.startRendered.y),
      scaleX: drag.startBase.scaleX * rx,
      scaleY: drag.startBase.scaleY * ry,
    });
  };

  /**
   * Reach into a drawing.
   *
   * A double-click on an SVG takes the part under the pointer off it, as its own
   * element — which is the whole of "going in": there is no mode to be in and nothing
   * to come back out of, because what you get is an ordinary element that everything
   * already knows how to move, key and export. Undo puts it back.
   *
   * Anywhere else the gesture still means what it always did, so double-clicking the
   * empty canvas resets the zoom.
   */
  const onDoubleClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const point = screenToComposition(screenAt(e), viewport, frame, view);
    const id = hitTest(scene, sizeOf, point);
    if (!id) {
      useStudio.getState().resetZoom();
      return;
    }
    void useStudio.getState().detachPart(id, point);
  };

  /**
   * What the rectangle caught: everything it touches, as the elements read at the
   * playhead. Bounds are the ones on the frame right now, so a part-way-through
   * animation is gathered where it looks like it is.
   */
  const closeMarquee = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!marquee || marquee.pointerId !== e.pointerId) return false;
    setMarquee(null);
    if (e.currentTarget.hasPointerCapture(marquee.pointerId)) {
      e.currentTarget.releasePointerCapture(marquee.pointerId);
    }
    const a = screenToComposition(marquee.from, viewport, frame, view);
    const b = screenToComposition(marquee.to, viewport, frame, view);
    const over: Bounds = {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    };
    const caught: string[] = [];
    for (const item of scene) {
      const size = sizeOf(item);
      if (size && overlaps(boundsOf(item.state, size), over)) caught.push(item.id);
    }
    // A rectangle that caught nothing is how you let go of everything — which is also
    // what a plain click on empty canvas is, being a rectangle of no size.
    useStudio.getState().setSelectedIds(caught);
    return true;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (closeMarquee(e)) return;
    if (groupDrag && groupDrag.pointerId === e.pointerId) {
      setGroupDrag(null);
      setCursor(null);
      // The whole gesture was one edit; releasing closes it.
      useStudio.getState().sealHistory();
      if (e.currentTarget.hasPointerCapture(groupDrag.pointerId)) {
        e.currentTarget.releasePointerCapture(groupDrag.pointerId);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setRotating(false);
    setAlignment(null);
    // The whole drag was one edit; releasing closes it.
    useStudio.getState().sealHistory();
    if (e.currentTarget.hasPointerCapture(drag.pointerId)) {
      e.currentTarget.releasePointerCapture(drag.pointerId);
    }
  };

  /** The guides in screen space: a line's own coordinate and the two ends it runs
   *  between, both carried through the same projection the selection box uses. */
  const marks = useMemo(() => {
    if (!alignment) return null;
    const toScreen = (p: Point) => compositionToScreen(p, viewport, frame, view);
    const lines = alignment.guides.map((g) => {
      const a = toScreen(
        g.axis === "x" ? { x: g.at, y: g.from } : { x: g.from, y: g.at },
      );
      const b = toScreen(g.axis === "x" ? { x: g.at, y: g.to } : { x: g.to, y: g.at });
      return { kind: g.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    });
    const labels = alignment.measures.map((m) => ({
      at: toScreen(m.at),
      text: `${Math.round(m.gap)}`,
    }));
    return { lines, labels };
  }, [alignment, viewport, frame, view]);

  const chrome = useMemo(() => {
    if (!selected) return null;
    const toScreen = (p: Point) =>
      compositionToScreen(p, viewport, frame, view);
    const outline = cornerPoints(selected.item.state, selected.size).map(
      toScreen,
    );
    const at = handlePositions(selected.item.state, selected.size);
    const handles = {} as Record<Handle, Point>;
    for (const k of HANDLES) handles[k] = toScreen(at[k]);
    return {
      outline,
      handles,
      lock: {
        x: handles.ne.x + LOCK_OFFSET.x,
        y: handles.ne.y + LOCK_OFFSET.y,
      },
      badge: {
        x: (outline[0].x + outline[1].x + outline[2].x + outline[3].x) / 4,
        y: Math.max(...outline.map((p) => p.y)) + BADGE_GAP,
        size: boxSize(selected.item.state, selected.size),
      },
    };
  }, [selected, viewport, frame, view]);

  return (
    <div
      ref={viewportRef}
      className="studio-viewport"
      aria-label="Studio canvas"
      tabIndex={0}
      style={cursor ? { cursor } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (dragRef.current) return;
        setCursor(null);
        setHovering(false);
      }}
      onDoubleClick={onDoubleClick}
    >
      {viewport.width > 0 ? (
        <div
          className="studio-world"
          style={{
            width: size.width,
            height: size.height,
            transform: `translate(${origin.x}px, ${origin.y}px)`,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: frame.width,
              height: frame.height,
              background: composition.background ?? "#fff",
              transform: `translate(${view.panX}px, ${view.panY}px) scale(${scale})`,
            }}
          >
            <div className="studio-grid" />
          </div>
        </div>
      ) : null}
      <canvas ref={canvasRef} className="studio-render" />
      {/* Says what the square is, so nobody mistakes the bench's stand-in for an
          element they have somehow acquired. */}
      {bench ? (
        <div
          className="pointer-events-none absolute rounded bg-[#111] px-1.5 py-0.5 text-[10px] leading-[1.4] text-white"
          style={{
            transform: `translate(${
              origin.x + view.panX + (frame.width / 2) * scale
            }px, ${
              origin.y + view.panY + (frame.height / 2 + PROXY_SIZE / 2 + 8) * scale
            }px) translateX(-50%)`,
          }}
        >
          proxy
        </div>
      ) : null}
      {pendingAttach ? (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-[#e0e0e0] bg-white px-2.5 py-2 text-[11px] shadow-[0_2px_8px_rgba(0,0,0,.1)]">
          <span className="text-[#555]">replace existing distributor?</span>
          <button
            type="button"
            className={GHOST_BTN}
            onClick={() => useStudio.getState().resolveAttach(true)}
          >
            replace
          </button>
          <button
            type="button"
            className={GHOST_BTN}
            onClick={() => useStudio.getState().resolveAttach(false)}
          >
            keep
          </button>
        </div>
      ) : null}
      {/* Guides live here rather than in the painted frame: they are something the
          author is shown while dragging, not something the composition contains, so
          nothing that renders or exports a frame can ever see them. */}
      {marks ? (
        <>
          <svg
            className="studio-guides"
            width={viewport.width}
            height={viewport.height}
            aria-hidden="true"
          >
            {marks.lines.map((l, i) => (
              <line
                key={i}
                className={`studio-guide${l.kind === "frame" ? " is-frame" : ""}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
              />
            ))}
          </svg>
          {marks.labels.map((l, i) => (
            <div
              key={i}
              className="studio-measure"
              style={{
                transform: `translate(${l.at.x}px, ${l.at.y}px) translate(-50%, -50%)`,
              }}
            >
              {l.text}
            </div>
          ))}
        </>
      ) : null}
      {/* Everything picked, boxed as one, with a handle on each corner. Chrome over
          the render, like the guides — the exporter paints from the composition and
          has never heard of it. */}
      {group && groupChrome ? (
        <svg
          className="studio-selection"
          width={viewport.width}
          height={viewport.height}
          aria-hidden="true"
        >
          {/* What is in the selection, each in its own right. A box reaching across
              the frame says very little about what it caught without them. */}
          {group.outlines.map((o, i) => (
            <rect
              key={i}
              className="studio-group-member"
              x={o.x}
              y={o.y}
              width={o.width}
              height={o.height}
            />
          ))}
          <polygon
            className="studio-selection-outline"
            points={groupChrome.outline.map((p) => `${p.x},${p.y}`).join(" ")}
          />
          {CORNERS.map((k) => {
            const p = groupChrome.handles[k];
            return (
              <rect
                key={k}
                className="studio-handle"
                x={p.x - HANDLE_SIZE / 2}
                y={p.y - HANDLE_SIZE / 2}
                width={HANDLE_SIZE}
                height={HANDLE_SIZE}
                transform={`rotate(${groupChrome.rotation} ${p.x} ${p.y})`}
              />
            );
          })}
        </svg>
      ) : null}
      {/* The rectangle being drawn, while it is being drawn. */}
      {marquee ? (
        <div
          className="pointer-events-none absolute z-[3] border border-[#0d99ff] bg-[#0d99ff]/10"
          aria-hidden="true"
          style={{
            transform: `translate(${Math.min(marquee.from.x, marquee.to.x)}px, ${Math.min(
              marquee.from.y,
              marquee.to.y,
            )}px)`,
            width: Math.abs(marquee.to.x - marquee.from.x),
            height: Math.abs(marquee.to.y - marquee.from.y),
          }}
        />
      ) : null}
      {selected && chrome ? (
        <>
          <svg
            className="studio-selection"
            width={viewport.width}
            height={viewport.height}
            aria-hidden="true"
          >
            <polygon
              className="studio-selection-outline"
              points={chrome.outline.map((p) => `${p.x},${p.y}`).join(" ")}
            />
            {/* Corners only. Sides stay draggable — they just have no drawn handle. */}
            {CORNERS.map((k) => {
              const p = chrome.handles[k];
              return (
                <rect
                  key={k}
                  className="studio-handle"
                  x={p.x - HANDLE_SIZE / 2}
                  y={p.y - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  transform={`rotate(${selected.item.state.rotation} ${p.x} ${p.y})`}
                />
              );
            })}
          </svg>
          {/* Hidden while rotating: pinned to a corner, it would swing around the box. */}
          {hovering && !rotating ? (
          <button
            type="button"
            className={`studio-lock${selected.lockAspect ? " is-locked" : ""}`}
            aria-pressed={selected.lockAspect}
            aria-label={
              selected.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"
            }
            title={
              selected.lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"
            }
            style={{
              transform: `translate(${chrome.lock.x}px, ${chrome.lock.y}px) translate(-50%, -50%)`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() =>
              useStudio.getState().toggleLayerLock(selected.item.id)
            }
          >
            {selected.lockAspect ? <LockIcon /> : <LockOpenIcon />}
          </button>
          ) : null}
          <div
            className="studio-badge"
            style={{
              transform: `translate(${chrome.badge.x}px, ${chrome.badge.y}px) translate(-50%, 0)`,
            }}
          >
            {rotating
              ? `${Math.round(normalizeAngle(selected.item.state.rotation))}°`
              : `${Math.round(chrome.badge.size.width)} × ${Math.round(chrome.badge.size.height)}`}
          </div>
        </>
      ) : null}
    </div>
  );
}

function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  useEffect(() => {
    let mql: MediaQueryList;
    const onChange = () => {
      mql.removeEventListener("change", onChange);
      setDpr(window.devicePixelRatio || 1);
      listen();
    };
    const listen = () => {
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mql.addEventListener("change", onChange);
    };
    listen();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return dpr;
}
