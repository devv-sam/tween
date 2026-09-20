import type { Stop } from "./curve";

export interface Transform {
  x: number; y: number; scaleX: number; scaleY: number; rotation: number; opacity: number;
}

export type Blend = "set" | "add" | "mul";
/** `scale` is virtual — it drives both axes at once. See `apply` in blend.ts. */
export type Prop = "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotation" | "opacity";

export interface EvalCtx {
  t: number; localT: number; u: number; i: number; count: number;
  field: (id: string, x: number, y: number) => number;
}

export interface EmitCtx { targetId: string; }

// Serializable module data stored in the composition
export interface ModuleData {
  type: string;
  range: [number, number];          // when it's active on the timeline
  params: Record<string, unknown>;
}

/**
 * One use of a saved module on an element. The behaviour itself lives in the
 * library; what the element owns is the reference and whatever it has said
 * differently about it.
 *
 * Overrides are keyed by the entry's index in the asset's stack, so a two-entry
 * module can carry a delay on one half and nothing on the other. Keying them by
 * anything coarser reads the same until the first stack with two of the same type
 * in it, and then quietly stops.
 */
export interface LinkedModule {
  kind: "linked";
  ref: string;
  overrides: Record<number, Record<string, unknown>>;
}

/** What an element carries on its stack: behaviour it owns, or behaviour it borrows. */
export type ElementModule = ModuleData | LinkedModule;

/**
 * A named behaviour, kept apart from any element that runs it. It holds a stack and
 * optionally the distributor the stack was written for — never an element, never an
 * image, nothing about how the thing it drives looks.
 */
export interface ModuleAsset {
  id: string;
  name: string;
  distributor?: Distributor;
  stack: ModuleData[];
  createdAt: number;
}

// Runtime implementation resolved from the registry by type
export interface ModuleImpl {
  evaluate(state: Transform, ctx: EvalCtx, params: Record<string, unknown>): Transform;
  emit(ctx: EmitCtx, params: Record<string, unknown>): string;
}

export type FieldMotion =
  | { kind: "static"; x: number; y: number }
  | { kind: "sweepX"; y: number; from: number; to: number }
  | { kind: "alongPath"; points: { x: number; y: number }[] };

export interface FieldDef { id: string; radius: number; falloff: number; motion: FieldMotion; }

export type DistributorType = "none" | "path" | "grid" | "radial";

export interface Distributor {
  type: DistributorType;
  count: number;
  params?: Record<string, unknown>;
}

export type LayerSource = { kind: "image" | "text" | "shape"; value: string };

export interface Layer {
  id: string;
  /** What the studio calls this element. Falls back to the asset's filename. */
  name?: string;
  source: LayerSource;
  base: Transform;
  /** Constrain width and height to their current ratio while resizing. Off by default. */
  lockAspect?: boolean;
  /** Animate x and y apart. Off by default: position is one property until someone
   *  asks for two, and the two axes are kept in lockstep while it is. */
  separatePosition?: boolean;
  distributor?: Distributor;
}

/**
 * A property animated directly on one element — the raw material, before anyone
 * decides it is worth bundling into a reusable module. Stops are normalized inside
 * `range`, the same way a module's are.
 */
export interface KeyframeSet { stops: Stop[]; range: [number, number]; }

export interface Track {
  layer: Layer;
  /** Standalone keyframed properties, keyed by the `Prop` they drive. */
  keyframes?: Record<string, KeyframeSet>;
  modules: ElementModule[];
}

/** `input` is declared but not yet evaluated — the module increment gives it meaning. */
export interface Driver { kind: "time" | "input" | "scroll" | "cursor"; }

export interface Composition {
  fps: number; duration: number; driver: Driver;
  /** Paper colour behind every layer. Undefined leaves the frame transparent. */
  background?: string;
  fields?: FieldDef[];
  tracks: Track[];
}

export interface SceneItem { id: string; source: LayerSource; state: Transform; }
export type Scene = SceneItem[];
