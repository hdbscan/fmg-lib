import { createHash } from "node:crypto";
import type { HeightTemplate, WorldGraphV1 } from "./types";

export type DownstreamDiagnosticStep = Readonly<{
  key: string;
  label: string;
  cultureCenterPack: readonly number[];
  cultureTemplateIds: readonly number[];
  cultureCenterSamples: readonly number[];
  cultureCenterSampleIndices: readonly number[];
  cultureCenterSampleOffsets: readonly number[];
  packCulture: readonly number[];
  packBurg: readonly number[];
  packState: readonly number[];
  packProvince: readonly number[];
  packReligion: readonly number[];
  burgCell: readonly number[];
  burgCapital: readonly number[];
  burgPort: readonly number[];
  burgCulture: readonly number[];
  burgPopulation: readonly number[];
  stateCenterBurg: readonly number[];
  stateCulture: readonly number[];
  stateForm: readonly number[];
  stateCells: readonly number[];
  provinceState: readonly number[];
  provinceCenterCell: readonly number[];
  provinceCells: readonly number[];
  religionSeedCell: readonly number[];
  religionType: readonly number[];
  religionSize: readonly number[];
  routeCount: number;
  routeDataHash: string;
  cultureHash: string;
  burgHash: string;
  stateHash: string;
  provinceHash: string;
  religionHash: string;
}>;

export type DownstreamDiagnostics = Readonly<{
  seed: string;
  width: number;
  height: number;
  cellCount: number;
  packCellCount: number;
  heightTemplate: HeightTemplate;
  steps: readonly DownstreamDiagnosticStep[];
}>;

export type DownstreamStepComparison = Readonly<{
  key: string;
  label: string;
  matches: boolean;
  cultureMatches: boolean;
  cultureCenterMatches: boolean;
  burgMatches: boolean;
  stateMatches: boolean;
  routeMatches: boolean;
  provinceMatches: boolean;
  religionMatches: boolean;
  firstCultureDifferenceCell: number | null;
  firstCultureCenterDifferenceCell: number | null;
  firstBurgDifferenceCell: number | null;
  firstStateDifferenceCell: number | null;
  firstProvinceDifferenceCell: number | null;
  firstReligionDifferenceCell: number | null;
}>;

export type DownstreamDiagnosticsComparison = Readonly<{
  matches: boolean;
  firstDivergentStep: DownstreamStepComparison | null;
  steps: readonly DownstreamStepComparison[];
}>;

type DownstreamWorldView = Readonly<{
  seed: string;
  width: number;
  height: number;
  cellCount: number;
  packCellCount: number;
  packToGrid: ArrayLike<number>;
  cellsCulture: ArrayLike<number>;
  cellsBurg: ArrayLike<number>;
  cellsState: ArrayLike<number>;
  cellsProvince: ArrayLike<number>;
  cellsReligion: ArrayLike<number>;
  burgCell: ArrayLike<number>;
  burgCapital: ArrayLike<number>;
  burgPort: ArrayLike<number>;
  burgCulture: ArrayLike<number>;
  burgPopulation: ArrayLike<number>;
  stateCenterBurg: ArrayLike<number>;
  stateCulture: ArrayLike<number>;
  stateForm: ArrayLike<number>;
  stateCells: ArrayLike<number>;
  provinceState: ArrayLike<number>;
  provinceCenterCell: ArrayLike<number>;
  provinceCells: ArrayLike<number>;
  religionSeedCell: ArrayLike<number>;
  religionType: ArrayLike<number>;
  religionSize: ArrayLike<number>;
  routeCount: number;
  routeFromState?: ArrayLike<number>;
  routeToState?: ArrayLike<number>;
  routeKind?: ArrayLike<number>;
  routeWeight?: ArrayLike<number>;
  cellRouteOffsets?: ArrayLike<number>;
  cellRouteNeighbors?: ArrayLike<number>;
  cellRouteKinds?: ArrayLike<number>;
  routeLinks?: Record<string, Record<string, number>>;
  packCulture?: ArrayLike<number>;
  cultureCenterPack?: ArrayLike<number>;
  cultureTemplateIds?: ArrayLike<number>;
  cultureCenterSamples?: ArrayLike<number>;
  cultureCenterSampleIndices?: ArrayLike<number>;
  cultureCenterSampleOffsets?: ArrayLike<number>;
}>;

const arraysEqual = (
  left: readonly number[],
  right: readonly number[],
): boolean => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return false;
  }
  return true;
};

const firstDifferenceIndex = (
  left: readonly number[],
  right: readonly number[],
): number | null => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return index;
  }
  return null;
};

