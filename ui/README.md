# UI Shell

`ui/` is the SolidJS + Vite shell for viewing `fmg-lib` worlds with a Bun-only workflow.

## Usage

From the repo root:

```bash
bun install
bun install --cwd ui
bun run ui:dev
```

Useful commands:

- `bun run ui:dev` - start the UI shell locally.
- `bun run ui:build` - produce `ui/dist`.
- `bun run check:ui` - run guardrails plus UI typecheck, tests, build, and bundle budget checks.
- `bun run check:all` - run core and UI checks together, matching CI.

## Architecture

- `ui/app` owns the Solid app shell, generation form, visibility/style state, inspection UX, save/load actions, and session persistence.
- `ui/workers` wraps `generateWorld`, `serializeWorld`, and `deserializeWorld` behind a typed request/response protocol so long-running work stays off the main thread when workers are available.
- `ui/adapter` converts `WorldGraphV1` into `RenderableWorld`, rebuilding cell polygons and a bucketed hit-test index for hover/selection.
- `ui/renderer` is the Canvas2D backend. It consumes `RenderableWorld`, visibility flags, style presets, and camera state without reaching back into app code.

Data flow stays one-way: `fmg-lib` world -> adapter -> renderer, while the app shell only coordinates state and worker requests.

## Memory Budget Notes

- The largest UI allocations are per-cell polygon buffers (`RenderCell.polygon`) and the hit-test bucket index in `ui/adapter`.
- Keep geometry cached once per loaded world; avoid cloning `RenderableWorld` or rebuilding hit-test buckets on every hover, pan, or toggle.
- Treat large maps as budget-sensitive when both polygon cache and hit-test index are live at the same time; if memory climbs unexpectedly, inspect repeated `buildRenderableWorld` / `createHitTestIndex` calls first.
- Prefer typed arrays and shared source references over object copies for any new overlay cache.

## Visual Mismatch And Interaction Troubleshooting

- If a layer looks wrong, confirm the same serialized world file is loaded before comparing screenshots; generation changes and render changes drift in different ways.
- If hover or selection feels off, inspect the cell's bbox/polygon rebuild path in `ui/adapter` and then validate the bucket size assumptions in `ui/adapter/hit-test.ts`.
- If labels, routes, or borders shift after a UI change, rebuild with `bun run ui:build` and rerun screenshot capture from `docs/screenshot-workflow.md` to separate layout drift from data drift.
- If save/load behaves differently from fresh generation, verify the schema version message in the UI first and then compare the serialized payload round-trip path in `ui/app/world-transfer.ts` and `ui/workers/service.ts`.
