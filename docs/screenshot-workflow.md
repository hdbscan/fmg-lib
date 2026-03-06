# Screenshot Workflow

This repo uses `playwright-cli` for lightweight screenshot capture during UI migration work.

## One-time setup

1. Install dependencies.
2. Run `bun run screenshot:install-browser`.

## Milestone capture

- Default dummy target: `bun run screenshot:dummy`
- Built UI shell target: `bun run screenshot:milestone:ui-shell`
- Custom target: `bun run screenshot:milestone -- --slug <name> --url <url> --selector <css-selector>`
- Static-root target: `bun run screenshot:milestone -- --slug <name> --static-root <dir> --static-path </path> --selector <css-selector> --ready-selector <css-selector>`
- Outputs:
  - `screenshots/milestones/<slug>.png`
  - `screenshots/milestones/<slug>.json`

Defaults target `ui/dummy/index.html` and capture `[data-screenshot="ui-dummy-card"]` at `1440x960`.
Use `--static-root` when you want Bun to serve a prebuilt directory such as `ui/dist` or an upstream FMG checkout instead of relying on a long-running dev server.
The scripts default to Playwright Firefox so they do not depend on a system Chrome install; override with `--browser` if needed.

## Drift checks

- Upstream vs local: `bun run screenshot:drift -- --slug <name> --local-url <local-url> --upstream-url <upstream-url> --local-selector <css-selector> --upstream-selector <css-selector>`
- Static-root drift: `bun run screenshot:drift -- --slug <name> --local-static-root <dir> --local-static-path </path> --upstream-static-root <dir> --upstream-static-path </path>`
- Approved-local fallback: `bun run screenshot:drift -- --slug <name> --baseline <png> --note "why upstream is unavailable"`
- Dummy fallback example: `bun run screenshot:dummy:drift`

For a deterministic upstream FMG baseline, prefer a seeded URL and a map-only selector:

- Fixed-seed upstream recipe: `https://azgaar.github.io/Fantasy-Map-Generator/?seed=42424242&options=default`
- Comparable local selector: `[data-screenshot="ui-shell-canvas"]`
- Comparable upstream selector: `#map`
- Recommended command: `bun run ui:build && bun run screenshot:drift -- --slug m01-ui-shell-fixed-seed --viewport 900x600 --local-static-root ui/dist --local-static-path / --local-selector [data-screenshot="ui-shell-canvas"] --local-ready-selector [data-screenshot="ui-shell-canvas"] --local-label local-ui-shell-canvas-default --local-delay-ms 1000 --upstream-url https://azgaar.github.io/Fantasy-Map-Generator/?seed=42424242&options=default --upstream-selector '#map' --upstream-ready-selector '#map' --upstream-label upstream-fmg-seed-42424242-default --upstream-delay-ms 12000 --note "Comparing the local default canvas against upstream FMG loaded with ?seed=42424242&options=default at the same 900x600 viewport for a deterministic review scenario."`

`?seed=<value>` gives upstream FMG a fixed world seed on first load, and `&options=default` forces the default option set instead of any browser-stored preferences.

Outputs live under `screenshots/drift/<slug>/`:

- `local.png`
- `upstream.png` or `baseline.png`
- `report.json`
- `report.md`
- `comparison.html`

The drift check currently records exact-file hash differences and provides side-by-side review artifacts. Treat `different` as a review trigger, not an automatic failure verdict.
