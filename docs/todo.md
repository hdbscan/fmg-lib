# TODO (Comprehensive Roadmap)

This checklist tracks all migration phases from `docs/migration-plan.md` plus cross-cutting engineering work.

## Foundation and Tooling

- [x] Rename migration doc to `docs/migration-plan.md`.
- [x] Add `tmp/` to `.gitignore`.
- [x] Add `AGENT.md` with Bun-native + TDD rules.
- [x] Enable strict TypeScript compiler settings.
- [x] Add initial deterministic generator tests.
- [x] Add `bunfig.toml` with test defaults and runtime settings.
- [x] Add Bun-native CI workflow (`bun install`, `bun run check`).
- [x] Add lint/format tooling and Bun script wiring.

## Phase 0: Pin and Freeze Upstream

- [x] Record upstream commit hash in migration docs.
- [x] Add an "upstream assumptions" section in docs with non-goals.
- [x] Document exact source modules used for extraction (file map).
- [x] Add update protocol for future upstream re-syncs.

## Phase 1: Headless Runtime Contract

- [x] Define `GenerationConfig` (input contract) with explicit defaults.
- [x] Define `GenerationContext` (internal mutable state, no globals).
- [x] Define `GenerationResult` and `WorldGraph` public output contract.
- [x] Add runtime config validation and normalized config builder.
- [x] Remove all implicit `window`/DOM assumptions from core entry path.
- [x] Add tests for config validation and defaulting behavior.

## Phase 2: Physical World Pipeline (Terrain + Hydro)

### 2.1 Grid and Topology

- [x] Port jittered point placement (`generateGrid`) to headless module.
- [x] Port Voronoi adjacency build on generated points.
- [x] Add typed-array vertex structures for packed topology.
- [x] Add topology invariants: neighbor symmetry, valid indexes, border sanity.
- [x] Add deterministic snapshot tests for grid output.

### 2.2 Heightmap

- [x] Port headless heightmap generation stage.
- [x] Remove UI/template lookup dependencies by injecting template config.
- [x] Add tests for deterministic height distribution by seed.

### 2.3 Features and Climate

- [x] Add basic headless feature classification (`cellsFeature`, `cellsCoast`).
- [x] Add connected-component landmass classification (`cellsLandmass`).
- [x] Port `markupGrid` and `markupPack` feature passes (current land-only pack parity).
- [x] Port map size, coordinates, and climate calculations.
- [x] Port precipitation model with deterministic behavior.
- [x] Add invariants for feature IDs and shoreline consistency.

### 2.4 Repack, Rivers, and Biomes

- [x] Port initial `reGraph` equivalent to land-only packed graph.
- [x] Add headless hydrology-lite flow accumulation and river marking.
- [x] Port lakes and river flow generation in headless form.
- [x] Add connected-component waterbody classification (`cellsWaterbody`).
- [x] Port biome assignment stage.
- [x] Add integration tests for terrain -> rivers -> biomes ordering.

## Phase 3: Human Geography as Optional Layers

### 3.1 Culture and Settlement

- [x] Port initial cultures generation behind feature flag.
- [x] Port burg placement/specification behind feature flag (deterministic initial pass).
- [x] Add tests for deterministic culture generation by seed.
- [x] Add tests for deterministic burg generation by seed.

### 3.2 Politics and Routes

- [x] Port states generation and state form derivation (deterministic initial pass).
- [x] Port routes generation with explicit dependencies (state-border route graph).
- [x] Port provinces generation (state-scoped deterministic subdivision).
- [x] Add dependency-order tests for states/routes/provinces.

### 3.3 Optional Systems

- [x] Port religions generation behind feature flag.
- [x] Port military generation behind feature flag.
- [x] Port markers and zones behind feature flags.
- [x] Add tests for "layer on/off" behavior and stable outputs.

## Phase 4: WorldGraph Schema and Serialization

- [x] Finalize `schemaVersion` policy and compatibility matrix.
- [x] Define compact binary-safe representation for typed arrays.
- [x] Implement `serializeWorld` and `deserializeWorld`.
- [x] Add forward migration hook architecture for future versions.
- [x] Add round-trip tests: serialize -> deserialize -> equal world.

## Phase 5: Determinism, Regression, and Performance

- [x] Add golden fixtures for representative seeds and configs.
- [x] Add hash checks for critical arrays and entity tables.
- [x] Add structural regression tests for all enabled layer combos.
- [x] Add fixture regression coverage for cultures layer enabled/disabled parity.
- [x] Add perf baselines for small/medium/large map configs.
- [x] Add memory profiling notes and budget thresholds.

## TDD Execution Plan (Red-Green-Refactor)

