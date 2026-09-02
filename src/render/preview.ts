import type { Composition } from "../core/types";
import { contentEnd } from "../core/bounds";
import { drawFieldMarkers } from "./canvas2d";
import { paintComposition } from "./paint";


export class Preview {
  playing = false;
  t = 0;
  /** Off, playback stops on the last frame instead of wrapping. */
  loop = true;
  onTick?: (t: number) => void;
  /** Fired when playback runs off the end with `loop` off. */
  onEnd?: () => void;

  /** Null when the preview is only a clock — the timeline drives its own canvas. */
  private canvas: HTMLCanvasElement | null;
  private comp: Composition;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement | null, comp: Composition) {
    this.canvas = canvas;
    this.comp = comp;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.resize();
    this.render();
  }

  /** The composition is immutable upstream, so playback is handed the new one. */
  setComposition(comp: Composition): void {
    this.comp = comp;
    this.render();
  }

  resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  render(): void {
    if (!this.canvas || !this.ctx) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    paintComposition(this.ctx, this.comp, this.t, w, h);
    drawFieldMarkers(this.ctx, this.comp, this.t);
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  seek(t: number): void {
    this.t = t;
    this.render();
    this.onTick?.(t);
  }

  private frame = (ts: number) => {
    if (!this.last) this.last = ts;
    const dt = (ts - this.last) / 1000;
    this.last = ts;
    // The loop turns over where the work ends, not where the timeline does — an
    // empty tail is time the composition owns but has nothing to show in.
    const end = contentEnd(this.comp);
    const next = this.t + dt / this.comp.duration;
    if (next >= end && !this.loop) {
      this.pause();
      this.t = end;
      this.onTick?.(this.t);
      this.render();
      this.onEnd?.();
      return;
    }
    this.t = next % end;
    this.onTick?.(this.t);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
