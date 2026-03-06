# Troubleshooting Determinism

## Same seed gives different output

Check the following:

- Config object values are exactly identical.
- Stage order has not changed.
- No direct `Math.random` call was introduced.
- Typed-array lengths and iteration bounds are stable.

## Common root causes

- Using non-deterministic iteration order over object keys.
- Mixing floating-point rounding rules across stages.
- Reading external mutable state during generation.
- Adding optional defaults in stage code instead of config normalization.

## Debug strategy

1. Compare `gridCellsX`, `gridCellsY`, and `cellCount` first.
2. Hash/compare `cellsX` and `cellsY` arrays.
3. Hash/compare `cellsH`, then climate arrays.
4. Compare adjacency arrays (`cellNeighborOffsets`, `cellNeighbors`).

## Regression prevention

- Keep integration fixtures for representative seeds.
- Require `bun run check` before merge.
- Update docs and tests on any schema or stage-order change.
