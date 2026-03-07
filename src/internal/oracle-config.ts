import type { ParitySnapshot } from "../parity";
import type { GenerationConfig, HeightTemplate } from "../types";

const TEMPLATE_GROUPS: Readonly<Record<HeightTemplate, readonly string[]>> = {
  continents: [
    "continents",
    "pangea",
    "peninsula",
    "isthmus",
    "oldWorld",
    "fractious",
    "taklamakan",
  ],
  archipelago: [
    "archipelago",
    "volcano",
    "highIsland",
    "lowIsland",
    "atoll",
    "shattered",
  ],
  "inland-sea": ["mediterranean"],
};

export const mapUpstreamTemplateToHeightTemplate = (
  template: string | undefined,
): HeightTemplate | undefined => {
  if (!template) {
    return undefined;
  }

  for (const [heightTemplate, upstreamTemplates] of Object.entries(
    TEMPLATE_GROUPS,
  ) as Array<[HeightTemplate, readonly string[]]>) {
    if (upstreamTemplates.includes(template)) {
      return heightTemplate;
    }
  }

  return undefined;
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
    ...(oracle.religionsNumber !== undefined
      ? { religionsNumber: oracle.religionsNumber }
      : {}),
  };

  return {
    seed: oracle.seed,
    width: oracle.width,
    height: oracle.height,
    cells: oracle.terrain.mesh.polygons.length,
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
