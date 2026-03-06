# Architecture (Current)

## Runtime Model

`generateWorld(config)` runs a deterministic, headless pipeline with explicit state flow:

1. normalize and validate config
2. create generation context
3. run grid stage
4. run heightmap stage
5. run feature stage
6. run pack stage
7. run pack feature stage
8. run landmass stage
9. run waterbody stage
10. run grid feature markup stage
11. run climate stage
12. run hydrology stage
13. run biome stage
14. optionally run cultures stage
15. optionally run settlements stage
16. optionally run states stage
17. optionally run routes stage
18. optionally run provinces stage
19. optionally run religions stage
20. emit `WorldGraphV1`

No DOM access and no global mutable state are used in this path.

## Core Types

- `GenerationConfig`: public input contract
- `NormalizedGenerationConfig`: validated defaults-expanded config
- `GenerationContext`: internal mutable stage state
- `WorldGraphV1`: compact typed-array output

## Pipeline Stages

### Grid stage

- derives spacing from width/height/requested cells
- places jittered points on a deterministic square lattice
- builds Voronoi adjacency from Delaunay triangulation
- builds adjacency as compressed sparse rows:
  - `cellNeighborOffsets`
  - `cellNeighbors`
  - `cellsBorder`
- builds Voronoi polygon vertex buffers:
  - `vertexX`, `vertexY`
  - `cellVertexOffsets`, `cellVertices`
- computes polygon area per cell (`cellsArea`)

### Heightmap stage

- computes deterministic elevation from:
  - selected height template (`continents`, `archipelago`, `inland-sea`)
  - deterministic wave/ridge components
  - seeded noise factor

### Feature stage

- classifies cells as land or water from `seaLevel`
- computes coast distance bands (`cellsCoast`) for both land and water
- keeps feature data in typed arrays (`cellsFeature`, `cellsCoast`)

### Pack stage

- builds land-only packed cell index (`gridToPack`, `packToGrid`)
- projects per-cell attributes into packed land tables (`packX`, `packY`, `packH`, `packArea`)
- builds packed neighbor CSR (`packNeighborOffsets`, `packNeighbors`)
- derives packed coastal/naval hints (`packCoast`, `packHaven`, `packHarbor`)

### Pack feature stage

- computes connected packed-land features (`packCellsFeatureId`)
- builds packed feature tables (`packFeatureType`, `packFeatureSize`, `packFeatureBorder`, `packFeatureFirstCell`)

### Waterbody stage

- computes connected water components
- classifies waterbodies as ocean (touches border) or lake
- stores compact IDs and waterbody tables (`cellsWaterbody`, `waterbodyType`, `waterbodySize`)

### Grid feature markup stage

- merges landmass + waterbody components into unified feature ids (`cellsFeatureId`)
- builds feature table metadata (`featureType`, `featureLand`, `featureBorder`, `featureSize`, `featureFirstCell`)

### Landmass stage

- computes connected land components
- classifies landmasses as continent/island/isle
- stores compact IDs and landmass tables (`cellsLandmass`, `landmassKind`, `landmassSize`, `landmassBorder`)

### Climate stage

- computes temperature from latitude + altitude penalty
- computes precipitation from latitude moisture + elevation dryness + seeded variation

### Hydrology stage

- computes downhill drainage target per land cell
- accumulates flow from high to low elevation
- marks river cells from flow thresholds

### Biome stage

- classifies land cells from temperature and wetness bands
- boosts wetness in river cells for biome assignment
- reserves biome `0` for ocean/water

### Cultures stage (optional)

- chooses deterministic culture seed cells on packed land cells
- assigns each land cell to nearest culture seed
- stores culture IDs and size tables (`cellsCulture`, `cultureSeedCell`, `cultureSize`)

### Settlements stage (optional)

- chooses deterministic burg locations on packed land
- balances suitability (flow/climate/coast) with spacing to avoid clustering
- stores burg mappings and tables (`cellsBurg`, `burgCell`, `burgPopulation`, `burgPort`, `burgCulture`)

### States stage (optional)

- chooses deterministic state capitals from burgs
- assigns each land cell to nearest state with a culture affinity bias
- derives simple state forms and sizes (`cellsState`, `stateCenterBurg`, `stateCulture`, `stateForm`, `stateCells`)

### Routes stage (optional)

- builds deterministic inter-state routes from state-border adjacencies
- stores route tables (`routeFromState`, `routeToState`, `routeKind`, `routeWeight`)

### Provinces stage (optional)

- selects province seeds per state from capitals and large secondary burgs
- assigns land cells to nearest province center within their state
- stores province tables (`cellsProvince`, `provinceState`, `provinceCenterCell`, `provinceCells`)

### Religions stage (optional)

- selects deterministic religion seed cells from burgs / land candidates
- assigns each land cell to nearest religion seed
- stores religion tables (`cellsReligion`, `religionSeedCell`, `religionType`, `religionSize`)

### Military stage (optional)

- derives deterministic military units from burg suitability ranking
- maps units back to owning states and source cells
- stores military tables (`cellsMilitary`, `militaryCell`, `militaryState`, `militaryType`, `militaryStrength`)

### Markers and zones stage (optional)

- selects sparse deterministic marker points from scored land cells
- partitions land cells into deterministic zone regions using spatial seeds
- stores marker/zone tables (`markerCell`, `markerType`, `markerStrength`, `cellsZone`, `zoneSeedCell`, `zoneType`, `zoneCells`)

## Design Constraints

- typed arrays for dense per-cell data
- deterministic output for same seed/config
- explicit fields in output schema for version stability

## Next Architectural Milestones

- move from land-only packed graph toward full `reGraph` parity
- deepen hydrology stage toward packed-graph lakes/rivers parity
