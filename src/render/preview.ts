import type { Composition } from "../core/types";
import { drawFieldMarkers } from "./canvas2d";
import { paintComposition } from "./paint";


export class Preview {
  playing = false;
  t = 0;
  onTick?: (t: number) => void;

  private canvas: HTMLCanvasElement;
  private comp: Composition;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement, comp: Composition) {
    this.canvas = canvas;
    this.comp = comp;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.resize();
    this.render();
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  render(): void {
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
    this.t = (this.t + dt / this.comp.duration) % 1;
    this.onTick?.(this.t);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
