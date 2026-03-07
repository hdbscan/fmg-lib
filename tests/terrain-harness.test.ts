import { describe, expect, test } from "bun:test";
import {
  captureTerrainDiagnosticStep,
  compareTerrainDiagnostics,
  generateTerrainDiagnostics,
} from "../src/index";

describe("terrain diagnostics", () => {
  test("captures land count, component sizes, and coast mask", () => {
    const step = captureTerrainDiagnosticStep(
      {
        cellCount: 4,
        cellsH: Uint8Array.from([30, 30, 0, 0]),
        cellNeighborOffsets: Uint32Array.from([0, 2, 4, 6, 8]),
        cellNeighbors: Uint32Array.from([1, 2, 0, 3, 0, 3, 1, 2]),
      },
      "fixture",
      "Fixture",
      20,
    );

    expect(step.landCellCount).toBe(2);
    expect(step.landComponentSizes).toEqual([2]);
    expect(step.coastMask).toEqual([1, 1, -1, -1]);
  });

  test("finds the first divergent step", () => {
    const stepOne = {
      key: "heightmap:1:Hill",
      label: "Heightmap 1 Hill",
      landCellCount: 1,
      landComponentSizes: [1],
      coastMask: [1, -1],
    };
    const stepTwo = {
      key: "heightmap:2:Hill",
      label: "Heightmap 2 Hill",
      landCellCount: 2,
      landComponentSizes: [2],
      coastMask: [1, 1],
    };
    const oracle = {
      seed: "fixture",
      width: 10,
      height: 10,
      cellCount: 2,
      heightTemplate: "continents" as const,
      seaLevel: 20,
      steps: [stepOne, stepTwo],
    };
    const local = {
      ...oracle,
      steps: [
        stepOne,
        {
          ...stepTwo,
          landCellCount: 1,
          landComponentSizes: [1],
          coastMask: [1, -1],
        },
        {
          key: "terrain:feature-coast",
          label: "Feature coast mask",
          landCellCount: 1,
          landComponentSizes: [1],
          coastMask: [1, -1],
        },
      ],
    };

    const comparison = compareTerrainDiagnostics(oracle, local);

    expect(comparison.matches).toBeFalse();
    expect(comparison.firstDivergentStep?.key).toBe("heightmap:2:Hill");
    expect(comparison.steps).toHaveLength(2);
  });

  test("generates terrain-only diagnostics from local stages", () => {
    const diagnostics = generateTerrainDiagnostics({
      seed: "terrain-diagnostics",
      width: 320,
      height: 200,
      cells: 400,
      heightTemplate: "continents",
      layers: { physical: true },
    });

    expect(diagnostics.steps.length).toBeGreaterThan(2);
    expect(diagnostics.steps[0]?.key).toBe("grid");
    expect(
      diagnostics.steps.some((step) => step.key === "heightmap:complete"),
    ).toBe(true);
    expect(
      diagnostics.steps.some((step) => step.key === "terrain:feature-coast"),
    ).toBe(true);
  });

  test("captures heightmap step snapshots from current heights", () => {
    const diagnostics = generateTerrainDiagnostics({
      seed: "42424242",
      width: 1280,
      height: 900,
      cells: 9996,
      culturesCount: 9,
      statesCount: 23,
      townsCount: 1000,
      climate: {
        lakeElevationLimit: 20,
        precipitation: 94,
        mapSize: 100,
        latitude: 50,
        longitude: 50,
      },
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    const firstHillStep = diagnostics.steps.find(
      (step) => step.key === "heightmap:1:Hill",
    );
    const completeStep = diagnostics.steps.find(
      (step) => step.key === "heightmap:complete",
    );

    expect(firstHillStep).toBeDefined();
    expect(completeStep).toBeDefined();
    expect(firstHillStep?.landCellCount).toBeGreaterThan(0);
    expect(firstHillStep?.landCellCount).toBeLessThanOrEqual(
      completeStep?.landCellCount ?? 0,
    );
  });
});
