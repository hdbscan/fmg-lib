# Upstream Update Protocol

This project does not auto-track upstream FMG. If we intentionally refresh source references:

1. Clone upstream into `tmp/` at a specific commit.
2. Record the commit hash in `docs/migration-plan.md`.
3. Update `docs/upstream-file-map.md` for any moved/renamed modules.
4. Re-evaluate stage order differences in `public/main.js`.
5. Re-run determinism integration tests and update fixtures only with explicit notes.
6. Document intentional divergences in changelog.

Do not merge upstream changes directly into runtime code without preserving headless constraints.
