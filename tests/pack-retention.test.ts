import { describe, expect, test } from "bun:test";
import {
  runOpenNearSeaLakesStage,
  runPackFeatureStage,
  runPackStage,
} from "../src/internal/stages";
import type {
  GenerationContext,
  NormalizedGenerationConfig,
} from "../src/types";

const config: NormalizedGenerationConfig = {
  seed: "pack-retention-test",
  width: 100,
  height: 100,
  requestedCells: 4,
  culturesCount: 1,
  statesCount: null,
  townsCount: null,
  jitter: 0,
  heightNoise: 0,
  heightTemplate: "continents",
  seaLevel: 20,
  hiddenControls: {
    sizeVariety: 1,
    growthRate: 1,
    statesGrowthRate: 1,
    provincesRatio: 40,
    religionsNumber: null,
    cellsDesired: 4,
  },
  climate: {
    temperatureEquator: 27,
    temperatureNorthPole: -30,
    temperatureSouthPole: -15,
    elevationExponent: 1.8,
    lakeElevationLimit: 20,
    precipitation: 100,
    mapSize: 100,
    latitude: 50,
    longitude: 50,
    winds: [225, 45, 225, 315, 135, 315],
  },
  layers: {
    physical: true,
    cultures: true,
    settlements: true,
    politics: true,
    religions: true,
    military: false,
    markers: false,
    zones: false,
  },
};

