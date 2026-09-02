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

export interface Distributor {
  type: "path" | "none";
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
  distributor?: Distributor;
}

export interface Track { layer: Layer; modules: ModuleData[]; }

export interface Driver { kind: "time" | "scroll" | "cursor"; }

export interface Composition {
  fps: number; duration: number; driver: Driver;
  fields?: FieldDef[];
  tracks: Track[];
}

export interface SceneItem { id: string; source: LayerSource; state: Transform; }
export type Scene = SceneItem[];