const hashValues = (values: readonly number[]): string =>
  createHash("sha256").update(Uint32Array.from(values)).digest("hex");

const captureRouteDataHash = (world: DownstreamWorldView): string => {
  if (world.routeLinks) {
    return createHash("sha256")
      .update(JSON.stringify(world.routeLinks))
      .digest("hex");
  }

  const values = [world.routeCount];
  const pushArray = (arrayLike?: ArrayLike<number>): void => {
    if (!arrayLike) return;
    for (let index = 0; index < arrayLike.length; index += 1) {
      values.push(arrayLike[index] ?? 0);
    }
  };

  pushArray(world.routeFromState);
  pushArray(world.routeToState);
  pushArray(world.routeKind);
  pushArray(world.routeWeight);
  pushArray(world.cellRouteOffsets);
  pushArray(world.cellRouteNeighbors);
  pushArray(world.cellRouteKinds);
  return hashValues(values);
};

const capturePackProjection = (
  packCellCount: number,
  packToGrid: ArrayLike<number>,
  source: ArrayLike<number>,
): number[] => {
  const values = new Array<number>(packCellCount);
  for (let packId = 0; packId < packCellCount; packId += 1) {
    values[packId] = source[packToGrid[packId] ?? 0] ?? 0;
  }
  return values;
};

const toArray = (values: ArrayLike<number>): number[] => Array.from(values);

export const captureDownstreamDiagnosticStep = (
  world: DownstreamWorldView,
  key: string,
  label: string,
): DownstreamDiagnosticStep => {
  const packCulture = world.packCulture
    ? toArray(world.packCulture)
    : capturePackProjection(
        world.packCellCount,
        world.packToGrid,
        world.cellsCulture,
      );
  const cultureCenterPack = world.cultureCenterPack
    ? toArray(world.cultureCenterPack)
    : [];
  const cultureTemplateIds = world.cultureTemplateIds
    ? toArray(world.cultureTemplateIds)
    : [];
  const cultureCenterSamples = world.cultureCenterSamples
    ? toArray(world.cultureCenterSamples)
    : [];
  const cultureCenterSampleIndices = world.cultureCenterSampleIndices
    ? toArray(world.cultureCenterSampleIndices)
    : [];
  const cultureCenterSampleOffsets = world.cultureCenterSampleOffsets
    ? toArray(world.cultureCenterSampleOffsets)
    : [];
  const packBurg = capturePackProjection(
    world.packCellCount,
    world.packToGrid,
    world.cellsBurg,
  );
  const packState = capturePackProjection(
    world.packCellCount,
    world.packToGrid,
    world.cellsState,
  );
  const packProvince = capturePackProjection(
    world.packCellCount,
    world.packToGrid,
    world.cellsProvince,
  );
  const packReligion = capturePackProjection(
    world.packCellCount,
    world.packToGrid,
    world.cellsReligion,
  );
  const burgCell = toArray(world.burgCell);
  const burgCapital = toArray(world.burgCapital);
  const burgPort = toArray(world.burgPort);
  const burgCulture = toArray(world.burgCulture);
  const burgPopulation = toArray(world.burgPopulation);
  const stateCenterBurg = toArray(world.stateCenterBurg);
  const stateCulture = toArray(world.stateCulture);
  const stateForm = toArray(world.stateForm);
  const stateCells = toArray(world.stateCells);
  const provinceState = toArray(world.provinceState);
  const provinceCenterCell = toArray(world.provinceCenterCell);
  const provinceCells = toArray(world.provinceCells);
  const religionSeedCell = toArray(world.religionSeedCell);
  const religionType = toArray(world.religionType);
  const religionSize = toArray(world.religionSize);

  return {
    key,
    label,
    cultureCenterPack,
    cultureTemplateIds,
    cultureCenterSamples,
    cultureCenterSampleIndices,
    cultureCenterSampleOffsets,
    packCulture,
    packBurg,
    packState,
    packProvince,
    packReligion,
    burgCell,
    burgCapital,
    burgPort,
    burgCulture,
    burgPopulation,
    stateCenterBurg,
    stateCulture,
    stateForm,
    stateCells,
    provinceState,
    provinceCenterCell,
    provinceCells,
    religionSeedCell,
    religionType,
    religionSize,
    routeCount: world.routeCount,
    routeDataHash: captureRouteDataHash(world),
    cultureHash: hashValues(packCulture),
    burgHash: hashValues(
      packBurg.concat(
        burgCell,
        burgCapital,
        burgPort,
        burgCulture,
        burgPopulation,
      ),
    ),
    stateHash: hashValues(
      packState.concat(stateCenterBurg, stateCulture, stateForm, stateCells),
    ),
    provinceHash: hashValues(
      packProvince.concat(provinceState, provinceCenterCell, provinceCells),
    ),
    religionHash: hashValues(
      packReligion.concat(religionSeedCell, religionType, religionSize),
    ),
  };
};

