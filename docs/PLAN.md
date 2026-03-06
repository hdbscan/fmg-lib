# FMG UI Layer Plan (Tech-Debt-Free Design)

## Objective

Build a modern UI layer for `fmg-lib` without inheriting FMG's legacy browser architecture and dependency footprint.

This plan is based on upstream exploration in `tmp/fmg-upstream`, especially:

- `src/index.html`
- `public/main.js`
- `public/modules/ui/layers.js`
- `public/modules/io/save.js`
- `src/renderers/*.ts`
- `src/types/global.ts`

## FMG tech debt to avoid

## 1) Script-order coupled bootstrap

- Upstream loads many scripts in a fragile order from `src/index.html`.
- Behavior depends on globals initialized by earlier scripts.

Better design:

- single app entrypoint
- explicit ESM imports
- no initialization through global script order

## 2) Global mutable runtime state

- Upstream uses broad globals (`grid`, `pack`, `options`, layer selections, helper functions) across modules.
- `src/types/global.ts` documents this coupling.

Better design:

- one typed UI state store
- immutable world snapshots from `fmg-lib`
- no writes to `window` for app logic

## 3) Rendering side effects with implicit contracts

- Renderer modules register via `window.drawX = ...` and read global objects.

Better design:

- renderer API accepts explicit inputs (`RenderFrame`, `LayerVisibility`, `StyleConfig`)
- pure preparation/adaptation layer before drawing

## 4) DOM-coupled business logic

- Generation/render flow reads control values directly (`byId(...).value`).

Better design:

- UI form state -> typed config object -> worker request
- no direct DOM reads in domain logic

## 5) Monolithic layer orchestration

- `drawLayers()` mixes visibility decisions, rendering triggers, and DOM mutation.

Better design:

- declarative render passes
- central visibility model
- per-layer renderer modules with consistent contracts

## 6) Persistence tied to SVG snapshots and ad-hoc format

- Upstream save flow stores data plus serialized SVG markup in custom line-based format.

Better design:

- canonical world persistence via `serializeWorld` / `deserializeWorld`
- separate UI session format for camera + panel state + style presets
- no persisted renderer DOM artifacts

## 7) Heavy legacy dependencies in core UI flow

- Upstream depends on `jquery`, `jquery-ui`, global `d3` mutation style, legacy plugin chain.

Better design:

- minimal dependency policy
- avoid legacy runtime dependencies for core flow
- keep third-party libraries optional and replaceable behind interfaces

## Dependency policy (proposed)

## Required

- TypeScript
- Vite (UI build/dev only)
- SolidJS (`solid-js`) for UI shell and controls

## Optional (strictly justified)

- tiny utility libs with clear value and low lock-in

## Avoid in core flow

- `jquery`, `jquery-ui`
- D3 DOM mutation patterns (`d3.select` orchestration as app backbone)
- persistence formats tied to rendered markup

## UI framework decision

Shortlist considered for a lightweight modern UI shell:

- SolidJS: fine-grained reactivity, very low runtime overhead, strong TypeScript support
- Svelte: excellent DX and compile-time model, slightly different mental model from TS-heavy app architecture
- Preact: tiny React-compatible option, but still VDOM-centered

Decision: use SolidJS for `ui/app`.

Rationale:

- lightweight runtime for map-heavy pages
- easy integration with imperative Canvas renderer
- strong community reputation for performance and lean architecture

## D3 usage policy (keep what D3 is good at)

Use D3 only for data/math utilities, not DOM orchestration:

- allowed modules: `d3-scale`, `d3-array`, `d3-interpolate`, `d3-color`, `d3-shape`
- optional: `d3-zoom` only if it clearly beats a small custom camera controller
- disallowed in core app flow: `d3-selection`/`d3-transition` as UI state engine

Rendering remains Canvas pass-based and controlled by typed app state.

## Target architecture

```text
fmg-lib (existing headless core)
  -> ui/adapter      # WorldGraphV1 -> render-ready structures
  -> ui/renderer     # Canvas2D pass system (WebGL optional later)
  -> ui/app          # SolidJS controls, viewport, interaction, presets
  -> ui/workers      # generation worker bridge
```

## Contracts

- `RenderableWorld`: read-only, normalized data for rendering and hit testing
- `LayerVisibilityState`: UI visibility toggles independent of generation flags
- `StylePreset`: typed per-layer style config
- `UiSession`: camera, selected cell/entity, opened panels, active tool
- `WorkerProtocol`: typed request/response messages with request IDs

## Rendering strategy

## Backend

- start with Canvas2D for simplicity and performance
- keep backend interface swappable for future WebGL renderer

## Passes

- physical passes: water/land/coast/rivers/biome
- political passes: states/provinces/religions/routes
- entity passes: settlements/military/markers/zones
- UI overlay passes: selection, hover, inspector cues

## Performance

- precompute static geometry caches per world
- keep dynamic overlays separate from static base layers
- progressive redraw: only redraw dirty layers

## Data flow

1. UI form -> `GenerationConfig`
2. request sent to generation worker
3. worker returns `WorldGraphV1` or serialized world payload
4. adapter derives render caches and indexes
5. renderer draws active passes from visibility + style state
6. UI session persists separately from world data

## Migration phases

## Phase A - Architecture guardrails

- enforce import boundaries between `src/*` and `ui/*`
- enforce dependency denylist (`jquery`, `jquery-ui`, legacy D3 app patterns)
- document ADRs for state store, UI shell, renderer API

## Phase B - Adapter foundation

- implement cell polygon + adjacency + entity adapters
- implement hit-test index
- add adapter correctness tests against fixture worlds

## Phase C - Physical map MVP

- render physical layers and interactions (pan/zoom/hover)
- add layer toggles and basic legends

## Phase D - Human overlays

- add cultures/settlements/states/provinces/religions
- add military/markers/zones

## Phase E - Workerized generation UX

- async generate/cancel/re-generate flow
- deterministic replay from serialized worlds

## Phase F - Quality and budgets

- UI smoke tests for core flows
- rendering performance baselines and budgets
- memory budget checks for geometry caches

## Screenshot review workflow

- Capture each UI milestone with `npm run screenshot:milestone -- --slug <name>` and save the artifact under `screenshots/milestones/`.
- Prefer upstream-vs-local comparisons with `npm run screenshot:drift -- --slug <name> --upstream-url <url> --local-url <url>` so every milestone has a drift report under `screenshots/drift/`.
- If the upstream shell cannot run yet, compare against the last approved local artifact via `--baseline <png>` and record that fallback in the report metadata.
- Keep screenshot selectors stable through `data-screenshot*` attributes instead of DOM-structure-dependent locators.

## Non-goals

- no port of upstream jQuery/jQuery-UI editor stack
- no global `window`-registered render functions
- no SVG-snapshot save format

## Immediate next actions

1. Align `docs/todo.md` with SolidJS + constrained-D3 architecture.
2. Add dependency and import guardrails before building features.
3. Keep screenshot milestones and drift reports current while the UI shell is still moving.
4. Scaffold SolidJS app shell, then implement `ui/adapter` and renderer passes.
