# Schema Compatibility Matrix

## Current

- Active schema: `WorldGraphV1`
- Serialized format discriminator: `schemaVersion`

## Matrix

| Reader \ Data | v1 |
| --- | --- |
| v1 reader | native |

## Policy

- New schema versions must add a dedicated deserializer entry.
- Existing readers may reject unknown versions with clear errors.
- Version migrations should be explicit and test-covered.

## Required checks for new versions

1. round-trip tests for new schema
2. compatibility tests for older schema inputs
3. changelog entry documenting migration behavior
