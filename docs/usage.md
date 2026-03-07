# Usage

## Basic generation

```ts
import { generateWorld } from "fmg-lib";

const world = generateWorld({
  seed: "campaign-001",
  width: 1600,
  height: 1000,
  cells: 20000,
});
```

## Config options

```ts
const world = generateWorld({
  seed: "campaign-001",
  width: 1600,
  height: 1000,
  cells: 20000,
  culturesCount: 12,
  jitter: 0.9,
  heightNoise: 0,
  heightTemplate: "continents", // or "archipelago" | "inland-sea"
  seaLevel: 20,
  climate: {
    temperatureEquator: 27,
    temperatureNorthPole: -30,
    temperatureSouthPole: -15,
    elevationExponent: 1,
  },
  layers: {
    physical: true,
    cultures: true,
    settlements: true,
    politics: true,
    religions: true,
    military: true,
    markers: true,
    zones: true,
  },
});
```

## Output

`WorldGraphV1` returns typed arrays for compact storage:

- `cellsX`, `cellsY`, `cellsH`
- `cellsBorder`
- `cellsArea`
- `cellsFeature`, `cellsCoast`
- `cellsFeatureId`, `featureType`, `featureLand`, `featureBorder`, `featureSize`, `featureFirstCell`
- `cellsBurg`, `burgCell`, `burgPopulation`, `burgPort`, `burgCulture`
- `cellsState`, `stateCenterBurg`, `stateCulture`, `stateForm`, `stateCells`
- `routeFromState`, `routeToState`, `routeKind`, `routeWeight`
- `cellsProvince`, `provinceState`, `provinceCenterCell`, `provinceCells`
- `cellsReligion`, `religionSeedCell`, `religionType`, `religionSize`
- `cellsMilitary`, `militaryCell`, `militaryState`, `militaryType`, `militaryStrength`
- `markerCell`, `markerType`, `markerStrength`
- `cellsZone`, `zoneSeedCell`, `zoneType`, `zoneCells`
- `cellsLandmass`, `landmassKind`, `landmassSize`, `landmassBorder`
- `cellsTemp`, `cellsPrec`
- `cellsFlow`, `cellsRiver`, `cellsBiome`
- `cellsWaterbody`, `waterbodyType`, `waterbodySize`
- `gridToPack`, `packToGrid`, `packNeighborOffsets`, `packNeighbors`
- `packCellsFeatureId`, `packFeatureType`, `packFeatureBorder`, `packFeatureSize`, `packFeatureFirstCell`
- `packCoast`, `packHaven`, `packHarbor`
- `vertexX`, `vertexY`, `cellVertexOffsets`, `cellVertices`
- `cellNeighborOffsets`, `cellNeighbors`

Plus metadata:

- `schemaVersion`
- `gridSpacing`, `gridCellsX`, `gridCellsY`
- `requestedCells`, `cellCount`

## Notes

- Deterministic: same seed + config -> same output.
- Headless: no DOM APIs or renderer dependencies.
- Physical pipeline is implemented.
- Optional human-geography layers are supported behind flags: `cultures`, `settlements`, `politics`, `religions`, `military`, `markers`, and `zones`.
- Settlement placement favors fertile river and harbor cells, and political states expand across pack-cell adjacency instead of direct nearest-capital partitioning.
- Serialization helpers are available:

```ts
import { deserializeWorld, serializeWorld } from "fmg-lib";

const encoded = serializeWorld(world);
const restored = deserializeWorld(encoded);
```
