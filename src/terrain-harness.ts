import type { HeightTemplate, WorldGraphV1 } from "./types";

export type TerrainDiagnosticStep = Readonly<{
  key: string;
  label: string;
  landCellCount: number;
  landComponentSizes: readonly number[];
  coastMask: readonly number[];
}>;

export type TerrainDiagnostics = Readonly<{
  seed: string;
  width: number;
  height: number;
  cellCount: number;
  heightTemplate: HeightTemplate;
  seaLevel: number;
  steps: readonly TerrainDiagnosticStep[];
}>;

export type TerrainStepComparison = Readonly<{
  key: string;
  label: string;
  matches: boolean;
  landCellCountMatches: boolean;
  landComponentSizesMatches: boolean;
  coastMaskMatches: boolean;
  oracleLandCellCount: number | null;
  localLandCellCount: number;
  oracleLandComponentSizes: readonly number[];
  localLandComponentSizes: readonly number[];
  firstCoastMaskDifferenceCell: number | null;
}>;

export type TerrainDiagnosticsComparison = Readonly<{
  matches: boolean;
  firstDivergentStep: TerrainStepComparison | null;
  steps: readonly TerrainStepComparison[];
}>;

type TerrainWorldView = Readonly<{
  cellCount: number;
  cellsH: ArrayLike<number>;
  cellNeighborOffsets: ArrayLike<number>;
  cellNeighbors: ArrayLike<number>;
}>;

const MAX_COAST_DISTANCE = 10;

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

const forEachNeighbor = (
  cellId: number,
  offsets: ArrayLike<number>,
  neighbors: ArrayLike<number>,
  callback: (neighborId: number) => void,
): void => {
  const from = offsets[cellId];
  const to = offsets[cellId + 1];
  if (from === undefined || to === undefined) {
    return;
  }

  for (let index = from; index < to; index += 1) {
    const neighborId = neighbors[index];
    if (neighborId === undefined) {
      continue;
    }

    callback(neighborId);
  }
};

const buildLandMask = (
  cellsH: ArrayLike<number>,
  seaLevel: number,
): Uint8Array =>
  Uint8Array.from({ length: cellsH.length }, (_, cellId) =>
    (cellsH[cellId] ?? 0) >= seaLevel ? 1 : 0,
  );

const computeLandComponentSizes = (
  view: TerrainWorldView,
  landMask: Uint8Array,
): number[] => {
  const visited = new Uint8Array(view.cellCount);
  const sizes: number[] = [];

  for (let cellId = 0; cellId < view.cellCount; cellId += 1) {
    if ((landMask[cellId] ?? 0) !== 1 || (visited[cellId] ?? 0) === 1) {
      continue;
    }

    let size = 0;
    const queue = [cellId];
    visited[cellId] = 1;

    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        break;
      }

      size += 1;
      forEachNeighbor(
        current,
        view.cellNeighborOffsets,
        view.cellNeighbors,
        (neighborId) => {
          if (
            (landMask[neighborId] ?? 0) !== 1 ||
            (visited[neighborId] ?? 0) === 1
          ) {
            return;
          }

          visited[neighborId] = 1;
          queue.push(neighborId);
        },
      );
    }

    sizes.push(size);
  }

  sizes.sort((left, right) => right - left);
  return sizes;
};