export const buildDownstreamDiagnosticsFromWorld = (
  world: WorldGraphV1,
  heightTemplate: HeightTemplate,
  steps: readonly DownstreamDiagnosticStep[],
): DownstreamDiagnostics => ({
  seed: world.seed,
  width: world.width,
  height: world.height,
  cellCount: world.cellCount,
  packCellCount: world.packCellCount,
  heightTemplate,
  steps,
});

export const compareDownstreamDiagnostics = (
  oracle: DownstreamDiagnostics,
  local: DownstreamDiagnostics,
): DownstreamDiagnosticsComparison => {
  const oracleByKey = new Map(oracle.steps.map((step) => [step.key, step]));
  const steps = local.steps
    .filter((step) => oracleByKey.has(step.key))
    .map((localStep) => {
      const oracleStep = oracleByKey.get(localStep.key);
      if (!oracleStep)
        throw new Error(`Missing oracle downstream step: ${localStep.key}`);

      const cultureMatches = arraysEqual(
        oracleStep.packCulture,
        localStep.packCulture,
      );
      const cultureCenterMatches = arraysEqual(
        oracleStep.cultureCenterPack,
        localStep.cultureCenterPack,
      );
      const burgMatches =
        arraysEqual(oracleStep.packBurg, localStep.packBurg) &&
        arraysEqual(oracleStep.burgCell, localStep.burgCell) &&
        arraysEqual(oracleStep.burgCapital, localStep.burgCapital) &&
        arraysEqual(oracleStep.burgPort, localStep.burgPort) &&
        arraysEqual(oracleStep.burgCulture, localStep.burgCulture) &&
        arraysEqual(oracleStep.burgPopulation, localStep.burgPopulation);
      const stateMatches =
        arraysEqual(oracleStep.packState, localStep.packState) &&
        arraysEqual(oracleStep.stateCenterBurg, localStep.stateCenterBurg) &&
        arraysEqual(oracleStep.stateCulture, localStep.stateCulture) &&
        arraysEqual(oracleStep.stateForm, localStep.stateForm) &&
        arraysEqual(oracleStep.stateCells, localStep.stateCells);
      const routeMatches =
        oracleStep.routeCount === localStep.routeCount &&
        oracleStep.routeDataHash === localStep.routeDataHash;
      const provinceMatches =
        arraysEqual(oracleStep.packProvince, localStep.packProvince) &&
        arraysEqual(oracleStep.provinceState, localStep.provinceState) &&
        arraysEqual(
          oracleStep.provinceCenterCell,
          localStep.provinceCenterCell,
        ) &&
        arraysEqual(oracleStep.provinceCells, localStep.provinceCells);
      const religionMatches =
        arraysEqual(oracleStep.packReligion, localStep.packReligion) &&
        arraysEqual(oracleStep.religionSeedCell, localStep.religionSeedCell) &&
        arraysEqual(oracleStep.religionType, localStep.religionType) &&
        arraysEqual(oracleStep.religionSize, localStep.religionSize);

      return {
        key: localStep.key,
        label: localStep.label,
        matches:
          cultureMatches &&
          cultureCenterMatches &&
          burgMatches &&
          stateMatches &&
          routeMatches &&
          provinceMatches &&
          religionMatches,
        cultureMatches,
        cultureCenterMatches,
        burgMatches,
        stateMatches,
        routeMatches,
        provinceMatches,
        religionMatches,
        firstCultureDifferenceCell: firstDifferenceIndex(
          oracleStep.packCulture,
          localStep.packCulture,
        ),
        firstCultureCenterDifferenceCell: firstDifferenceIndex(
          oracleStep.cultureCenterPack,
          localStep.cultureCenterPack,
        ),
        firstBurgDifferenceCell: firstDifferenceIndex(
          oracleStep.packBurg,
          localStep.packBurg,
        ),
        firstStateDifferenceCell: firstDifferenceIndex(
          oracleStep.packState,
          localStep.packState,
        ),
        firstProvinceDifferenceCell: firstDifferenceIndex(
          oracleStep.packProvince,
          localStep.packProvince,
        ),
        firstReligionDifferenceCell: firstDifferenceIndex(
          oracleStep.packReligion,
          localStep.packReligion,
        ),
      } satisfies DownstreamStepComparison;
    });

  const firstDivergentStep = steps.find((step) => !step.matches) ?? null;
  return { matches: firstDivergentStep === null, firstDivergentStep, steps };
};
