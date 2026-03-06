# Adding a Generation Stage

## Workflow

1. Add/extend an integration test in `tests/*.integration.test.ts` that fails (Red).
2. Add stage implementation under `src/internal/`.
3. Wire stage in `generateWorld` order.
4. Keep stage input/output explicit via `GenerationContext`.
5. Refactor only after tests pass (Green -> Refactor).

## Stage Contract

- Input: current `GenerationContext`.
- Output: mutate only the stage-owned fields in `context.world`.
- Determinism: never use `Math.random`; use `context.random`.
- Validation: rely on normalized config, avoid stage-specific implicit defaults.

## Guardrails

- No DOM APIs.
- No hidden globals.
- No object-per-cell structures for dense data.
- Prefer typed arrays and compact adjacency formats.

## Checklist for PRs

- [ ] integration test added/updated first
- [ ] stage deterministic for same seed/config
- [ ] schema changes documented in `docs/usage.md`
- [ ] roadmap updated in `docs/todo.md`
