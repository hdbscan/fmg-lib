# fmg-lib

Library-only extraction/fork of Azgaar's Fantasy Map Generator (FMG) focused on **headless world generation**.

- Runtime: **Bun**
- Output: a compact, versioned `WorldGraph` data model (typed arrays / packed structures), suitable for:
  - server-side generation
  - deterministic regeneration by seed
  - multiplayer-friendly authoritative state storage

This project is **not** aiming to track upstream parity over time; we freeze at a chosen FMG commit and refactor for our needs.

## Status
Planning + scaffolding.

## Why
FMG is an excellent generator but is structured as a browser app (DOM + rendering + globals). We want:
- a clean programmatic API (`generateWorld`) with explicit inputs/outputs
- no DOM, no SVG/D3 rendering dependencies
- deterministic results

See `docs/PLAN.md`.
