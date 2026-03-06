# Screenshot Workflow

This repo uses `playwright-cli` for lightweight screenshot capture during UI migration work.

## One-time setup

1. Install dependencies.
2. Run `bun run screenshot:install-browser`.

## Milestone capture

- Default dummy target: `bun run screenshot:dummy`
- Custom target: `bun run screenshot:milestone -- --slug <name> --url <url> --selector <css-selector>`
- Outputs:
  - `screenshots/milestones/<slug>.png`
  - `screenshots/milestones/<slug>.json`

Defaults target `ui/dummy/index.html` and capture `[data-screenshot="ui-dummy-card"]` at `1440x960`.
The scripts default to Playwright Firefox so they do not depend on a system Chrome install; override with `--browser` if needed.

## Drift checks

- Upstream vs local: `bun run screenshot:drift -- --slug <name> --local-url <local-url> --upstream-url <upstream-url> --local-selector <css-selector> --upstream-selector <css-selector>`
- Approved-local fallback: `bun run screenshot:drift -- --slug <name> --baseline <png> --note "why upstream is unavailable"`
- Dummy fallback example: `bun run screenshot:dummy:drift`

Outputs live under `screenshots/drift/<slug>/`:

- `local.png`
- `upstream.png` or `baseline.png`
- `report.json`
- `report.md`
- `comparison.html`

The drift check currently records exact-file hash differences and provides side-by-side review artifacts. Treat `different` as a review trigger, not an automatic failure verdict.
