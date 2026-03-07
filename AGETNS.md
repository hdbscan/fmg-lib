# Agent Instructions

## Mission

Build `fmg-lib` as a headless, deterministic, Bun-first TypeScript library with a compact, versioned world schema, while faithfully porting upstream FMG generation logic into a clean library/UI split.

## Core Rules

- Keep runtime headless: no DOM, no SVG, no jQuery in library code.
- Preserve strict UI/runtime separation.
- Prefer explicit inputs and outputs over implicit globals.
- Keep generation deterministic by seed.
- Keep dense world data in typed arrays.
- Keep public API stable and versioned unless parity work requires a justified interface change.
- Use Bun as the only package manager / task runner / script runner for this repo.
- Do not use npm, pnpm, or yarn for install, build, test, or script execution.

## TypeScript Rules

- Keep `strict` mode on.
- Avoid `any`; prefer `unknown` at boundaries and narrow with type guards.
- Model variants as discriminated unions and use exhaustive switches.
- Keep function signatures explicit at public boundaries.
- Prefer union parameter types over overloads when possible.
- Use as few generics as possible, and only when type parameters relate values.
- Validate runtime inputs at boundaries, then work with narrowed trusted types.
- Prefer immutable returns from core APIs when practical.

## Testing Rules

- Follow Red-Green-Refactor for meaningful feature work.
- Prefer high-level parity and invariants tests over arbitrary thresholds and clone-style fixture guessing.
- Every meaningful code change must include tests or update existing tests.
- For world-gen parity, upstream FMG is the oracle.
- Screenshot automation is not enough: inspect the resulting images and use them to guide fixes.

## Issue Tracking

This project uses **bd (beads)** for issue tracking.
Run `bd prime` for workflow context.

Quick reference:
- `bd ready --json` - find unblocked work
- `bd create "Title" --type task --priority 2 --json` - create issue
- `bd update <id> --claim --json` - claim issue
- `bd close <id> --reason "Done" --json` - complete issue
- `bd sync` - sync local bead state

Rules:
- Use `bd` for all task tracking from now on.
- Always use `--json` for programmatic usage.
- Do not create or rely on markdown TODO trackers for active work management.

## Workflow Cadence

- For UI-affecting increments, follow the Playwright screenshot loop: implement, render, capture, inspect, then commit.
- Save screenshot artifacts under `screenshots/` for traceable progress.
- At each major milestone, capture comparison screenshots from upstream FMG and this implementation to monitor visual drift.
- Report parity as `previous -> current` whenever sharing metrics.
- Commit and push in small, frequent increments after verified progress.

## Shell Safety

- Always use non-interactive flags with file operations to avoid hanging prompts.
- Use `cp -f`, `mv -f`, `rm -f`, `rm -rf`, `cp -rf` where applicable.

## Definition of Done

- `bun run typecheck` passes.
- Relevant `bun test ...` commands pass.
- Parity checks are rerun when generation logic changes.
- Screenshots are rerun and visually inspected when UI-visible behavior changes.
- Docs and public API are updated when behavior changes.
- Work is committed and pushed.
