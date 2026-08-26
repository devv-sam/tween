export interface Transform {
  x: number; y: number; scale: number; rotation: number; opacity: number;
}

export interface EvalCtx {
  t: number;       // global time 0..1
  localT: number;  // time remapped into this module's range, 0..1
  u: number;       // clone index 0..1 (0 when single instance)
  i: number;       // clone integer index
  count: number;   // total clones in this layer
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

export interface Distributor { type: string; count: number; params?: Record<string, unknown>; }

export type LayerSource = { kind: "image" | "text" | "shape"; value: string };

export interface Layer {
  id: string;
  source: LayerSource;
  base: Transform;
  distributor?: Distributor;
}

export interface Track { layer: Layer; modules: ModuleData[]; }

export interface Driver { kind: "time" | "scroll" | "cursor"; }

export interface Composition {
  fps: number;
  duration: number;      // seconds
  driver: Driver;
  tracks: Track[];
}

export interface SceneItem { source: LayerSource; state: Transform; }
export type Scene = SceneItem[];
