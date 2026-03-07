import { describe, expect, test } from "bun:test";
import {
  comparePhysicalDiagnostics,
  generatePhysicalDiagnostics,
} from "../src/index";

describe("physical diagnostics", () => {
  test("finds the first divergent physical step", () => {
    const baseStep = {
      key: "physical:pack-ready",
      label: "Pack ready",
      packToGrid: [0],
      packH: [20],
      packX100: [100],
      packY100: [200],
      temp: [5],
      prec: [10],
      flow: [0],
      river: [0],
      biome: [0],
      tempHash: "a",
      precHash: "b",
      flowHash: "c",
      riverHash: "d",
      biomeHash: "e",
      riverCellCount: 0,
      uniqueRiverCount: 0,
    };
    const oracle = {
      seed: "fixture",
      width: 10,
      height: 10,
      cellCount: 1,
      packCellCount: 1,
      heightTemplate: "continents" as const,
      seaLevel: 20,
      steps: [baseStep],
    };
    const local = {
      ...oracle,
      steps: [{ ...baseStep, temp: [6] }],
    };

    const comparison = comparePhysicalDiagnostics(oracle, local);

    expect(comparison.matches).toBeFalse();
    expect(comparison.firstDivergentStep?.key).toBe("physical:pack-ready");
    expect(comparison.firstDivergentStep?.firstTempDifferenceCell).toBe(0);
  });

  test("generates post-terrain physical diagnostics from local stages", () => {
    const diagnostics = generatePhysicalDiagnostics({
      seed: "physical-diagnostics",
      width: 320,
      height: 200,
      cells: 400,
      heightTemplate: "continents",
      layers: { physical: true },
    });

    expect(diagnostics.steps.map((step) => step.key)).toEqual([
      "physical:pack-ready",
      "physical:climate-temp",
      "physical:climate-prec",
      "physical:hydrology",
      "physical:biome",
    ]);
  });
});
