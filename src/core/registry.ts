import type { ModuleImpl } from "./types";

const registry = new Map<string, ModuleImpl>();

export function registerModule(type: string, impl: ModuleImpl): void {
  registry.set(type, impl);
}

export function getModule(type: string): ModuleImpl {
  const impl = registry.get(type);
  if (!impl) throw new Error(`unknown module type: ${type}`);
  return impl;
}
