# 0003: UI state and worker protocol

## Status

Accepted

## Decision

The UI shell keeps typed interaction state in the app layer and routes world generation / transfer through a worker protocol.

- `ui/app/` owns camera, visibility, style, hover, selection, and session persistence state.
- `ui/workers/protocol.ts` defines the request / response contract.
- `ui/workers/generate.worker.ts` handles generate, serialize, deserialize, and cancel messages.
- `ui/app/session.ts` persists only UI session data; world persistence stays on `serializeWorld` / `deserializeWorld`.

## Why

- Worker-backed generation keeps the UI responsive.
- Typed request IDs make generate, cancel, save, and load flows predictable.
- Separate UI-session persistence prevents renderer state from leaking into the core world format.

## Consequences

- UI code must treat `WorldGraphV1` as immutable input.
- New long-running UI operations should extend the worker protocol instead of bypassing it.
- Save/load UX can surface schema mismatches cleanly without mutating the underlying world schema.
