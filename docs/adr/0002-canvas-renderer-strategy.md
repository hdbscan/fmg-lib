# 0002: Canvas-first renderer strategy

## Status

Accepted

## Decision

The UI renderer starts with a Canvas2D backend and a pass-based API.

- `ui/renderer/` owns draw orchestration.
- `ui/adapter/` prepares render-ready world data from `WorldGraphV1`.
- The renderer stays swappable so WebGL can replace Canvas later without changing the library contract.

## Why

- Canvas2D is simple, fast enough for the current world sizes, and easy to pair with SolidJS controls.
- A pass model keeps physical, political, entity, and overlay work isolated.
- Dirty-layer redraws and zoom-aware labels provide enough structure for later optimization.

## Consequences

- Rendering logic remains out of `src/` and out of generation stages.
- Performance work happens in `ui/renderer/` and adapter caches, not in the library schema.
- Any future renderer replacement must keep the same typed renderer inputs.
