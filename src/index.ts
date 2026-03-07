import { normalizeConfig } from "./internal/config";
import { createPrng } from "./internal/random";
import {
  runBiomeStage,
  runClimateStage,
  runCulturesStage,
  runDeepDepressionLakeStage,
  runFeatureStage,
  runGridFeatureMarkupStage,
  runGridStage,
  runHeightmapStage,
  runHydrologyStage,
  runLandmassStage,
  runMarkersZonesStage,
  runMilitaryStage,
  runOpenNearSeaLakesStage,
  runPackFeatureStage,
  runPackStage,
  runProvincesStage,
  runReligionsStage,
  runRoutesStage,
  runSettlementsStage,
  runStatesStage,
  runWaterbodyStage,
} from "./internal/stages";
export { deserializeWorld, serializeWorld } from "./serialization";
export {
  buildLocalParitySnapshot,
  computeParityReport,
  type BurgParityMetric,
  type CountParityMetric,
  type ParityCounts,
  type ParityReport,
  type ParitySnapshot,
  type RegionParityMetric,
} from "./parity";
import type {
  GenerationConfig,
  GenerationContext,
  HeightTemplate,
  NormalizedGenerationConfig,
  SerializedWorldV1,
  WorldGraphV1,
} from "./types";

const SCHEMA_VERSION = 1 as const;

export type GenerateOptions = GenerationConfig;
export type {
  GenerationConfig,
  HeightTemplate,
  NormalizedGenerationConfig,
  SerializedWorldV1,
  WorldGraphV1,
};

const createContext = (
  config: NormalizedGenerationConfig,
): GenerationContext => {
  return {
    config,
    random: createPrng(config.seed),
    grid: {
      spacing: 0,
      cellsX: 0,
      cellsY: 0,
    },
    world: {
      cellCount: 0,
      cellsX: new Float32Array(0),
      cellsY: new Float32Array(0),
      cellsBorder: new Uint8Array(0),
      cellsArea: new Float32Array(0),
      cellsH: new Uint8Array(0),
      cellsCulture: new Uint16Array(0),
      cultureCount: 0,
      cultureSeedCell: new Uint32Array(0),
      cultureSize: new Uint32Array(0),
      cellsBurg: new Uint16Array(0),
      burgCount: 0,
      burgCell: new Uint32Array(0),
      burgX: new Float32Array(0),
      burgY: new Float32Array(0),
      burgPopulation: new Uint16Array(0),
      burgCapital: new Uint8Array(0),
      burgPort: new Uint8Array(0),
      burgCulture: new Uint16Array(0),
      cellsState: new Uint16Array(0),
      stateCount: 0,
      stateCenterBurg: new Uint16Array(0),
      stateCulture: new Uint16Array(0),
      stateForm: new Uint8Array(0),
      stateCells: new Uint32Array(0),
      routeCount: 0,
      routeFromState: new Uint16Array(0),
      routeToState: new Uint16Array(0),
      routeKind: new Uint8Array(0),
      routeWeight: new Uint16Array(0),
      cellsProvince: new Uint16Array(0),
      provinceCount: 0,
      provinceState: new Uint16Array(0),
      provinceCenterCell: new Uint32Array(0),
      provinceCells: new Uint32Array(0),
      cellsReligion: new Uint16Array(0),
      religionCount: 0,
      religionSeedCell: new Uint32Array(0),
      religionType: new Uint8Array(0),
      religionSize: new Uint32Array(0),
      cellsMilitary: new Uint16Array(0),
      militaryCount: 0,
      militaryCell: new Uint32Array(0),
      militaryState: new Uint16Array(0),
      militaryType: new Uint8Array(0),
      militaryStrength: new Uint16Array(0),
      markerCount: 0,
      markerCell: new Uint32Array(0),
      markerType: new Uint8Array(0),
      markerStrength: new Uint8Array(0),
      cellsZone: new Uint16Array(0),
      zoneCount: 0,
      zoneSeedCell: new Uint32Array(0),
      zoneType: new Uint8Array(0),
      zoneCells: new Uint32Array(0),
      cellsFeature: new Uint8Array(0),
      cellsFeatureId: new Uint32Array(0),
      featureCount: 0,
      featureType: new Uint8Array(0),
      featureLand: new Uint8Array(0),
      featureBorder: new Uint8Array(0),
      featureSize: new Uint32Array(0),
      featureFirstCell: new Uint32Array(0),
      cellsCoast: new Int8Array(0),
      cellsLandmass: new Uint32Array(0),
      landmassCount: 0,
      landmassKind: new Uint8Array(0),
      landmassSize: new Uint32Array(0),
      landmassBorder: new Uint8Array(0),
      cellsTemp: new Int8Array(0),
      cellsPrec: new Uint8Array(0),
      cellsFlow: new Uint32Array(0),
      cellsRiver: new Uint8Array(0),
      cellsBiome: new Uint8Array(0),
      cellsWaterbody: new Uint32Array(0),
      waterbodyCount: 0,
      waterbodyType: new Uint8Array(0),
      waterbodySize: new Uint32Array(0),
      packCellCount: 0,
      gridToPack: new Int32Array(0),
      packToGrid: new Uint32Array(0),
      packX: new Float32Array(0),
      packY: new Float32Array(0),
      packH: new Uint8Array(0),
      packArea: new Float32Array(0),
      packNeighborOffsets: new Uint32Array(0),
      packNeighbors: new Uint32Array(0),
      packCellsFeatureId: new Uint32Array(0),
      packFeatureCount: 0,
      packFeatureType: new Uint8Array(0),
      packFeatureBorder: new Uint8Array(0),
      packFeatureSize: new Uint32Array(0),
      packFeatureFirstCell: new Uint32Array(0),
      packCoast: new Int8Array(0),
      packHaven: new Int32Array(0),
      packHarbor: new Uint8Array(0),
      vertexX: new Float32Array(0),
      vertexY: new Float32Array(0),
      cellVertexOffsets: new Uint32Array(0),
      cellVertices: new Uint32Array(0),
      cellNeighborOffsets: new Uint32Array(0),
      cellNeighbors: new Uint32Array(0),
    },
  };
};

