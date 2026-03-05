# High-level plan (fmg-lib)

## Intent
Build a **library-only** version of FMG’s world generation so our game can generate worlds programmatically under **Bun**, without any browser/DOM or map rendering.

## Deliverable
A stable API that returns a compact, versioned **WorldGraph** suitable for:
- server-side generation
- storing as authoritative state for multiplayer
- client-side custom rendering + gameplay logic

## Scope (what we intend to include)
- Base world substrate: cells/grid + elevation/heightmap
- Natural layers: coastlines/water bodies + rivers + climate/biomes (as needed)
- Human layers: settlements + political regions/factions (as needed)

## Out of scope
- Any rendering (SVG/D3/canvas)
- Any UI/editor
- Ongoing parity with upstream FMG

## Guiding principles
- Deterministic generation by seed
- Explicit inputs/outputs (no hidden globals/DOM reads)
- Efficient data model (typed arrays / packed formats; no object-per-cell JSON)
- Versioned schema so old worlds remain loadable

## Milestone shape
- MVP: generate a world substrate + enough metadata for rendering and travel/pathing
- Next: add rivers/biomes
- Next: add settlements/regions
- Final: serialization + schema versioning for long-lived saves and multiplayer
