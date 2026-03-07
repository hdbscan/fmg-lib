import type {
  GenerationConfig,
  HeightTemplate,
  LayerFlags,
  NormalizedGenerationConfig,
} from "../types";

const HEIGHT_TEMPLATES: HeightTemplate[] = [
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
];

const DEFAULT_LAYERS: LayerFlags = {
  physical: true,
  cultures: false,
  settlements: false,
  politics: false,
  religions: false,
  military: false,
  markers: false,
  zones: false,
};

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

const inRange = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max;

export const normalizeConfig = (
  config: GenerationConfig,
): NormalizedGenerationConfig => {
  if (config.seed.trim().length === 0) {
    throw new Error("seed must be a non-empty string");
  }

  if (!isPositiveInteger(config.width)) {
    throw new Error("width must be a positive integer");
  }

  if (!isPositiveInteger(config.height)) {
    throw new Error("height must be a positive integer");
  }

  if (!isPositiveInteger(config.cells)) {
    throw new Error("cells must be a positive integer");
  }

  const culturesCount = config.culturesCount ?? 12;
  if (!Number.isInteger(culturesCount) || !inRange(culturesCount, 1, 512)) {
    throw new Error("culturesCount must be an integer within [1, 512]");
  }

  const statesCount = config.statesCount ?? null;
  if (
    statesCount !== null &&
    (!Number.isInteger(statesCount) || !inRange(statesCount, 1, 512))
  ) {
    throw new Error("statesCount must be an integer within [1, 512]");
  }

  const townsCount = config.townsCount ?? null;
  if (
    townsCount !== null &&
    (!Number.isInteger(townsCount) || !inRange(townsCount, 0, 20000))
  ) {
    throw new Error("townsCount must be an integer within [0, 20000]");
  }

  const jitter = config.jitter ?? 0.9;
  if (!inRange(jitter, 0, 1)) {
    throw new Error("jitter must be within [0, 1]");
  }

  const heightNoise = config.heightNoise ?? 0;
  if (!inRange(heightNoise, 0, 1)) {
    throw new Error("heightNoise must be within [0, 1]");
  }

  const heightTemplate = config.heightTemplate ?? "continents";
  if (!HEIGHT_TEMPLATES.includes(heightTemplate)) {
    throw new Error(
      "heightTemplate must be one of: volcano, highIsland, lowIsland, continents, archipelago, atoll, mediterranean, peninsula, pangea, isthmus, shattered, taklamakan, oldWorld, fractious",
    );
  }

  const seaLevel = config.seaLevel ?? 20;
  if (!Number.isInteger(seaLevel) || !inRange(seaLevel, 1, 99)) {
    throw new Error("seaLevel must be an integer within [1, 99]");
  }

  const sizeVariety = config.hiddenControls?.sizeVariety ?? 2;
  if (!inRange(sizeVariety, 0, 10)) {
    throw new Error("hiddenControls.sizeVariety must be within [0, 10]");
  }

  const growthRate = config.hiddenControls?.growthRate ?? 1;
  if (!inRange(growthRate, 0.1, 2)) {
    throw new Error("hiddenControls.growthRate must be within [0.1, 2]");
  }

  const statesGrowthRate = config.hiddenControls?.statesGrowthRate ?? 1;
  if (!inRange(statesGrowthRate, 0.1, 3)) {
    throw new Error("hiddenControls.statesGrowthRate must be within [0.1, 3]");
  }

  const provincesRatio = config.hiddenControls?.provincesRatio ?? 40;
  if (!inRange(provincesRatio, 0, 100)) {
    throw new Error("hiddenControls.provincesRatio must be within [0, 100]");
  }

  const religionsNumber = config.hiddenControls?.religionsNumber ?? null;
  if (
    religionsNumber !== null &&
    (!Number.isInteger(religionsNumber) || !inRange(religionsNumber, 0, 50))
  ) {
    throw new Error(
      "hiddenControls.religionsNumber must be an integer within [0, 50]",
    );
  }

  const temperatureEquator = config.climate?.temperatureEquator ?? 27;
  const temperatureNorthPole = config.climate?.temperatureNorthPole ?? -30;
  const temperatureSouthPole = config.climate?.temperatureSouthPole ?? -15;
  const elevationExponent = config.climate?.elevationExponent ?? 1.8;
  const lakeElevationLimit = config.climate?.lakeElevationLimit ?? 20;
  const precipitation = config.climate?.precipitation ?? 100;
  const mapSize = config.climate?.mapSize ?? 100;
  const latitude = config.climate?.latitude ?? 50;
  const longitude = config.climate?.longitude ?? 50;
  const winds = (config.climate?.winds ?? [
    225, 45, 225, 315, 135, 315,
  ]) as readonly [number, number, number, number, number, number];

  if (!inRange(elevationExponent, 0.5, 3)) {
    throw new Error("climate.elevationExponent must be within [0.5, 3]");
  }

  if (
    !Number.isInteger(lakeElevationLimit) ||
    !inRange(lakeElevationLimit, 0, 80)
  ) {
    throw new Error(
      "climate.lakeElevationLimit must be an integer within [0, 80]",
    );
  }

  if (!inRange(precipitation, 5, 500)) {
    throw new Error("climate.precipitation must be within [5, 500]");
  }

  if (!inRange(mapSize, 1, 100)) {
    throw new Error("climate.mapSize must be within [1, 100]");
  }

  if (!inRange(latitude, 0, 100)) {
    throw new Error("climate.latitude must be within [0, 100]");
  }

  if (!inRange(longitude, 0, 100)) {
    throw new Error("climate.longitude must be within [0, 100]");
  }

  if (winds.length !== 6 || winds.some((value) => !inRange(value, 0, 360))) {
    throw new Error("climate.winds must contain 6 values within [0, 360]");
  }

  const layers: LayerFlags = {
    ...DEFAULT_LAYERS,
    ...(config.layers ?? {}),
  };

  return {
    seed: config.seed,
    width: config.width,
    height: config.height,
    requestedCells: config.cells,
    culturesCount,
    statesCount,
    townsCount,
    jitter,
    heightNoise,
    heightTemplate,
    seaLevel,
    hiddenControls: {
      sizeVariety,
      growthRate,
      statesGrowthRate,
      provincesRatio,
      religionsNumber,
    },
    climate: {
      temperatureEquator,
      temperatureNorthPole,
      temperatureSouthPole,
      elevationExponent,
      lakeElevationLimit,
      precipitation,
      mapSize,
      latitude,
      longitude,
      winds,
    },
    layers,
  };
};
