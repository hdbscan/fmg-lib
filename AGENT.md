# AGENT Ground Rules

## Mission

Build `fmg-lib` as a headless, deterministic, Bun-first TypeScript library with a compact, versioned world schema.

## Core Rules

- Keep runtime headless: no DOM, no SVG, no jQuery.
- Prefer explicit inputs and outputs over implicit globals.
- Keep generation deterministic by seed.
- Keep dense world data in typed arrays.
- Keep public API stable and versioned.

## Idiomatic TypeScript Rules

Based on TypeScript official guidance:

- Enable and keep `strict` mode on.
- Avoid `any`; prefer `unknown` at boundaries and narrow with type guards.
- Model variants as discriminated unions and use exhaustive switches.
- Keep function signatures explicit at public boundaries.
- Prefer union parameter types over overloads when possible.
- Use as few generics as possible, and only when type parameters relate values.
- Validate runtime inputs at boundaries, then work with narrowed trusted types.
- Prefer immutable returns from core APIs when practical.

Reference material:

- https://www.typescriptlang.org/tsconfig/strict.html
- https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- https://www.typescriptlang.org/docs/handbook/2/functions.html

## Testing Rules (Red-Green-Refactor)

- Follow TDD for feature work:
  1. **Red**: write a failing test for behavior.
  2. **Green**: implement the smallest passing change.
  3. **Refactor**: improve design while tests stay green.
- Add deterministic tests for seeded generation.
- Add invariants tests for graph/topology integrity.
- Prefer high-level integration tests over narrow unit tests for generation stages.
- Keep tests fast and isolated.
- Every meaningful code change must include tests or update existing tests.

## Definition of Done

- `bun run typecheck` passes.
- `bun test` passes.
- New behavior is covered by tests.
- API and docs are updated when behavior changes.

## Workflow Cadence

- For UI migration increments, render and capture a Playwright CLI screenshot.
- Save screenshot artifacts under `screenshots/` for traceable progress.
- Commit and push in small, frequent increments after each verified UI step.