- [ ] For each new stage, write failing behavior test first (Red).
- [ ] Implement minimum code to pass (Green).
- [ ] Refactor for clarity and composability with tests green.
- [ ] Keep PR/test history showing explicit Red -> Green -> Refactor steps.

## Documentation and Developer Experience

- [x] Add architecture doc for pipeline stage boundaries.
- [x] Add module dependency graph for generation order.
- [x] Add "how to add a new stage" contributor guide.
- [x] Add API usage examples (`generateWorld`, flags, serialization).
- [x] Add troubleshooting guide for determinism mismatches.

## Release Readiness

- [x] Define semver policy for schema and API evolution.
- [x] Add changelog process and release checklist.
- [x] Add pre-release validation script (`bun run check` + fixtures).
- [ ] Publish first preview package once Phase 2 is stable.

## Phase 6: Separate UI Layer Migration (Post-Library, Tech-Debt-Free)

### 6.0 Upstream debt audit and architecture decisions

- [x] Perform detailed upstream UI architecture exploration (`tmp/fmg-upstream`).
- [x] Rewrite UI migration plan in `docs/PLAN.md` with explicit debt-reduction strategy.
- [x] Select lightweight UI framework: SolidJS.
- [x] Define constrained D3 usage policy (math/scale utilities, no DOM-orchestration core flow).
- [ ] Write ADR: dependency policy (minimal dependencies, no legacy core-flow libs).
- [ ] Write ADR: rendering backend strategy (Canvas2D-first, swappable API).
- [ ] Write ADR: UI state model and worker protocol.

### 6.1 Guardrails to prevent legacy debt reintroduction

- [ ] Lock boundary rule: no UI/runtime browser code in `src/internal/*`.
- [ ] Add import boundary checks so `ui/*` can use only `src/index.ts` public API.
- [ ] Add denylist checks for legacy dependencies in UI core flow (`jquery`, `jquery-ui`).
- [ ] Add guardrail checks to prevent `d3-selection`/`d3-transition` usage in `ui/app` core flow.
- [ ] Add CI task to fail on forbidden dependencies/imports.

### 6.2 Lean UI scaffolding

- [ ] Create separate `ui/` workspace with independent scripts.
- [ ] Scaffold SolidJS + Vite app entrypoint in `ui/app`.
- [ ] Add UI build/dev pipeline.
- [ ] Add UI lint/typecheck/test scripts wired to root checks.
- [ ] Add UI bundle-size budget and CI check.
- [ ] Add UI architecture README.

### 6.3 Adapter layer (WorldGraph -> RenderableWorld)

- [ ] Define `RenderableWorld`, `LayerVisibilityState`, `StylePreset`, `UiSession` contracts.
- [ ] Implement cell polygon reconstruction from vertex arrays.
- [ ] Implement entity adapters (cultures, settlements, states, routes, provinces, religions).
- [ ] Implement optional-system adapters (military, markers, zones).
- [ ] Implement spatial hit-test indexing (cell lookup by world coordinates).
- [ ] Add adapter determinism, bounds, and coherence tests against fixture worlds.

### 6.4 Renderer layer (declarative pass model)

- [ ] Implement renderer interface and Canvas2D backend.
- [ ] Implement physical passes (land/water/coast/rivers/biomes).
- [ ] Implement political passes (states/provinces/religions/routes).
- [ ] Implement entity passes (settlements/military/markers/zones).
- [ ] Implement overlay passes (selection/hover/inspector highlights).
- [ ] Add zoom-aware label culling and dirty-layer redraw strategy.

### 6.5 App shell and interaction

- [ ] Implement typed UI state store (no implicit globals).
- [ ] Add camera controls (pan/zoom) and viewport state.
- [ ] Add world inspector (hover/selection entity details).
- [ ] Add generation config form (seed/size/climate/layer flags).
- [ ] Add layer visibility toggles and preset management.
- [ ] Add style preset editing separated from generation config.

### 6.6 Workerization and persistence

- [ ] Move generation calls to worker.
- [ ] Implement typed request/response protocol with request IDs and cancellation.
- [ ] Add generate/cancel/re-generate UX and status telemetry.
- [ ] Add save/load for world data using `serializeWorld`/`deserializeWorld` only.
- [ ] Add separate UI-session persistence format (camera, panels, visible layers, styles).
- [ ] Add schema-version mismatch handling and migration UX.

### 6.7 Verification, performance, and docs

- [ ] Add UI smoke tests (generate, toggle overlays, inspect, save/load).
- [ ] Add adapter large-map correctness and performance tests.
- [ ] Add UI render baselines (small/medium/large world sizes).
- [ ] Add memory budget notes for geometry/index caches.
- [ ] Add troubleshooting docs for visual mismatches and interaction regressions.
