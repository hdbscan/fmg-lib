import { normalizeConfig } from "./internal/config";
import { createAlea } from "./internal/random";
import {
  runBiomeStage,
  runBurgGenerationStage,
  runBurgSpecificationStage,
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
  runPackFeatureMetadataStage,
  runPackFeatureStage,
  runPackStage,
  runProvincesStage,
  runReligionsStage,
  runRoutesStage,
  runStateFormsStage,
  runStatesStage,
  runWaterbodyStage,
} from "./internal/stages";
import {
  buildPhysicalDiagnosticsFromWorld,
  capturePhysicalDiagnosticStep,
} from "./physical-harness";
import {
  buildTerrainDiagnosticsFromWorld,
  captureTerrainDiagnosticStep,
} from "./terrain-harness";
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
export {
  buildPhysicalDiagnosticsFromWorld,
  capturePhysicalDiagnosticStep,
  comparePhysicalDiagnostics,
  type PhysicalDiagnosticStep,
  type PhysicalDiagnostics,
  type PhysicalDiagnosticsComparison,
  type PhysicalStepComparison,
} from "./physical-harness";
export {
  buildTerrainDiagnosticsFromWorld,
  captureTerrainDiagnosticStep,
  compareTerrainDiagnostics,
  type TerrainDiagnosticStep,
  type TerrainDiagnostics,
  type TerrainDiagnosticsComparison,
  type TerrainStepComparison,
} from "./terrain-harness";
import type { PhysicalDiagnostics } from "./physical-harness";
import type { TerrainDiagnostics } from "./terrain-harness";
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
    random: createAlea(config.seed),
    grid: {
      spacing: 0,
      cellsX: 0,
      cellsY: 0,
    },
    internal: {
      cultureTypes: ["Generic"],
      burgPackIds: new Uint32Array(1),
      packRetentionCoast: null,
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
      cellRouteOffsets: new Uint32Array(0),
      cellRouteNeighbors: new Uint32Array(0),
      cellRouteKinds: new Uint8Array(0),
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
      featureGroup: new Uint8Array(0),
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
      cellsRiver: new Uint32Array(0),
      cellsBiome: new Uint8Array(0),
      cellsWaterbody: new Uint32Array(0),
      waterbodyCount: 0,
      waterbodyType: new Uint8Array(0),
      waterbodyGroup: new Uint8Array(0),
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
      packFeatureFeatureId: new Uint32Array(0),
      packFeatureBorder: new Uint8Array(0),
      packFeatureSize: new Uint32Array(0),
      packFeatureFirstCell: new Uint32Array(0),
      packFeatureGroup: new Uint8Array(0),
      packFeatureChainOffsets: new Uint32Array(0),
      packFeatureVertexOffsets: new Uint32Array(0),
      packFeatureVertices: new Uint32Array(0),
      packFeatureShorelineOffsets: new Uint32Array(0),
      packFeatureShoreline: new Uint32Array(0),
      packCoast: new Int8Array(0),
      packHaven: new Int32Array(0),
      packHarbor: new Uint8Array(0),
      packVertexX: new Float32Array(0),
      packVertexY: new Float32Array(0),
      packCellVertexOffsets: new Uint32Array(0),
      packCellVertices: new Uint32Array(0),
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
    cellRouteOffsets: world.cellRouteOffsets,
    cellRouteNeighbors: world.cellRouteNeighbors,
    cellRouteKinds: world.cellRouteKinds,
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
    featureGroup: world.featureGroup,
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
    waterbodyGroup: world.waterbodyGroup,
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
    packFeatureFeatureId: world.packFeatureFeatureId,
    packFeatureBorder: world.packFeatureBorder,
    packFeatureSize: world.packFeatureSize,
    packFeatureFirstCell: world.packFeatureFirstCell,
    packFeatureGroup: world.packFeatureGroup,
    packFeatureChainOffsets: world.packFeatureChainOffsets,
    packFeatureVertexOffsets: world.packFeatureVertexOffsets,
    packFeatureVertices: world.packFeatureVertices,
    packFeatureShorelineOffsets: world.packFeatureShorelineOffsets,
    packFeatureShoreline: world.packFeatureShoreline,
    packCoast: world.packCoast,
    packHaven: world.packHaven,
    packHarbor: world.packHarbor,
    packVertexX: world.packVertexX,
    packVertexY: world.packVertexY,
    packCellVertexOffsets: world.packCellVertexOffsets,
    packCellVertices: world.packCellVertices,
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
  runPackFeatureMetadataStage(context);
  runBiomeStage(context);

  if (context.config.layers.cultures) {
    runCulturesStage(context);
  }

  if (
    context.config.layers.settlements ||
    context.config.layers.politics ||
    context.config.layers.military
  ) {
    runBurgGenerationStage(context);
  }

  if (context.config.layers.politics) {
    runStatesStage(context);
    runRoutesStage(context);
  }

  if (context.config.layers.religions) {
    runReligionsStage(context);
  }

  if (
    context.config.layers.settlements ||
    context.config.layers.politics ||
    context.config.layers.military
  ) {
    runBurgSpecificationStage(context);
  }

  if (context.config.layers.politics) {
    runStateFormsStage(context);
    runProvincesStage(context);
  }

  if (context.config.layers.military) {
    runMilitaryStage(context);
  }

  if (context.config.layers.markers || context.config.layers.zones) {
    runMarkersZonesStage(context);
  }

  return toWorldGraph(context);
};

