import { describe, expect, test } from "bun:test";
import {
  computeLakeFeatureMetadata,
  computePoliticalSuitability,
  runStateFormsStage,
} from "../src/internal/political";
import type {
  GenerationContext,
  NormalizedGenerationConfig,
} from "../src/types";

const createConfig = (): NormalizedGenerationConfig => ({
  seed: "lake-metadata-test",
  width: 40,
  height: 20,
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
    religionsNumber: null,
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
});

const createContext = (): GenerationContext => {
  const cellsX = new Float32Array([5, 15, 25, 35]);
  const cellsY = new Float32Array([10, 10, 10, 10]);

  return {
    config: createConfig(),
    random: () => 0.5,
    grid: {
      spacing: 10,
      cellsX: 4,
      cellsY: 1,
    },
    internal: {
      cultureTypes: ["Generic"],
    },
    world: {
      cellCount: 4,
      cellsX,
      cellsY,
      cellsBorder: new Uint8Array(4),
      cellsArea: new Float32Array([1, 1, 1, 1]),
      cellsH: new Uint8Array([30, 19, 30, 19]),
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
      cellsFeature: new Uint8Array([1, 0, 1, 0]),
      cellsFeatureId: new Uint32Array([3, 1, 4, 2]),
      featureCount: 4,
      featureType: new Uint8Array([0, 2, 2, 3, 3]),
      featureLand: new Uint8Array([0, 0, 0, 1, 1]),
      featureBorder: new Uint8Array(5),
      featureSize: new Uint32Array([0, 1, 200, 1, 1]),
      featureFirstCell: new Uint32Array([0, 1, 3, 0, 2]),
      cellsCoast: new Int8Array([1, -1, 1, -1]),
      cellsLandmass: new Uint32Array([1, 0, 2, 0]),
      landmassCount: 2,
      landmassKind: new Uint8Array([0, 3, 3]),
      landmassSize: new Uint32Array([0, 1, 1]),
      landmassBorder: new Uint8Array(3),
      cellsTemp: new Int8Array([20, 10, 20, 25]),
      cellsPrec: new Uint8Array([100, 0, 100, 0]),
      cellsFlow: new Uint32Array([500, 0, 500, 0]),
      cellsRiver: new Uint8Array(4),
      cellsBiome: new Uint8Array([5, 0, 5, 0]),
      cellsWaterbody: new Uint32Array([0, 1, 0, 2]),
      waterbodyCount: 2,
      waterbodyType: new Uint8Array([0, 2, 2]),
      waterbodySize: new Uint32Array([0, 1, 200]),
      packCellCount: 4,
      gridToPack: new Int32Array([0, 1, 2, 3]),
      packToGrid: new Uint32Array([0, 1, 2, 3]),
      packX: cellsX,
      packY: cellsY,
      packH: new Uint8Array([30, 19, 30, 19]),
      packArea: new Float32Array([1, 1, 1, 1]),
      packNeighborOffsets: new Uint32Array([0, 1, 2, 3, 4]),
      packNeighbors: new Uint32Array([1, 0, 3, 2]),
      packCellsFeatureId: new Uint32Array([3, 1, 4, 2]),
      packFeatureCount: 4,
      packFeatureType: new Uint8Array([0, 3, 2, 3, 2]),
      packFeatureBorder: new Uint8Array(5),
      packFeatureSize: new Uint32Array([0, 1, 1, 1, 1]),
      packFeatureFirstCell: new Uint32Array([0, 0, 1, 2, 3]),
      packCoast: new Int8Array([1, -1, 1, -1]),
      packHaven: new Int32Array([1, -1, 3, -1]),
      packHarbor: new Uint8Array(4),
      packVertexX: new Float32Array(0),
      packVertexY: new Float32Array(0),
      packCellVertexOffsets: new Uint32Array([0, 0, 0, 0, 0]),
      packCellVertices: new Uint32Array(0),
      vertexX: new Float32Array(0),
      vertexY: new Float32Array(0),
      cellVertexOffsets: new Uint32Array([0, 0, 0, 0, 0]),
      cellVertices: new Uint32Array(0),
      cellNeighborOffsets: new Uint32Array([0, 1, 2, 3, 4]),
      cellNeighbors: new Uint32Array([1, 0, 3, 2]),
    },
  };
};

describe("lake suitability metadata", () => {
  test("classifies lake groups and feeds political suitability", () => {
    const context = createContext();
    const downhill = new Int32Array([1, -1, 3, -1]);

    const metadata = computeLakeFeatureMetadata(context, downhill);

    expect(metadata.outlet[1]).toBe(1);
    expect(metadata.group[1]).toBe(1);
    expect(metadata.outlet[2]).toBe(0);
    expect(metadata.group[2]).toBe(2);
    expect(metadata.evaporation[2] ?? 0).toBeGreaterThan(metadata.flux[2] ?? 0);

    const suitability = computePoliticalSuitability(context);

    expect(suitability[0] ?? 0).toBeGreaterThan(suitability[2] ?? 0);
  });

  test("derives naval republic bias from culture type instead of capital port", () => {
    const context = createContext();

    context.world.stateCount = 1;
    context.world.stateCenterBurg = new Uint16Array([0, 1]);
    context.world.stateCulture = new Uint16Array([0, 1]);
    context.world.stateCells = new Uint32Array([0, 1]);
    context.world.burgCell = new Uint32Array([0, 0]);
    context.world.burgPort = new Uint8Array([0, 1]);
    context.world.cellsReligion = new Uint16Array(4);
    context.internal.cultureTypes = ["Generic", "Generic"];

    runStateFormsStage(context);

    expect(context.world.stateForm[1]).toBe(1);
  });
});
