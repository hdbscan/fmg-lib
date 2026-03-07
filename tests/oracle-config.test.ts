import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "../src/internal/config";
import {
  buildGenerationConfigFromOracle,
  mapUpstreamTemplateToHeightTemplate,
} from "../src/internal/oracle-config";
import type { ParitySnapshot } from "../src/parity";

const baseOracle: ParitySnapshot = {
  kind: "upstream-oracle",
  seed: "oracle-seed",
  width: 100,
  height: 80,
  gridSpacing: 10,
  terrain: {
    mesh: {
      vertices: [
        [0, 0],
        [100, 0],
        [100, 80],
        [0, 80],
      ],
      polygons: [[0, 1, 2, 3]],
    },
    land: [1],
  },
  regions: {
    vertices: [
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80],
    ],
    polygons: [[0, 1, 2, 3]],
    states: [1],
    religions: [1],
  },
  burgs: [],
  counts: {
    landmasses: 1,
    states: 1,
    religions: 1,
    burgs: 0,
  },
  sourceUrl: "fixture",
};

describe("oracle config replay", () => {
  test("maps upstream templates onto supported local templates", () => {
    expect(mapUpstreamTemplateToHeightTemplate("continents")).toBe(
      "continents",
    );
    expect(mapUpstreamTemplateToHeightTemplate("highIsland")).toBe(
      "highIsland",
    );
    expect(mapUpstreamTemplateToHeightTemplate("mediterranean")).toBe(
      "mediterranean",
    );
    expect(mapUpstreamTemplateToHeightTemplate("world")).toBeUndefined();
  });

  test("replays oracle template and climate controls into generation config", () => {
    const config = buildGenerationConfigFromOracle({
      ...baseOracle,
      cultureCount: 9,
      heightmapTemplate: "highIsland",
      statesNumber: 14,
      townsNumber: 1000,
      sizeVariety: 5,
      growthRate: 1.7,
      statesGrowthRate: 1.35,
      provincesRatio: 72,
      religionsNumber: 8,
      temperatureEquator: 31,
      temperatureNorthPole: -27,
      temperatureSouthPole: -12,
      elevationExponent: 1.8,
      lakeElevationLimit: 24,
      precipitation: 130,
      mapSize: 88,
      latitude: 44,
      longitude: 52,
      winds: [225, 45, 225, 315, 135, 315],
    });

    expect(config.heightTemplate).toBe("highIsland");
    expect(config.culturesCount).toBe(9);
    expect(config.statesCount).toBe(14);
    expect(config.townsCount).toBe(1000);
    expect(config.hiddenControls).toEqual({
      sizeVariety: 5,
      growthRate: 1.7,
      statesGrowthRate: 1.35,
      provincesRatio: 72,
      religionsNumber: 8,
      cellsDesired: 100,
    });
    expect(config.climate).toEqual({
      temperatureEquator: 31,
      temperatureNorthPole: -27,
      temperatureSouthPole: -12,
      elevationExponent: 1.8,
      lakeElevationLimit: 24,
      precipitation: 130,
      mapSize: 88,
      latitude: 44,
      longitude: 52,
      winds: [225, 45, 225, 315, 135, 315],
    });
  });

  test("derives requested cells from upstream grid spacing", () => {
    const config = buildGenerationConfigFromOracle({
      ...baseOracle,
      width: 1280,
      height: 900,
      gridSpacing: 10.73,
      terrain: {
        ...baseOracle.terrain,
        mesh: {
          ...baseOracle.terrain.mesh,
          polygons: Array.from({ length: 9996 }, () => [0, 1, 2, 3]),
        },
      },
    });

    expect(config.cells).toBe(10006);
  });

  test("accepts exact upstream terrain template ids in normalized config", () => {
    const normalized = normalizeConfig({
      seed: "exact-template",
      width: 100,
      height: 80,
      cells: 100,
      heightTemplate: "fractious",
    });

    expect(normalized.heightTemplate).toBe("fractious");
  });

  test("uses upstream elevation exponent default in normalized config", () => {
    const normalized = normalizeConfig({
      seed: "default-climate",
      width: 100,
      height: 80,
      cells: 100,
    });

    expect(normalized.climate.elevationExponent).toBe(1.8);
  });

  test("uses upstream political control defaults in normalized config", () => {
    const normalized = normalizeConfig({
      seed: "default-politics",
      width: 100,
      height: 80,
      cells: 100,
    });

    expect(normalized.hiddenControls.statesGrowthRate).toBe(1);
    expect(normalized.hiddenControls.provincesRatio).toBe(40);
  });
});
