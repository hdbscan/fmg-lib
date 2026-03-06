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

## Screenshot capture fails

- Run `npm run screenshot:install-browser` once if Playwright CLI reports a missing browser.
- Use `--url` or `--local-url` with a live Vite preview when a file URL is not enough for the current UI slice.
- Keep capture targets on stable `data-screenshot*` attributes so layout refactors do not break the workflow.

## Drift report is missing an upstream image

- Pass `--upstream-url <url>` when the upstream FMG scenario is runnable.
- If upstream is not runnable yet, use `--baseline <png>` and document that fallback in `--note`.
- Review `screenshots/drift/<slug>/report.md` to see which source the comparison used.

## Screenshot changed unexpectedly

- Re-run the same command and compare the new `sha256` in the JSON metadata before treating it as real drift.
- Check viewport size and selector arguments first; the scripts default to a fixed 1440x960 viewport.
- Confirm fonts and browser binaries are unchanged if only text metrics moved.