export const generateTerrainDiagnostics = (
  options: GenerateOptions,
): TerrainDiagnostics => {
  const config = normalizeConfig(options);
  const context = createContext(config);

  runGridStage(context);

  const steps = [
    captureTerrainDiagnosticStep(
      context.world,
      "grid",
      "Grid",
      config.seaLevel,
    ),
  ];

  runHeightmapStage(context, (key, label) => {
    steps.push(
      captureTerrainDiagnosticStep(context.world, key, label, config.seaLevel),
    );
  });

  steps.push(
    captureTerrainDiagnosticStep(
      context.world,
      "heightmap:complete",
      "Heightmap complete",
      config.seaLevel,
    ),
  );

  if (runDeepDepressionLakeStage(context)) {
    steps.push(
      captureTerrainDiagnosticStep(
        context.world,
        "terrain:deep-depression-lakes",
        "Deep depression lakes",
        config.seaLevel,
      ),
    );
  }

  runFeatureStage(context);
  steps.push(
    captureTerrainDiagnosticStep(
      context.world,
      "terrain:feature-coast",
      "Feature coast mask",
      config.seaLevel,
    ),
  );

  return buildTerrainDiagnosticsFromWorld(
    toWorldGraph(context),
    config.heightTemplate,
    config.seaLevel,
    steps,
  );
};

export const generatePhysicalDiagnostics = (
  options: GenerateOptions,
): PhysicalDiagnostics => {
  const config = normalizeConfig(options);
  const context = createContext(config);

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

  const steps = [];

  steps.push(
    capturePhysicalDiagnosticStep(
      context.world,
      "physical:pack-ready",
      "Pack ready",
    ),
  );

  runClimateStage(context, (key, label) => {
    steps.push(capturePhysicalDiagnosticStep(context.world, key, label));
  });

  runHydrologyStage(context);
  steps.push(
    capturePhysicalDiagnosticStep(
      context.world,
      "physical:hydrology",
      "Hydrology",
    ),
  );

  runPackFeatureMetadataStage(context);
  runBiomeStage(context);
  steps.push(
    capturePhysicalDiagnosticStep(context.world, "physical:biome", "Biome"),
  );

  return buildPhysicalDiagnosticsFromWorld(
    toWorldGraph(context),
    config.heightTemplate,
    config.seaLevel,
    steps,
  );
};