const toWorldGraph = (context: GenerationContext): WorldGraphV1 => {
  const { config, grid, world } = context;

  return {
    schemaVersion: SCHEMA_VERSION,
    seed: config.seed,
    width: config.width,
    height: config.height,
    requestedCells: config.requestedCells,
    cellCount: world.cellCount,
    gridSpacing: grid.spacing,
    gridCellsX: grid.cellsX,
    gridCellsY: grid.cellsY,
    cellsX: world.cellsX,
    cellsY: world.cellsY,
    cellsBorder: world.cellsBorder,
    cellsArea: world.cellsArea,
    cellsH: world.cellsH,
    cellsCulture: world.cellsCulture,
    cultureCount: world.cultureCount,
    cultureSeedCell: world.cultureSeedCell,
    cultureSize: world.cultureSize,
    cellsBurg: world.cellsBurg,
    burgCount: world.burgCount,
    burgCell: world.burgCell,
    burgX: world.burgX,
    burgY: world.burgY,
    burgPopulation: world.burgPopulation,
    burgCapital: world.burgCapital,
    burgPort: world.burgPort,
    burgCulture: world.burgCulture,
    cellsState: world.cellsState,
    stateCount: world.stateCount,
    stateCenterBurg: world.stateCenterBurg,
    stateCulture: world.stateCulture,
    stateForm: world.stateForm,
    stateCells: world.stateCells,
    routeCount: world.routeCount,
    routeFromState: world.routeFromState,
    routeToState: world.routeToState,
    routeKind: world.routeKind,
    routeWeight: world.routeWeight,
    cellsProvince: world.cellsProvince,
    provinceCount: world.provinceCount,
    provinceState: world.provinceState,
    provinceCenterCell: world.provinceCenterCell,
    provinceCells: world.provinceCells,
    cellsReligion: world.cellsReligion,
    religionCount: world.religionCount,
    religionSeedCell: world.religionSeedCell,
    religionType: world.religionType,
    religionSize: world.religionSize,
    cellsMilitary: world.cellsMilitary,
    militaryCount: world.militaryCount,
    militaryCell: world.militaryCell,
    militaryState: world.militaryState,
    militaryType: world.militaryType,
    militaryStrength: world.militaryStrength,
    markerCount: world.markerCount,
    markerCell: world.markerCell,
    markerType: world.markerType,
    markerStrength: world.markerStrength,
    cellsZone: world.cellsZone,
    zoneCount: world.zoneCount,
    zoneSeedCell: world.zoneSeedCell,
    zoneType: world.zoneType,
    zoneCells: world.zoneCells,
    cellsFeature: world.cellsFeature,
    cellsFeatureId: world.cellsFeatureId,
    featureCount: world.featureCount,
    featureType: world.featureType,
    featureLand: world.featureLand,
    featureBorder: world.featureBorder,
    featureSize: world.featureSize,
    featureFirstCell: world.featureFirstCell,
    cellsCoast: world.cellsCoast,
    cellsLandmass: world.cellsLandmass,
    landmassCount: world.landmassCount,
    landmassKind: world.landmassKind,
    landmassSize: world.landmassSize,
    landmassBorder: world.landmassBorder,
    cellsTemp: world.cellsTemp,
    cellsPrec: world.cellsPrec,
    cellsFlow: world.cellsFlow,
    cellsRiver: world.cellsRiver,
    cellsBiome: world.cellsBiome,
    cellsWaterbody: world.cellsWaterbody,
    waterbodyCount: world.waterbodyCount,
    waterbodyType: world.waterbodyType,
    waterbodySize: world.waterbodySize,
    packCellCount: world.packCellCount,
    gridToPack: world.gridToPack,
    packToGrid: world.packToGrid,
    packX: world.packX,
    packY: world.packY,
    packH: world.packH,
    packArea: world.packArea,
    packNeighborOffsets: world.packNeighborOffsets,
    packNeighbors: world.packNeighbors,
    packCellsFeatureId: world.packCellsFeatureId,
    packFeatureCount: world.packFeatureCount,
    packFeatureType: world.packFeatureType,
    packFeatureBorder: world.packFeatureBorder,
    packFeatureSize: world.packFeatureSize,
    packFeatureFirstCell: world.packFeatureFirstCell,
    packCoast: world.packCoast,
    packHaven: world.packHaven,
    packHarbor: world.packHarbor,
    vertexX: world.vertexX,
    vertexY: world.vertexY,
    cellVertexOffsets: world.cellVertexOffsets,
    cellVertices: world.cellVertices,
    cellNeighborOffsets: world.cellNeighborOffsets,
    cellNeighbors: world.cellNeighbors,
  };
};