const createContext = (): GenerationContext => {
  return {
    config,
    random: () => 0.5,
    grid: {
      spacing: 30,
      cellsX: 2,
      cellsY: 2,
    },
    internal: {
      cultureTypes: ["Generic"],
      burgPackIds: new Uint32Array(1),
      packRetentionCoast: null,
      packRetentionWaterType: null,
      packHavenPack: null,
      packCellsFlow: null,
      packCellsRiver: null,
      packCellsConfluence: null,
      packCellsBiome: null,
      packCellsH: null,
      packCellsCulture: null,
      packFeatureLakeGroup: null,
      cultureCenterPack: null,
    },
    world: {
      cellCount: 4,
      cellsX: new Float32Array([20, 50, 80, 50]),
      cellsY: new Float32Array([20, 20, 20, 60]),
      cellsBorder: new Uint8Array(4),
      cellsArea: new Float32Array(4),
      cellsH: new Uint8Array([19, 20, 19, 30]),
      cellsCulture: new Uint16Array(4),
      cultureCount: 0,
      cultureSeedCell: new Uint32Array(1),
      cultureSize: new Uint32Array(1),
      cellsBurg: new Uint16Array(4),
      burgCount: 0,
      burgCell: new Uint32Array(1),
      burgX: new Float32Array(1),
      burgY: new Float32Array(1),
      burgPopulation: new Uint16Array(1),
      burgCapital: new Uint8Array(1),
      burgPort: new Uint8Array(1),
      burgCulture: new Uint16Array(1),
      cellsState: new Uint16Array(4),
      stateCount: 0,
      stateCenterBurg: new Uint16Array(1),
      stateCulture: new Uint16Array(1),
      stateForm: new Uint8Array(1),
      stateCells: new Uint32Array(1),
      routeCount: 0,
      routeFromState: new Uint16Array(1),
      routeToState: new Uint16Array(1),
      routeKind: new Uint8Array(1),
      routeWeight: new Uint16Array(1),
      cellRouteOffsets: new Uint32Array(5),
      cellRouteNeighbors: new Uint32Array(0),
      cellRouteKinds: new Uint8Array(0),
      cellsProvince: new Uint16Array(4),
      provinceCount: 0,
      provinceState: new Uint16Array(1),
      provinceCenterCell: new Uint32Array(1),
      provinceCells: new Uint32Array(1),
      cellsReligion: new Uint16Array(4),
      religionCount: 0,
      religionSeedCell: new Uint32Array(1),
      religionType: new Uint8Array(1),
      religionSize: new Uint32Array(1),
      cellsMilitary: new Uint16Array(4),
      militaryCount: 0,
      militaryCell: new Uint32Array(1),
      militaryState: new Uint16Array(1),
      militaryType: new Uint8Array(1),
      militaryStrength: new Uint16Array(1),
      markerCount: 0,
      markerCell: new Uint32Array(1),
      markerType: new Uint8Array(1),
      markerStrength: new Uint8Array(1),
      cellsZone: new Uint16Array(4),
      zoneCount: 0,
      zoneSeedCell: new Uint32Array(1),
      zoneType: new Uint8Array(1),
      zoneCells: new Uint32Array(1),
      cellsFeature: new Uint8Array([0, 1, 0, 1]),
      cellsFeatureId: new Uint32Array(4),
      featureCount: 0,
      featureType: new Uint8Array(1),
      featureGroup: new Uint8Array(1),
      featureLand: new Uint8Array(1),
      featureBorder: new Uint8Array(1),
      featureSize: new Uint32Array(1),
      featureFirstCell: new Uint32Array(1),
      cellsCoast: new Int8Array([-1, 1, -1, 2]),
      cellsLandmass: new Uint32Array(4),
      landmassCount: 0,
      landmassKind: new Uint8Array(1),
      landmassSize: new Uint32Array(1),
      landmassBorder: new Uint8Array(1),
      cellsTemp: new Int8Array(4),
      cellsPrec: new Uint8Array(4),
      cellsFlow: new Uint32Array(4),
      cellsRiver: new Uint32Array(4),
      cellsBiome: new Uint8Array(4),
      cellsWaterbody: new Uint32Array([1, 0, 2, 0]),
      waterbodyCount: 2,
      waterbodyType: new Uint8Array([0, 2, 1]),
      waterbodyGroup: new Uint8Array([0, 4, 3]),
      waterbodySize: new Uint32Array([0, 1, 1]),
      packCellCount: 0,
      gridToPack: new Int32Array(4),
      packToGrid: new Uint32Array(0),
      packX: new Float32Array(0),
      packY: new Float32Array(0),
      packH: new Uint8Array(0),
      packArea: new Float32Array(0),
      packNeighborOffsets: new Uint32Array(1),
      packNeighbors: new Uint32Array(0),
      packCellsFeatureId: new Uint32Array(0),
      packFeatureCount: 0,
      packFeatureType: new Uint8Array(1),
      packFeatureFeatureId: new Uint32Array(1),
      packFeatureBorder: new Uint8Array(1),
      packFeatureSize: new Uint32Array(1),
      packFeatureFirstCell: new Uint32Array(1),
      packFeatureGroup: new Uint8Array(1),
      packFeatureChainOffsets: new Uint32Array(1),
      packFeatureVertexOffsets: new Uint32Array(1),
      packFeatureVertices: new Uint32Array(0),
      packFeatureShorelineOffsets: new Uint32Array(1),
      packFeatureShoreline: new Uint32Array(0),
      packCoast: new Int8Array(0),
      packHaven: new Int32Array(0),
      packHarbor: new Uint8Array(0),
      packVertexX: new Float32Array(0),
      packVertexY: new Float32Array(0),
      packCellVertexOffsets: new Uint32Array(1),
      packCellVertices: new Uint32Array(0),
      vertexX: new Float32Array(0),
      vertexY: new Float32Array(0),
      cellVertexOffsets: new Uint32Array(5),
      cellVertices: new Uint32Array(0),
      cellNeighborOffsets: new Uint32Array([0, 2, 5, 7, 10]),
      cellNeighbors: new Uint32Array([1, 3, 0, 2, 3, 1, 3, 0, 1, 2]),
    },
  };
};

describe("packed retention", () => {
  test("keeps pre-regraph coastal retention after opening near-sea lakes", () => {
    const context = createContext();

    expect(runOpenNearSeaLakesStage(context)).toBe(true);
    expect(context.internal.packRetentionCoast?.[1]).toBe(-1);

    context.world.cellsCoast[1] = -3;
    runPackStage(context);

    expect(context.world.gridToPack[1]).toBeGreaterThanOrEqual(0);
    expect(Array.from(context.world.packToGrid)).toContain(1);
  });

  test("stores exact packed haven ids for hydrology", () => {
    const context = createContext();

    runPackStage(context);
    runPackFeatureStage(context);

    const coastalPackId = context.world.gridToPack[1] ?? -1;
    const havenGridCell =
      coastalPackId >= 0 ? (context.world.packHaven[coastalPackId] ?? -1) : -1;
    const havenPackId =
      coastalPackId >= 0
        ? (context.internal.packHavenPack?.[coastalPackId] ?? -1)
        : -1;

    expect(coastalPackId).toBeGreaterThanOrEqual(0);
    expect(havenPackId).toBeGreaterThanOrEqual(0);
    expect(context.world.packToGrid[havenPackId]).toBe(havenGridCell);
  });
});
