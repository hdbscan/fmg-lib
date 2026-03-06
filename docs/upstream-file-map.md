# Upstream File Map (Extraction Scope)

Snapshot source: `Azgaar/Fantasy-Map-Generator` @ `634c7dba4bca06a73f8d53c3806805dc84d08551`

## Primary orchestration source

- `public/main.js` (generation order and stage dependencies)

## Utility sources

- `src/utils/graphUtils.ts` (grid placement, Voronoi helpers)
- `src/utils/index.ts` (global helper exposure and utility exports)

## Generation modules (priority order)

- `src/modules/heightmap-generator.ts`
- `src/modules/features.ts`
- `src/modules/lakes.ts`
- `src/modules/river-generator.ts`
- `src/modules/biomes.ts`

## Human geography modules (later phases)

- `src/modules/cultures-generator.ts`
- `src/modules/burgs-generator.ts`
- `src/modules/states-generator.ts`
- `src/modules/routes-generator.ts`
- `src/modules/religions-generator.ts`
- `src/modules/provinces-generator.ts`
- `src/modules/military-generator.ts`
- `src/modules/markers-generator.ts`
- `src/modules/zones-generator.ts`

## Excluded from headless runtime

- `src/renderers/*`
- UI and editor modules loaded in `src/index.html`
