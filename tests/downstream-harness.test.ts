import { describe, expect, test } from "bun:test";
import {
  compareDownstreamDiagnostics,
  generateDownstreamDiagnostics,
} from "../src/index";

describe("downstream diagnostics", () => {
  test("finds first divergent downstream step", () => {
    const baseStep = {
      key: "downstream:cultures",
      label: "Cultures",
      packCulture: [1],
      packBurg: [0],
      packState: [0],
      packProvince: [0],
      packReligion: [0],
      burgCell: [0],
      burgCapital: [0],
      burgPort: [0],
      burgCulture: [0],
      burgPopulation: [0],
      stateCenterBurg: [0],
      stateCulture: [0],
      stateForm: [0],
      stateCells: [0],
      provinceState: [0],
      provinceCenterCell: [0],
      provinceCells: [0],
      religionSeedCell: [0],
      religionType: [0],
      religionSize: [0],
      routeCount: 0,
      routeDataHash: "a",
      cultureHash: "b",
      burgHash: "c",
      stateHash: "d",
      provinceHash: "e",
      religionHash: "f",
    };
    const oracle = {
      seed: "fixture",
      width: 10,
      height: 10,
      cellCount: 1,
      packCellCount: 1,
      heightTemplate: "continents" as const,
      steps: [baseStep],
    };
    const local = { ...oracle, steps: [{ ...baseStep, packCulture: [2] }] };

    const comparison = compareDownstreamDiagnostics(oracle, local);

    expect(comparison.matches).toBeFalse();
    expect(comparison.firstDivergentStep?.key).toBe("downstream:cultures");
    expect(comparison.firstDivergentStep?.firstCultureDifferenceCell).toBe(0);
  });

  test("generates downstream diagnostic steps", () => {
    const diagnostics = generateDownstreamDiagnostics({
      seed: "downstream-diagnostics",
      width: 320,
      height: 200,
      cells: 400,
      heightTemplate: "continents",
      culturesCount: 4,
      statesCount: 3,
      townsCount: 20,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(diagnostics.steps.map((step) => step.key)).toEqual([
      "downstream:cultures",
      "downstream:burgs-generation",
      "downstream:states",
      "downstream:routes",
      "downstream:religions",
      "downstream:burgs-specification",
      "downstream:state-forms",
      "downstream:provinces",
    ]);
  });
});
