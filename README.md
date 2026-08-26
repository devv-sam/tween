# tween

Motion composition engine with dual-face modules: evaluate for real-time preview, emit for code export.

## Core purity rule

> `src/core/` is pure: no DOM, no browser APIs, and no imports from `render`, `export`, or `ui`. Every module implements both `evaluate` and `emit`. Composition data stays JSON-serializable; behavior lives in the module registry.

## Scripts

```bash
npm run dev         # start dev server
npm run build       # production build
npm test            # run tests
npm run typecheck   # type-check without emitting
```
