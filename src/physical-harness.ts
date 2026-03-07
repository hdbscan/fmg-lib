import { createHash } from "node:crypto";
import type { HeightTemplate, WorldGraphV1 } from "./types";

export type PhysicalDiagnosticStep = Readonly<{
  key: string;
  label: string;
  packToGrid: readonly number[];
  packH: readonly number[];
  packX100: readonly number[];
  packY100: readonly number[];
  temp: readonly number[];
  prec: readonly number[];
  flow: readonly number[];
  river: readonly number[];
  biome: readonly number[];
  tempHash: string;
  precHash: string;
  flowHash: string;
  riverHash: string;
  biomeHash: string;
  riverCellCount: number;
  uniqueRiverCount: number;
}>;

export type PhysicalDiagnostics = Readonly<{
  seed: string;
  width: number;
  height: number;
  cellCount: number;
  packCellCount: number;
  heightTemplate: HeightTemplate;
  seaLevel: number;
  steps: readonly PhysicalDiagnosticStep[];
}>;

export type PhysicalStepComparison = Readonly<{
  key: string;
  label: string;
  matches: boolean;
  packToGridMatches: boolean;
  packHMatches: boolean;
  packXMatches: boolean;
  packYMatches: boolean;
  tempMatches: boolean;
  precMatches: boolean;
  flowMatches: boolean;
  riverMatches: boolean;
  biomeMatches: boolean;
  firstPackToGridDifferenceCell: number | null;
  firstPackHDifferenceCell: number | null;
  firstPackXDifferenceCell: number | null;
  firstPackYDifferenceCell: number | null;
  firstTempDifferenceCell: number | null;
  firstPrecDifferenceCell: number | null;
  firstFlowDifferenceCell: number | null;
  firstRiverDifferenceCell: number | null;
  firstBiomeDifferenceCell: number | null;
}>;

export type PhysicalDiagnosticsComparison = Readonly<{
  matches: boolean;
  firstDivergentStep: PhysicalStepComparison | null;
  steps: readonly PhysicalStepComparison[];
}>;

const arraysEqual = (
  left: readonly number[],
  right: readonly number[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return false;
    }
  }

  return true;
};

const firstDifferenceIndex = (
  left: readonly number[],
  right: readonly number[],
): number | null => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) {
      return index;
    }
  }

  return null;
};

const hashValues = (values: readonly number[]): string =>
  createHash("sha256").update(Uint32Array.from(values)).digest("hex");

type PhysicalWorldView = Readonly<{
  packCellCount: number;
  packToGrid: ArrayLike<number>;
  packH: ArrayLike<number>;
  packX: ArrayLike<number>;
  packY: ArrayLike<number>;
  cellsTemp: ArrayLike<number>;
  cellsPrec: ArrayLike<number>;
  cellsFlow: ArrayLike<number>;
  cellsRiver: ArrayLike<number>;
  cellsBiome: ArrayLike<number>;
}>;

export const capturePhysicalDiagnosticStep = (
  world: PhysicalWorldView,
  key: string,
  label: string,
): PhysicalDiagnosticStep => {
  const temp = new Array<number>(world.packCellCount);
  const prec = new Array<number>(world.packCellCount);
  const flow = new Array<number>(world.packCellCount);
  const river = new Array<number>(world.packCellCount);
  const biome = new Array<number>(world.packCellCount);
  const packToGrid = new Array<number>(world.packCellCount);
  const packH = new Array<number>(world.packCellCount);
  const packX100 = new Array<number>(world.packCellCount);
  const packY100 = new Array<number>(world.packCellCount);
  const rivers = new Set<number>();
  let riverCellCount = 0;

  for (let packId = 0; packId < world.packCellCount; packId += 1) {
    const gridCellId = world.packToGrid[packId] ?? 0;
    const packHeight = world.packH[packId] ?? 0;
    const packX = world.packX[packId] ?? 0;
    const packY = world.packY[packId] ?? 0;
    const tempValue = world.cellsTemp[gridCellId] ?? 0;
    const precValue = world.cellsPrec[gridCellId] ?? 0;
    const flowValue = world.cellsFlow[gridCellId] ?? 0;
    const riverValue = world.cellsRiver[gridCellId] ?? 0;
    const biomeValue = world.cellsBiome[gridCellId] ?? 0;

    packToGrid[packId] = gridCellId;
    packH[packId] = packHeight;
    packX100[packId] = Math.round(packX * 100);
    packY100[packId] = Math.round(packY * 100);
    temp[packId] = tempValue;
    prec[packId] = precValue;
    flow[packId] = flowValue;
    river[packId] = riverValue;
    biome[packId] = biomeValue;

    if (riverValue > 0) {
      riverCellCount += 1;
      rivers.add(riverValue);
    }
  }

  return {
    key,
    label,
    packToGrid,
    packH,
    packX100,
    packY100,
    temp,
    prec,
    flow,
    river,
    biome,
    tempHash: hashValues(temp),
    precHash: hashValues(prec),
    flowHash: hashValues(flow),
    riverHash: hashValues(river),
    biomeHash: hashValues(biome),
    riverCellCount,
    uniqueRiverCount: rivers.size,
  };
};

