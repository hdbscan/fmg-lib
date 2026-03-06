# FMG Migration Plan (Deep Dive)

## Scope and Source Snapshot

- Upstream analyzed: `Azgaar/Fantasy-Map-Generator`
- Local analysis clone: `tmp/fmg-upstream`
- Snapshot commit: `634c7dba4bca06a73f8d53c3806805dc84d08551`
- Target in this repo: Bun-first, headless library API with deterministic generation and a compact versioned world schema

## What the Deep Dive Found

### 1) Generation Pipeline Is Centralized in `public/main.js`

The full world generation flow is orchestrated by `generate(options)` in `tmp/fmg-upstream/public/main.js`.

High-level order:

1. Seed setup and graph sizing
2. `generateGrid` (jittered square points + Voronoi)
3. Heightmap generation (`HeightmapGenerator.generate`)
4. Grid feature pass (`Features.markupGrid`)
5. Lake/depression adjustments + climate setup
6. Repack graph (`reGraph`) into `pack`
7. Packed feature pass (`Features.markupPack`)
8. Natural systems: rivers, biomes, ice
9. Human systems: cultures, burgs, states, routes, religions, provinces
10. Post-processing: statistics, naming, military, markers, zones

This order is critical and should be preserved in the migration pipeline.

### 2) Core State Model Uses Global Mutable Objects

Core mutable objects:

- `grid`: initial jittered-grid Voronoi with climate precursors
- `pack`: repacked graph with most gameplay-relevant data

The codebase uses global mutable state (`window.*`, global `grid`, global `pack`) and many modules mutate shared arrays directly.

### 3) Modern TS Modules Exist, but Runtime Still Depends on Browser Globals

The TS modules under `src/modules` and `src/utils` are loaded from `src/index.html`, but they still bind classes and helpers onto `window`.

Examples:

- `window.HeightmapGenerator`, `window.Features`, `window.Rivers`, `window.Biomes`
- `window.Cultures`, `window.Burgs`, `window.States`, `window.Religions`, `window.Provinces`
- utility globals exposed in `src/utils/index.ts`

This is helpful for extraction (logic already modularized), but we must replace global mutation and UI coupling with explicit runtime context.

### 4) Browser/UI Coupling Is the Main Extraction Risk

Main coupling patterns found:

- Direct reads from DOM controls (`byId(...).value`, dataset lookups)
- UI dialogs / jQuery usage inside generation modules
- SVG/renderer dependencies and map-layer setup in `main.js`
- Some modules using document APIs (`document.createElement`, `document.getElementById`)

For a headless library, these values must come from explicit typed config objects.

### 5) Existing Data Shape Maps Well to a Compact `WorldGraph`

The upstream model already uses typed arrays extensively (`Uint8Array`, `Uint16Array`, `Float32Array`) for dense cell data. This aligns with the planned compact `WorldGraph` approach and deterministic regeneration by seed.

## Upstream Assumptions and Non-goals

- We treat upstream FMG as a one-time source baseline, not a continuously mirrored dependency.
- We do not preserve browser/editor behavior; only generation logic relevant to headless runtime.
- We do not target UI parity or map rendering parity.
- We allow controlled output divergence where it improves determinism, API clarity, or runtime constraints.

## Migration Strategy

### Phase 0: Pin and Freeze

- Keep the analyzed upstream commit pinned in documentation.
- Treat upstream as read-only source material for extraction.
- Define no-parity policy (already aligned with repo intent).

Exit criteria:

- Source commit recorded and referenced in implementation docs/tests.

### Phase 1: Build a Headless Runtime Contract

Create a strict runtime context object (no `window`, no DOM reads):

- `seed`
- graph dimensions and point density
- climate parameters
- cultural/political generation parameters
- toggles for optional layers

Introduce:

- `GenerationConfig` (input)
- `GenerationContext` (mutable internal state)
- `GenerationResult` / `WorldGraph` (output)

Exit criteria:

- No generation step requires `document`, `window`, or UI elements.

### Phase 2: Extract and Stabilize the Physical World Pipeline

Implement headless sequence first:

1. grid generation (`generateGrid`, Voronoi)
2. heightmap
3. feature markup on grid
4. climate (temperature + precipitation)
5. repack (`reGraph` equivalent)
6. feature markup on pack
7. rivers
8. biomes

Focus is deterministic terrain + hydrography and valid packed topology.

Exit criteria:

- Same seed/config yields bit-stable outputs across runs on Bun.
- Integrity checks pass: neighbor symmetry, valid feature ids, no invalid cell references.

### Phase 3: Add Human Geography as Optional Layers

Incrementally add:

- cultures
- burgs
- states
- routes
- religions
- provinces
- military, markers, zones (optional for MVP)

Gate each layer behind feature flags in config so the library can run lightweight terrain-only mode.

Exit criteria:

- Layered generation works with and without optional systems.
- Dependency ordering is explicit and validated.

### Phase 4: WorldGraph Schema and Serialization

Define versioned schema:

- `schemaVersion`
- packed typed arrays
- compact object tables for sparse entities (rivers, settlements, states)
- optional layer presence flags

Add serializer/deserializer with forward-compat migration hooks.

Exit criteria:

- Round-trip encode/decode preserves data fidelity.
- Schema version is embedded and tested.

### Phase 5: Determinism and Regression Harness

Create seeded fixture suite:

- fixed seed/config snapshots
- hash checks on key typed arrays and entity tables
- structural invariants (counts, id references, topology sanity)

Add performance baselines for target sizes.

Exit criteria:

- Deterministic test suite green under Bun.
- Performance metrics captured for baseline map sizes.

## Suggested Initial Delivery Slices

1. Terrain-only slice: grid + heightmap + features + climate + repack
2. Hydrology slice: rivers + lakes finalization + biome assignment
3. Settlements/politics slice: cultures + burgs + states + routes
4. Full world slice: religions + provinces + optional extras
5. Schema slice: serialization + versioning + migration helpers

## Implementation Rules for This Repo

- No rendering stack in library runtime.
- No jQuery or UI dialogs in generation path.
- No implicit globals; all dependencies injected via context.
- Keep typed-array-first storage for dense cell data.
- Prefer pure functions for stage transforms where practical.

## Known Hard Parts (Plan for Early Mitigation)

- Hidden UI assumptions in modules (values formerly read from controls)
- Mixed responsibilities in some generators (logic + editor concerns)
- Global helper reliance (`window.*` helper namespace)
- Ordering-sensitive side effects across modules

Mitigation:

- Start by wrapping each stage in an adapter that receives explicit parameters.
- Add invariants after each stage to catch breakages early.
- Isolate any browser-only helper behind interface boundaries.

## Immediate Next Engineering Task

Build a true packed-graph transform (`reGraph` equivalent) from current Voronoi buffers, then port richer feature markup (`markupGrid` and `markupPack`) on top.
