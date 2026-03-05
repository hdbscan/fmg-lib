# High-level plan (fmg-lib)

## Goal
Turn FMG's generation pipeline into a **library** usable from Bun without a browser / DOM.

Deliver a single entrypoint:

```ts
export function generateWorld(opts: GenerateOptions): WorldGraph
```

where `WorldGraph` contains the minimum sufficient data to render the world and drive gameplay.

## Non-goals
- No SVG generation / D3 rendering.
- No UI/editor.
- No attempt to maintain mergeability with upstream FMG.

## Strategy
We will freeze FMG at a chosen commit and progressively extract/refactor pieces into a clean module graph.

Two workable extraction patterns:
1) **Copy-in extraction** (recommended): copy the required TS modules into `src/fmg/` and refactor them to be pure.
2) **In-place refactor**: keep original files and refactor with wrappers. Higher merge conflict risk.

We will prefer **copy-in** for speed and clarity.

## Phases

### Phase 0 — Repo + tooling
- Bun project scaffolding
- lint/format (optional)
- basic test harness

### Phase 1 — Deterministic substrate
Deliver deterministic, headless generation of:
- Voronoi grid / cells (positions)
- heightmap (cell heights)

Output:
- typed arrays: `cells_x`, `cells_y`, `cells_h`, `neighbors` (optional)
- metadata: seed, width/height, cell_count

Acceptance:
- `generateWorld({seed, width, height, cells})` runs without DOM
- output stable across runs

### Phase 2 — Biomes + climate fields
Add:
- temperature/precip/biome assignment (if needed)

### Phase 3 — Rivers + water bodies
Add:
- rivers graph/polylines
- lakes/coastline flags (renderable)

### Phase 4 — Settlements + factions
Add:
- burgs (settlements): id/name/pos/pop
- states/provinces (optional)

### Phase 5 — Serialization + versioning
- `WorldGraph` schema version
- binary/CBOR option for compact transfer

## Engineering constraints
- No reads from `document` / `window`
- No globals as API surface; all state should be returned
- PRNG: a single seeded RNG injected everywhere
- Performance: avoid JSON object-per-cell; prefer typed arrays

## Upstream incorporation
- We will not track upstream continuously.
- If we need a feature, we cherry-pick or manually port.
