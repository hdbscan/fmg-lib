# fmg-lib

Library-only extraction/fork of Azgaar's Fantasy Map Generator (FMG) focused on **headless world generation**.

- Runtime: **Bun**
- Output: a compact, versioned `WorldGraph` data model (typed arrays / packed structures), suitable for:
  - server-side generation
  - deterministic regeneration by seed
  - multiplayer-friendly authoritative state storage

This project is **not** aiming to track upstream parity over time; we freeze at a chosen FMG commit and refactor for our needs.

## Status
Active migration.

Current implemented slice:
- Bun-native API scaffold (`generateWorld`)
- strict TypeScript setup
- headless config normalization + validation
- deterministic physical pipeline (grid, height, feature bands, landmasses, waterbodies, land-only packed graph, climate, hydrology-lite, biomes)
- upstream-FMG-derived heightmap templates ported into the headless terrain stage for closer fixed-seed continent / island shaping
- optional culture layer generation on packed land cells
- compact adjacency and serialization (`serializeWorld`/`deserializeWorld`)
- high-level integration tests for determinism, graph coherence, fixture hashes, and round-trip persistence
- Bun + Playwright parity harness against upstream FMG `?seed=42424242&options=default`

## Parity

- Refresh the live upstream oracle: `bun run parity:oracle`
- Run the parity harness: `bun run parity:check`
- Latest report is written to `artifacts/parity/latest-report.json`

## Why
FMG is an excellent generator but is structured as a browser app (DOM + rendering + globals). We want:
- a clean programmatic API (`generateWorld`) with explicit inputs/outputs
- no DOM, no SVG/D3 rendering dependencies
- deterministic results

See `docs/PLAN.md`.

Additional docs:
- `docs/migration-plan.md`
- `docs/todo.md`
- `docs/architecture.md`
- `docs/usage.md`
- `docs/dependency-graph.md`
- `docs/contributing-stages.md`
- `docs/release-policy.md`
- `docs/performance.md`
- `docs/schema-compatibility.md`
