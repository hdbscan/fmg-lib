# 0001: UI migration guardrails

## Status

Accepted

## Decision

We treat the UI migration as a controlled extraction, not a fast parity port.

- Dependency policy: add a package only when the UI step cannot be completed with the current stack, prefer the smallest direct dependency, and document why it is needed in the PR or commit. Do not add compatibility shims for legacy browser globals when a local adapter or rewrite is practical.
- Public API only: code under `ui/` may import from stable public entry points only. Import from package roots or declared exports, not internal source paths, deep files, or private helpers from `src/`.
- CI enforcement: every UI migration branch must keep typecheck, tests, and formatting green, and CI must fail on disallowed `ui/` deep imports or undeclared dependency usage.
- Screenshot milestone rule: each meaningful UI migration step must include an updated screenshot artifact under `screenshots/` that shows the current local result next to the expected upstream reference or documents why a side-by-side comparison is not yet possible.

## Rules to apply

- Dependencies: prefer existing runtime and tooling first; if a new package is required, keep it narrowly scoped, version-pinned by lockfile, and removable after the migration step if possible.
- Imports: if `ui/` needs shared behavior, expose it through a public module boundary first, then import that boundary. Do not reach into another module's internals just because the file exists.
- Drift checks: screenshot reviews compare upstream FMG output versus the local migrated output for the same scenario when upstream is available. If upstream cannot run for that scenario, compare against the last approved local screenshot and note the missing upstream baseline.
- Milestone quality bar: do not mark a migration slice complete until the screenshot is committed, the comparison is reviewed for obvious drift, and any intentional differences are written down in the change description.

## Consequences

- The UI code stays coupled to supported interfaces instead of temporary internal paths.
- CI catches migration shortcuts early, before they become permanent dependencies or import patterns.
- Screenshot history becomes a concrete record of visual progress and drift, not an optional afterthought.
