# Performance Baselines

Run:

```bash
bun run perf:baseline
```

This executes representative generation scenarios (`small`, `medium`, `large`) and prints JSON lines with:

- average/min/max generation time
- current heap usage

## Budget Targets (Initial)

- small: under 80 ms average
- medium: under 180 ms average
- large: under 500 ms average

## Latest Baseline Snapshot

Recorded on 2026-03-06 with `bun run perf:baseline`:

- small: avg 62.098 ms, min 46.384 ms, max 103.525 ms, heap 14.80 MB
- medium: avg 152.200 ms, min 136.724 ms, max 185.779 ms, heap 30.71 MB
- large: avg 442.885 ms, min 404.179 ms, max 471.198 ms, heap 12.26 MB

## Memory Notes

- Keep dense per-cell data in typed arrays.
- Avoid object-per-cell allocations in hot paths.
- Reuse stage-local buffers where practical for future stages.
- Heap snapshots are point-in-time after each scenario and may be non-monotonic due to GC timing.