const computeCoastMask = (
  view: TerrainWorldView,
  landMask: Uint8Array,
): Int8Array => {
  const coastMask = new Int8Array(view.cellCount);

  for (let cellId = 0; cellId < view.cellCount; cellId += 1) {
    const isLand = (landMask[cellId] ?? 0) === 1;
    let touchesOpposite = false;

    forEachNeighbor(
      cellId,
      view.cellNeighborOffsets,
      view.cellNeighbors,
      (neighborId) => {
        if (touchesOpposite) {
          return;
        }

        const neighborIsLand = (landMask[neighborId] ?? 0) === 1;
        if (neighborIsLand !== isLand) {
          touchesOpposite = true;
        }
      },
    );

    if (touchesOpposite) {
      coastMask[cellId] = isLand ? 1 : -1;
    }
  }

  for (let distance = 2; distance <= MAX_COAST_DISTANCE; distance += 1) {
    for (let cellId = 0; cellId < view.cellCount; cellId += 1) {
      if ((landMask[cellId] ?? 0) !== 1 || (coastMask[cellId] ?? 0) !== 0) {
        continue;
      }

      let reachesPreviousBand = false;
      forEachNeighbor(
        cellId,
        view.cellNeighborOffsets,
        view.cellNeighbors,
        (neighborId) => {
          if ((coastMask[neighborId] ?? 0) === distance - 1) {
            reachesPreviousBand = true;
          }
        },
      );

      if (reachesPreviousBand) {
        coastMask[cellId] = distance;
      }
    }
  }

  for (let distance = -2; distance >= -MAX_COAST_DISTANCE; distance -= 1) {
    for (let cellId = 0; cellId < view.cellCount; cellId += 1) {
      if ((landMask[cellId] ?? 0) !== 0 || (coastMask[cellId] ?? 0) !== 0) {
        continue;
      }

      let reachesPreviousBand = false;
      forEachNeighbor(
        cellId,
        view.cellNeighborOffsets,
        view.cellNeighbors,
        (neighborId) => {
          if ((coastMask[neighborId] ?? 0) === distance + 1) {
            reachesPreviousBand = true;
          }
        },
      );

      if (reachesPreviousBand) {
        coastMask[cellId] = distance;
      }
    }
  }

  return coastMask;
};

export const captureTerrainDiagnosticStep = (
  world: TerrainWorldView,
  key: string,
  label: string,
  seaLevel: number,
): TerrainDiagnosticStep => {
  const landMask = buildLandMask(world.cellsH, seaLevel);

  return {
    key,
    label,
    landCellCount: Array.from(landMask).reduce(
      (count, value) => count + (value === 1 ? 1 : 0),
      0,
    ),
    landComponentSizes: computeLandComponentSizes(world, landMask),
    coastMask: Array.from(computeCoastMask(world, landMask)),
  };
};

export const buildTerrainDiagnosticsFromWorld = (
  world: WorldGraphV1,
  heightTemplate: HeightTemplate,
  seaLevel: number,
  steps: readonly TerrainDiagnosticStep[],
): TerrainDiagnostics => ({
  seed: world.seed,
  width: world.width,
  height: world.height,
  cellCount: world.cellCount,
  heightTemplate,
  seaLevel,
  steps,
});

export const compareTerrainDiagnostics = (
  oracle: TerrainDiagnostics,
  local: TerrainDiagnostics,
): TerrainDiagnosticsComparison => {
  const oracleByKey = new Map(oracle.steps.map((step) => [step.key, step]));
  const steps = local.steps
    .filter((localStep) => oracleByKey.has(localStep.key))
    .map((localStep) => {
      const oracleStep = oracleByKey.get(localStep.key);
      if (!oracleStep) {
        throw new Error(`Missing oracle terrain step: ${localStep.key}`);
      }

      const landCellCountMatches =
        oracleStep.landCellCount === localStep.landCellCount;
      const landComponentSizesMatches = arraysEqual(
        oracleStep.landComponentSizes,
        localStep.landComponentSizes,
      );
      const coastMaskMatches = arraysEqual(
        oracleStep.coastMask,
        localStep.coastMask,
      );

      return {
        key: localStep.key,
        label: localStep.label,
        matches:
          landCellCountMatches && landComponentSizesMatches && coastMaskMatches,
        landCellCountMatches,
        landComponentSizesMatches,
        coastMaskMatches,
        oracleLandCellCount: oracleStep.landCellCount,
        localLandCellCount: localStep.landCellCount,
        oracleLandComponentSizes: oracleStep.landComponentSizes,
        localLandComponentSizes: localStep.landComponentSizes,
        firstCoastMaskDifferenceCell: firstDifferenceIndex(
          oracleStep.coastMask,
          localStep.coastMask,
        ),
      } satisfies TerrainStepComparison;
    });

  const firstDivergentStep = steps.find((step) => !step.matches) ?? null;
  return {
    matches: firstDivergentStep === null,
    firstDivergentStep,
    steps,
  };
};
