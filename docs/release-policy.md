# Release Policy

## Versioning

Use semver for package versions and explicit schema versioning for world data.

- **MAJOR**: breaking API changes or incompatible schema migration behavior.
- **MINOR**: backward-compatible feature additions.
- **PATCH**: bug fixes and deterministic behavior fixes that preserve API/schema.

`WorldGraph.schemaVersion` is independent from package semver and changes only when persistence format compatibility changes.

## Changelog Process

Every release entry should include:

- API changes
- schema changes
- determinism-impacting changes
- migration notes (if any)

## Release Checklist

1. Run `bun run check`.
2. Run `bun run release:check`.
3. Update changelog section.
4. Tag release version.
5. Publish package.