export const generateWorld = (options: GenerateOptions): WorldGraphV1 => {
  const config = normalizeConfig(options);
  const context = createContext(config);

  if (!context.config.layers.physical) {
    throw new Error("layers.physical=false is not supported yet");
  }

  runGridStage(context);
  runHeightmapStage(context);
  runDeepDepressionLakeStage(context);
  runFeatureStage(context);
  runLandmassStage(context);
  runWaterbodyStage(context);
  if (runOpenNearSeaLakesStage(context)) {
    runFeatureStage(context);
    runLandmassStage(context);
    runWaterbodyStage(context);
  }
  runPackStage(context);
  runPackFeatureStage(context);
  runGridFeatureMarkupStage(context);
  runClimateStage(context);
  runHydrologyStage(context);
  runBiomeStage(context);

  if (context.config.layers.cultures) {
    runCulturesStage(context);
  }

  if (
    context.config.layers.settlements ||
    context.config.layers.politics ||
    context.config.layers.military
  ) {
    runSettlementsStage(context);
  }

  if (context.config.layers.politics) {
    runStatesStage(context);
    runRoutesStage(context);
    runProvincesStage(context);
  }

  if (context.config.layers.religions) {
    runReligionsStage(context);
  }

  if (context.config.layers.military) {
    runMilitaryStage(context);
  }

  if (context.config.layers.markers || context.config.layers.zones) {
    runMarkersZonesStage(context);
  }

  return toWorldGraph(context);
};
