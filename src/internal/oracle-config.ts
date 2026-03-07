import type { ParitySnapshot } from "../parity";
import type { GenerationConfig, HeightTemplate } from "../types";

const UPSTREAM_HEIGHT_TEMPLATES = new Set<HeightTemplate>([
  "volcano",
  "highIsland",
  "lowIsland",
  "continents",
  "archipelago",
  "atoll",
  "mediterranean",
  "peninsula",
  "pangea",
  "isthmus",
  "shattered",
  "taklamakan",
  "oldWorld",
  "fractious",
]);

export const mapUpstreamTemplateToHeightTemplate = (
  template: string | undefined,
): HeightTemplate | undefined => {
  return template && UPSTREAM_HEIGHT_TEMPLATES.has(template as HeightTemplate)
    ? (template as HeightTemplate)
    : undefined;
};

const deriveRequestedCellsFromOracle = (oracle: ParitySnapshot): number => {
  const { width, height, gridSpacing } = oracle;
  if (gridSpacing > 0) {
    return Math.max(1, Math.round((width * height) / gridSpacing ** 2));
  }

  return Math.max(1, oracle.terrain.mesh.polygons.length);
};

const deriveDesiredCellsFromOracle = (oracle: ParitySnapshot): number => {
  if (oracle.cellsDesired && oracle.cellsDesired > 0) {
    return oracle.cellsDesired;
  }

  const { width, height, gridSpacing } = oracle;
  if (gridSpacing > 0) {
    return Math.max(
      1,
      Math.round((width * height) / gridSpacing ** 2 / 100) * 100,
    );
  }

  return Math.max(1, deriveRequestedCellsFromOracle(oracle));
};

export const buildGenerationConfigFromOracle = (
  oracle: ParitySnapshot,
): GenerationConfig => {
  const heightTemplate = mapUpstreamTemplateToHeightTemplate(
    oracle.heightmapTemplate,
  );
  const climate = {
    ...(oracle.temperatureEquator !== undefined
      ? { temperatureEquator: oracle.temperatureEquator }
      : {}),
    ...(oracle.temperatureNorthPole !== undefined
      ? { temperatureNorthPole: oracle.temperatureNorthPole }
      : {}),
    ...(oracle.temperatureSouthPole !== undefined
      ? { temperatureSouthPole: oracle.temperatureSouthPole }
      : {}),
    ...(oracle.elevationExponent !== undefined
      ? { elevationExponent: oracle.elevationExponent }
      : {}),
    ...(oracle.lakeElevationLimit !== undefined
      ? { lakeElevationLimit: oracle.lakeElevationLimit }
      : {}),
    ...(oracle.precipitation !== undefined
      ? { precipitation: oracle.precipitation }
      : {}),
    ...(oracle.mapSize !== undefined ? { mapSize: oracle.mapSize } : {}),
    ...(oracle.latitude !== undefined ? { latitude: oracle.latitude } : {}),
    ...(oracle.longitude !== undefined ? { longitude: oracle.longitude } : {}),
    ...(oracle.winds !== undefined ? { winds: oracle.winds } : {}),
  };

  const hiddenControls = {
    ...(oracle.sizeVariety !== undefined
      ? { sizeVariety: oracle.sizeVariety }
      : {}),
    ...(oracle.growthRate !== undefined
      ? { growthRate: oracle.growthRate }
      : {}),
    ...(oracle.statesGrowthRate !== undefined
      ? { statesGrowthRate: oracle.statesGrowthRate }
      : {}),
    ...(oracle.provincesRatio !== undefined
      ? { provincesRatio: oracle.provincesRatio }
      : {}),
    ...(oracle.religionsNumber !== undefined
      ? { religionsNumber: oracle.religionsNumber }
      : {}),
    cellsDesired: deriveDesiredCellsFromOracle(oracle),
  };

  return {
    seed: oracle.seed,
    width: oracle.width,
    height: oracle.height,
    cells: deriveRequestedCellsFromOracle(oracle),
    culturesCount: Math.max(1, oracle.cultureCount ?? 12),
    ...(heightTemplate ? { heightTemplate } : {}),
    ...(oracle.statesNumber !== undefined
      ? { statesCount: oracle.statesNumber }
      : {}),
    ...(oracle.townsNumber !== undefined
      ? { townsCount: oracle.townsNumber }
      : {}),
    ...(Object.keys(hiddenControls).length > 0 ? { hiddenControls } : {}),
    ...(Object.keys(climate).length > 0 ? { climate } : {}),
    layers: {
      physical: true,
      cultures: true,
      settlements: true,
      politics: true,
      religions: true,
    },
  };
};