export const buildPhysicalDiagnosticsFromWorld = (
  world: WorldGraphV1,
  heightTemplate: HeightTemplate,
  seaLevel: number,
  steps: readonly PhysicalDiagnosticStep[],
): PhysicalDiagnostics => ({
  seed: world.seed,
  width: world.width,
  height: world.height,
  cellCount: world.cellCount,
  packCellCount: world.packCellCount,
  heightTemplate,
  seaLevel,
  steps,
});

export const comparePhysicalDiagnostics = (
  oracle: PhysicalDiagnostics,
  local: PhysicalDiagnostics,
): PhysicalDiagnosticsComparison => {
  const oracleByKey = new Map(oracle.steps.map((step) => [step.key, step]));
  const steps = local.steps
    .filter((localStep) => oracleByKey.has(localStep.key))
    .map((localStep) => {
      const oracleStep = oracleByKey.get(localStep.key);
      if (!oracleStep) {
        throw new Error(`Missing oracle physical step: ${localStep.key}`);
      }

      const packToGridMatches = arraysEqual(
        oracleStep.packToGrid,
        localStep.packToGrid,
      );
      const packHMatches = arraysEqual(oracleStep.packH, localStep.packH);
      const packXMatches = arraysEqual(oracleStep.packX100, localStep.packX100);
      const packYMatches = arraysEqual(oracleStep.packY100, localStep.packY100);
      const tempMatches = arraysEqual(oracleStep.temp, localStep.temp);
      const precMatches = arraysEqual(oracleStep.prec, localStep.prec);
      const flowMatches = arraysEqual(oracleStep.flow, localStep.flow);
      const riverMatches = arraysEqual(oracleStep.river, localStep.river);
      const biomeMatches = arraysEqual(oracleStep.biome, localStep.biome);

      return {
        key: localStep.key,
        label: localStep.label,
        matches:
          packToGridMatches &&
          packHMatches &&
          packXMatches &&
          packYMatches &&
          tempMatches &&
          precMatches &&
          flowMatches &&
          riverMatches &&
          biomeMatches,
        packToGridMatches,
        packHMatches,
        packXMatches,
        packYMatches,
        tempMatches,
        precMatches,
        flowMatches,
        riverMatches,
        biomeMatches,
        firstPackToGridDifferenceCell: firstDifferenceIndex(
          oracleStep.packToGrid,
          localStep.packToGrid,
        ),
        firstPackHDifferenceCell: firstDifferenceIndex(
          oracleStep.packH,
          localStep.packH,
        ),
        firstPackXDifferenceCell: firstDifferenceIndex(
          oracleStep.packX100,
          localStep.packX100,
        ),
        firstPackYDifferenceCell: firstDifferenceIndex(
          oracleStep.packY100,
          localStep.packY100,
        ),
        firstTempDifferenceCell: firstDifferenceIndex(
          oracleStep.temp,
          localStep.temp,
        ),
        firstPrecDifferenceCell: firstDifferenceIndex(
          oracleStep.prec,
          localStep.prec,
        ),
        firstFlowDifferenceCell: firstDifferenceIndex(
          oracleStep.flow,
          localStep.flow,
        ),
        firstRiverDifferenceCell: firstDifferenceIndex(
          oracleStep.river,
          localStep.river,
        ),
        firstBiomeDifferenceCell: firstDifferenceIndex(
          oracleStep.biome,
          localStep.biome,
        ),
      } satisfies PhysicalStepComparison;
    });

  const firstDivergentStep = steps.find((step) => !step.matches) ?? null;
  return {
    matches: firstDivergentStep === null,
    firstDivergentStep,
    steps,
  };
};
