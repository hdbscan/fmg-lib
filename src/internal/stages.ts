import { Delaunay } from "d3-delaunay";
import type { GenerationContext, PoliticalType } from "../types";
import {
  computeSuitability,
  isPoliticalPackCell,
  runBurgGenerationStage as runPoliticalBurgGenerationStage,
  runBurgSpecificationStage as runPoliticalBurgSpecificationStage,
  runProvincesStage as runPoliticalProvincesStage,
  runReligionsStage as runPoliticalReligionsStage,
  runStateFormsStage as runPoliticalStateFormsStage,
  runStatesStage as runPoliticalStatesStage,
} from "./political";
import { createAlea, hashSeed } from "./random";

const EPSILON = 1e-10;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const rn = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const hash2d = (seed: number, x: number, y: number): number => {
  let hash = seed ^ Math.imul(x, 374_761_393) ^ Math.imul(y, 668_265_263);
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_295;
};

const sampleValueNoise = (
  seed: number,
  x: number,
  y: number,
  frequencyX: number,
  frequencyY = frequencyX,
): number => {
  const scaledX = x * frequencyX;
  const scaledY = y * frequencyY;
  const x0 = Math.floor(scaledX);
  const y0 = Math.floor(scaledY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothstep(scaledX - x0);
  const ty = smoothstep(scaledY - y0);

  const top = lerp(hash2d(seed, x0, y0), hash2d(seed, x1, y0), tx);
  const bottom = lerp(hash2d(seed, x0, y1), hash2d(seed, x1, y1), tx);
  return lerp(top, bottom, ty) * 2 - 1;
};

const pickRangeValue = (
  random: () => number,
  min: number,
  max: number,
): number => lerp(min, max, random());

const selectCellInRange = (
  context: GenerationContext,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): number => {
  const { cellCount, cellsX, cellsY } = context.world;
  const { width, height } = context.config;
  const start = Math.floor(context.random() * cellCount);

  for (let offset = 0; offset < cellCount; offset += 1) {
    const cellId = (start + offset) % cellCount;
    const x = (cellsX[cellId] ?? 0) / width;
    const y = (cellsY[cellId] ?? 0) / height;
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return cellId;
    }
  }

  return start;
};

const applyBlob = (
  context: GenerationContext,
  field: Float32Array,
  startCell: number,
  magnitude: number,
  decay: number,
): void => {
  const seen = new Uint8Array(field.length);
  const change = new Float32Array(field.length);
  const queue = [startCell];
  seen[startCell] = 1;
  change[startCell] = magnitude;

  while (queue.length > 0) {
    const cellId = queue.shift();
    if (cellId === undefined) {
      break;
    }

    const delta = change[cellId] ?? 0;
    field[cellId] = (field[cellId] ?? 0) + delta;

    if (Math.abs(delta) < 1.25) {
      continue;
    }

    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        if ((seen[neighborId] ?? 0) === 1) {
          return;
        }

        const variation = 0.84 + context.random() * 0.28;
        const next = delta * decay * variation;
        if (Math.abs(next) < 1) {
          return;
        }

        seen[neighborId] = 1;
        change[neighborId] = next;
        queue.push(neighborId);
      },
    );
  }
};

const traceRangePath = (
  context: GenerationContext,
  startCell: number,
  endCell: number,
): number[] => {
  const { cellsX, cellsY, cellCount } = context.world;
  const used = new Uint8Array(cellCount);
  const path = [startCell];
  let current = startCell;
  used[current] = 1;

  for (let step = 0; step < cellCount; step += 1) {
    if (current === endCell) {
      break;
    }

    let nextCell = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    const endX = cellsX[endCell] ?? 0;
    const endY = cellsY[endCell] ?? 0;

    forEachNeighbor(
      current,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        if ((used[neighborId] ?? 0) === 1) {
          return;
        }

        const dx = (cellsX[neighborId] ?? 0) - endX;
        const dy = (cellsY[neighborId] ?? 0) - endY;
        const score = dx * dx + dy * dy + context.random() * 300;
        if (score < bestScore) {
          bestScore = score;
          nextCell = neighborId;
        }
      },
    );

    if (nextCell === -1) {
      break;
    }

    current = nextCell;
    used[current] = 1;
    path.push(current);
  }

  return path;
};

const applyRange = (
  context: GenerationContext,
  field: Float32Array,
  path: number[],
  magnitude: number,
  decay: number,
): void => {
  const visited = new Uint8Array(field.length);
  let frontier = path.slice();
  let delta = magnitude;

  for (const cellId of path) {
    visited[cellId] = 1;
  }

  while (frontier.length > 0 && Math.abs(delta) >= 1.5) {
    for (const cellId of frontier) {
      field[cellId] =
        (field[cellId] ?? 0) + delta * (0.88 + context.random() * 0.2);
    }

    const nextFrontier: number[] = [];
    for (const cellId of frontier) {
      forEachNeighbor(
        cellId,
        context.world.cellNeighborOffsets,
        context.world.cellNeighbors,
        (neighborId) => {
          if ((visited[neighborId] ?? 0) === 1) {
            return;
          }

          visited[neighborId] = 1;
          nextFrontier.push(neighborId);
        },
      );
    }

    frontier = nextFrontier;
    delta *= decay;
  }
};

const smoothField = (
  context: GenerationContext,
  field: Float32Array,
  iterations: number,
): void => {
  const scratch = new Float32Array(field.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let cellId = 0; cellId < field.length; cellId += 1) {
      let sum = field[cellId] ?? 0;
      let count = 1;

      forEachNeighbor(
        cellId,
        context.world.cellNeighborOffsets,
        context.world.cellNeighbors,
        (neighborId) => {
          sum += field[neighborId] ?? 0;
          count += 1;
        },
      );

      scratch[cellId] = sum / count;
    }

    field.set(scratch);
  }
};

const applyEdgeMask = (
  context: GenerationContext,
  field: Float32Array,
  seed: number,
  strength: number,
  rimWidth: number,
): void => {
  const { width, height } = context.config;

  for (let cellId = 0; cellId < field.length; cellId += 1) {
    const x = context.world.cellsX[cellId] ?? 0;
    const y = context.world.cellsY[cellId] ?? 0;
    const distance =
      Math.min(x, width - x, y, height - y) / Math.min(width, height);
    const rim = clamp01(1 - distance / rimWidth);
    if (rim <= 0) {
      continue;
    }

    const xNorm = x / width;
    const yNorm = y / height;
    const coastNoise = sampleValueNoise(seed + 17, xNorm, yNorm, 3.1, 2.7);
    field[cellId] =
      (field[cellId] ?? 0) -
      rim * rim * strength * (0.78 + (coastNoise + 1) * 0.22);
  }
};

const carveStrait = (
  context: GenerationContext,
  field: Float32Array,
  seed: number,
  orientation: "vertical" | "horizontal",
  center: number,
  widthFraction: number,
  strength: number,
): void => {
  const { width, height } = context.config;
  const axisSize = orientation === "vertical" ? width : height;

  for (let cellId = 0; cellId < field.length; cellId += 1) {
    const xNorm = (context.world.cellsX[cellId] ?? 0) / width;
    const yNorm = (context.world.cellsY[cellId] ?? 0) / height;
    const axis = orientation === "vertical" ? xNorm : yNorm;
    const cross = orientation === "vertical" ? yNorm : xNorm;
    const distance = Math.abs(axis - center);
    if (distance > widthFraction * 1.6) {
      continue;
    }

    const band = clamp01(1 - distance / widthFraction);
    const waviness = sampleValueNoise(seed + 29, cross, axis, 2.1, 4.3);
    const along = 0.7 + clamp01((waviness + 1) / 2) * 0.45;
    field[cellId] =
      (field[cellId] ?? 0) -
      band * along * strength * (axisSize / Math.max(width, height));
  }
};

const addBlobCluster = (
  context: GenerationContext,
  field: Float32Array,
  count: number,
  magnitudeMin: number,
  magnitudeMax: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  decay: number,
): void => {
  for (let index = 0; index < count; index += 1) {
    const startCell = selectCellInRange(context, minX, maxX, minY, maxY);
    const magnitude = pickRangeValue(
      context.random,
      magnitudeMin,
      magnitudeMax,
    );
    applyBlob(context, field, startCell, magnitude, decay);
  }
};

const addRangeCluster = (
  context: GenerationContext,
  field: Float32Array,
  count: number,
  magnitudeMin: number,
  magnitudeMax: number,
  startMinX: number,
  startMaxX: number,
  startMinY: number,
  startMaxY: number,
  endMinX: number,
  endMaxX: number,
  endMinY: number,
  endMaxY: number,
  decay: number,
): void => {
  for (let index = 0; index < count; index += 1) {
    const startCell = selectCellInRange(
      context,
      startMinX,
      startMaxX,
      startMinY,
      startMaxY,
    );
    const endCell = selectCellInRange(
      context,
      endMinX,
      endMaxX,
      endMinY,
      endMaxY,
    );
    const magnitude = pickRangeValue(
      context.random,
      magnitudeMin,
      magnitudeMax,
    );
    const path = traceRangePath(context, startCell, endCell);
    applyRange(context, field, path, magnitude, decay);
  }
};

const normalizeField = (
  field: Float32Array,
): Readonly<{ min: number; max: number }> => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of field) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (!(max > min)) {
    max = min + 1;
  }

  return { min, max };
};

const BLOB_POWER_BY_CELLS: Readonly<Record<number, number>> = {
  1000: 0.93,
  2000: 0.95,
  5000: 0.97,
  10000: 0.98,
  20000: 0.99,
  30000: 0.991,
  40000: 0.993,
  50000: 0.994,
  60000: 0.995,
  70000: 0.9955,
  80000: 0.996,
  90000: 0.9964,
  100000: 0.9973,
};

const LINE_POWER_BY_CELLS: Readonly<Record<number, number>> = {
  1000: 0.75,
  2000: 0.77,
  5000: 0.79,
  10000: 0.81,
  20000: 0.82,
  30000: 0.83,
  40000: 0.84,
  50000: 0.86,
  60000: 0.87,
  70000: 0.88,
  80000: 0.91,
  90000: 0.92,
  100000: 0.93,
};

const WATERBODY_TYPE_OCEAN = 1;
const WATERBODY_TYPE_LAKE = 2;

const WATERBODY_GROUP_NONE = 0;
const WATERBODY_GROUP_OCEAN = 1;
const WATERBODY_GROUP_SEA = 2;
const WATERBODY_GROUP_GULF = 3;
const WATERBODY_GROUP_FRESHWATER = 4;
const WATERBODY_GROUP_SALT = 5;
const WATERBODY_GROUP_FROZEN = 6;
const WATERBODY_GROUP_DRY = 7;
const WATERBODY_GROUP_SINKHOLE = 8;
const WATERBODY_GROUP_LAVA = 9;

const FEATURE_GROUP_CONTINENT = 10;
const FEATURE_GROUP_ISLAND = 11;
const FEATURE_GROUP_ISLE = 12;
const FEATURE_GROUP_LAKE_ISLAND = 13;

type HeightmapTool =
  | "Hill"
  | "Pit"
  | "Range"
  | "Trough"
  | "Strait"
  | "Mask"
  | "Invert"
  | "Add"
  | "Multiply"
  | "Smooth";

type HeightmapStep = readonly [HeightmapTool, string, string, string, string];

const HEIGHTMAP_STEPS: Readonly<Record<string, readonly HeightmapStep[]>> = {
  volcano: [
    ["Hill", "1", "90-100", "44-56", "40-60"],
    ["Multiply", "0.8", "50-100", "0", "0"],
    ["Range", "1.5", "30-55", "45-55", "40-60"],
    ["Smooth", "3", "0", "0", "0"],
    ["Hill", "1.5", "35-45", "25-30", "20-75"],
    ["Hill", "1", "35-55", "75-80", "25-75"],
    ["Hill", "0.5", "20-25", "10-15", "20-25"],
    ["Mask", "3", "0", "0", "0"],
  ],
  highIsland: [
    ["Hill", "1", "90-100", "65-75", "47-53"],
    ["Add", "7", "all", "0", "0"],
    ["Hill", "5-6", "20-30", "25-55", "45-55"],
    ["Range", "1", "40-50", "45-55", "45-55"],
    ["Multiply", "0.8", "land", "0", "0"],
    ["Mask", "3", "0", "0", "0"],
    ["Smooth", "2", "0", "0", "0"],
    ["Trough", "2-3", "20-30", "20-30", "20-30"],
    ["Trough", "2-3", "20-30", "60-80", "70-80"],
    ["Hill", "1", "10-15", "60-60", "50-50"],
    ["Hill", "1.5", "13-16", "15-20", "20-75"],
    ["Range", "1.5", "30-40", "15-85", "30-40"],
    ["Range", "1.5", "30-40", "15-85", "60-70"],
    ["Pit", "3-5", "10-30", "15-85", "20-80"],
  ],
  lowIsland: [
    ["Hill", "1", "90-99", "60-80", "45-55"],
    ["Hill", "1-2", "20-30", "10-30", "10-90"],
    ["Smooth", "2", "0", "0", "0"],
    ["Hill", "6-7", "25-35", "20-70", "30-70"],
    ["Range", "1", "40-50", "45-55", "45-55"],
    ["Trough", "2-3", "20-30", "15-85", "20-30"],
    ["Trough", "2-3", "20-30", "15-85", "70-80"],
    ["Hill", "1.5", "10-15", "5-15", "20-80"],
    ["Hill", "1", "10-15", "85-95", "70-80"],
    ["Pit", "5-7", "15-25", "15-85", "20-80"],
    ["Multiply", "0.4", "20-100", "0", "0"],
    ["Mask", "4", "0", "0", "0"],
  ],
  continents: [
    ["Hill", "1", "80-85", "60-80", "40-60"],
    ["Hill", "1", "80-85", "20-30", "40-60"],
    ["Hill", "6-7", "15-30", "25-75", "15-85"],
    ["Multiply", "0.6", "land", "0", "0"],
    ["Hill", "8-10", "5-10", "15-85", "20-80"],
    ["Range", "1-2", "30-60", "5-15", "25-75"],
    ["Range", "1-2", "30-60", "80-95", "25-75"],
    ["Range", "0-3", "30-60", "80-90", "20-80"],
    ["Strait", "2", "vertical", "0", "0"],
    ["Strait", "1", "vertical", "0", "0"],
    ["Smooth", "3", "0", "0", "0"],
    ["Trough", "3-4", "15-20", "15-85", "20-80"],
    ["Trough", "3-4", "5-10", "45-55", "45-55"],
    ["Pit", "3-4", "10-20", "15-85", "20-80"],
    ["Mask", "4", "0", "0", "0"],
  ],
  archipelago: [
    ["Add", "11", "all", "0", "0"],
    ["Range", "2-3", "40-60", "20-80", "20-80"],
    ["Hill", "5", "15-20", "10-90", "30-70"],
    ["Hill", "2", "10-15", "10-30", "20-80"],
    ["Hill", "2", "10-15", "60-90", "20-80"],
    ["Smooth", "3", "0", "0", "0"],
    ["Trough", "10", "20-30", "5-95", "5-95"],
    ["Strait", "2", "vertical", "0", "0"],
    ["Strait", "2", "horizontal", "0", "0"],
  ],
  atoll: [
    ["Hill", "1", "75-80", "50-60", "45-55"],
    ["Hill", "1.5", "30-50", "25-75", "30-70"],
    ["Hill", ".5", "30-50", "25-35", "30-70"],
    ["Smooth", "1", "0", "0", "0"],
    ["Multiply", "0.2", "25-100", "0", "0"],
    ["Hill", "0.5", "10-20", "50-55", "48-52"],
  ],
  mediterranean: [
    ["Range", "4-6", "30-80", "0-100", "0-10"],
    ["Range", "4-6", "30-80", "0-100", "90-100"],
    ["Hill", "6-8", "30-50", "10-90", "0-5"],
    ["Hill", "6-8", "30-50", "10-90", "95-100"],
    ["Multiply", "0.9", "land", "0", "0"],
    ["Mask", "-2", "0", "0", "0"],
    ["Smooth", "1", "0", "0", "0"],
    ["Hill", "2-3", "30-70", "0-5", "20-80"],
    ["Hill", "2-3", "30-70", "95-100", "20-80"],
    ["Trough", "3-6", "40-50", "0-100", "0-10"],
    ["Trough", "3-6", "40-50", "0-100", "90-100"],
  ],
  peninsula: [
    ["Range", "2-3", "20-35", "40-50", "0-15"],
    ["Add", "5", "all", "0", "0"],
    ["Hill", "1", "90-100", "10-90", "0-5"],
    ["Add", "13", "all", "0", "0"],
    ["Hill", "3-4", "3-5", "5-95", "80-100"],
    ["Hill", "1-2", "3-5", "5-95", "40-60"],
    ["Trough", "5-6", "10-25", "5-95", "5-95"],
    ["Smooth", "3", "0", "0", "0"],
    ["Invert", "0.4", "both", "0", "0"],
  ],
  pangea: [
    ["Hill", "1-2", "25-40", "15-50", "0-10"],
    ["Hill", "1-2", "5-40", "50-85", "0-10"],
    ["Hill", "1-2", "25-40", "50-85", "90-100"],
    ["Hill", "1-2", "5-40", "15-50", "90-100"],
    ["Hill", "8-12", "20-40", "20-80", "48-52"],
    ["Smooth", "2", "0", "0", "0"],
    ["Multiply", "0.7", "land", "0", "0"],
    ["Trough", "3-4", "25-35", "5-95", "10-20"],
    ["Trough", "3-4", "25-35", "5-95", "80-90"],
    ["Range", "5-6", "30-40", "10-90", "35-65"],
  ],
  isthmus: [
    ["Hill", "5-10", "15-30", "0-30", "0-20"],
    ["Hill", "5-10", "15-30", "10-50", "20-40"],
    ["Hill", "5-10", "15-30", "30-70", "40-60"],
    ["Hill", "5-10", "15-30", "50-90", "60-80"],
    ["Hill", "5-10", "15-30", "70-100", "80-100"],
    ["Smooth", "2", "0", "0", "0"],
    ["Trough", "4-8", "15-30", "0-30", "0-20"],
    ["Trough", "4-8", "15-30", "10-50", "20-40"],
    ["Trough", "4-8", "15-30", "30-70", "40-60"],
    ["Trough", "4-8", "15-30", "50-90", "60-80"],
    ["Trough", "4-8", "15-30", "70-100", "80-100"],
    ["Invert", "0.25", "x", "0", "0"],
  ],
  shattered: [
    ["Hill", "8", "35-40", "15-85", "30-70"],
    ["Trough", "10-20", "40-50", "5-95", "5-95"],
    ["Range", "5-7", "30-40", "10-90", "20-80"],
    ["Pit", "12-20", "30-40", "15-85", "20-80"],
  ],
  taklamakan: [
    ["Hill", "1-3", "20-30", "30-70", "30-70"],
    ["Hill", "2-4", "60-85", "0-5", "0-100"],
    ["Hill", "2-4", "60-85", "95-100", "0-100"],
    ["Hill", "3-4", "60-85", "20-80", "0-5"],
    ["Hill", "3-4", "60-85", "20-80", "95-100"],
    ["Smooth", "3", "0", "0", "0"],
  ],
  oldWorld: [
    ["Range", "3", "70", "15-85", "20-80"],
    ["Hill", "2-3", "50-70", "15-45", "20-80"],
    ["Hill", "2-3", "50-70", "65-85", "20-80"],
    ["Hill", "4-6", "20-25", "15-85", "20-80"],
    ["Multiply", "0.5", "land", "0", "0"],
    ["Smooth", "2", "0", "0", "0"],
    ["Range", "3-4", "20-50", "15-35", "20-45"],
    ["Range", "2-4", "20-50", "65-85", "45-80"],
    ["Strait", "3-7", "vertical", "0", "0"],
    ["Trough", "6-8", "20-50", "15-85", "45-65"],
    ["Pit", "5-6", "20-30", "10-90", "10-90"],
  ],
  fractious: [
    ["Hill", "12-15", "50-80", "5-95", "5-95"],
    ["Mask", "-1.5", "0", "0", "0"],
    ["Mask", "3", "0", "0", "0"],
    ["Add", "-20", "30-100", "0", "0"],
    ["Range", "6-8", "40-50", "5-95", "10-90"],
  ],
};

const parseNumberSpec = (random: () => number, spec: string): number => {
  if (!Number.isNaN(Number(spec))) {
    const value = Number(spec);
    const integer = Math.trunc(value);
    const fraction = Math.abs(value - integer);
    if (fraction > 0 && random() < fraction) {
      return value >= 0 ? integer + 1 : integer - 1;
    }
    return integer;
  }

  const parts = spec.split("-");
  const sign = spec.startsWith("-") ? -1 : 1;
  const minPart = sign === -1 ? parts[1] : parts[0];
  const maxPart = sign === -1 ? parts[2] : parts[1];
  const min = Number.parseFloat(minPart ?? "0") * sign;
  const max = Number.parseFloat(maxPart ?? minPart ?? "0");
  return Math.round(lerp(min, max, random()));
};

const parsePercentRange = (spec: string): readonly [number, number] => {
  const [min = spec, max = spec] = spec.split("-");
  return [Number.parseFloat(min) / 100, Number.parseFloat(max) / 100];
};

const getBlobPower = (cells: number): number =>
  BLOB_POWER_BY_CELLS[cells] ?? 0.98;

const getLinePower = (cells: number): number =>
  LINE_POWER_BY_CELLS[cells] ?? 0.81;

const modifyHeightField = (
  field: Uint8Array,
  rangeSpec: string,
  add: number,
  multiply: number,
): void => {
  const min =
    rangeSpec === "land"
      ? 20
      : rangeSpec === "all"
        ? 0
        : Number(rangeSpec.split("-")[0] ?? 0);
  const max =
    rangeSpec === "land" || rangeSpec === "all"
      ? 100
      : Number(rangeSpec.split("-")[1] ?? 100);
  const isLand = rangeSpec === "land";

  for (let index = 0; index < field.length; index += 1) {
    let height = field[index] ?? 0;
    if (height < min || height > max) {
      continue;
    }

    if (add !== 0) {
      height = isLand ? Math.max(height + add, 20) : height + add;
    }

    if (multiply !== 1) {
      height = isLand ? (height - 20) * multiply + 20 : height * multiply;
    }

    field[index] = clamp(height, 0, 100);
  }
};

const smoothHeightField = (
  context: GenerationContext,
  field: Uint8Array,
  factor: number,
): void => {
  const scratch = new Float32Array(field.length);

  for (let cellId = 0; cellId < field.length; cellId += 1) {
    let sum = field[cellId] ?? 0;
    let count = 1;

    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        sum += field[neighborId] ?? 0;
        count += 1;
      },
    );

    const mean = sum / count;
    scratch[cellId] = clamp(
      ((field[cellId] ?? 0) * (factor - 1) + mean) / factor,
      0,
      100,
    );
  }

  field.set(scratch);
};

const maskHeightField = (
  context: GenerationContext,
  field: Uint8Array,
  power: number,
): void => {
  const factor = power === 0 ? 1 : Math.abs(power);
  const { width, height } = context.config;

  for (let cellId = 0; cellId < field.length; cellId += 1) {
    const x = context.world.cellsX[cellId] ?? 0;
    const y = context.world.cellsY[cellId] ?? 0;
    const nx = (2 * x) / width - 1;
    const ny = (2 * y) / height - 1;
    let distance = (1 - nx * nx) * (1 - ny * ny);
    if (power < 0) {
      distance = 1 - distance;
    }

    const base = field[cellId] ?? 0;
    const masked = base * distance;
    field[cellId] = clamp((base * (factor - 1) + masked) / factor, 0, 100);
  }
};

const applyStrait = (
  context: GenerationContext,
  field: Uint8Array,
  widthSpec: string,
  direction: string,
): void => {
  const desiredWidth = Math.max(1, parseNumberSpec(context.random, widthSpec));
  const vertical = direction === "vertical";
  const startCell = selectCellInRange(
    context,
    vertical ? 0.3 : 0,
    vertical ? 0.7 : 0.02,
    vertical ? 0 : 0.3,
    vertical ? 0.02 : 0.7,
  );
  const endCell = selectCellInRange(
    context,
    vertical ? 0.3 : 0.98,
    vertical ? 0.7 : 1,
    vertical ? 0.98 : 0.3,
    vertical ? 1 : 0.7,
  );
  let frontier = traceRangePath(context, startCell, endCell);
  const used = new Uint8Array(field.length);

  for (let layer = 0; layer < desiredWidth; layer += 1) {
    const nextFrontier: number[] = [];
    const exponent = 0.9 - 0.1;

    for (const cellId of frontier) {
      forEachNeighbor(
        cellId,
        context.world.cellNeighborOffsets,
        context.world.cellNeighbors,
        (neighborId) => {
          if ((used[neighborId] ?? 0) === 1) {
            return;
          }

          used[neighborId] = 1;
          nextFrontier.push(neighborId);
          field[neighborId] = clamp(
            (field[neighborId] ?? 0) ** exponent,
            0,
            100,
          );
        },
      );
    }

    frontier = nextFrontier;
  }
};

const temperatureAtLatitude = (
  latitude: number,
  equator: number,
  northPole: number,
  southPole: number,
): number => {
  const tropicsNorth = 16;
  const tropicsSouth = -20;
  const tropicalGradient = 0.15;
  const tempNorthTropic = equator - tropicsNorth * tropicalGradient;
  const northernGradient = (tempNorthTropic - northPole) / (90 - tropicsNorth);
  const tempSouthTropic = equator + tropicsSouth * tropicalGradient;
  const southernGradient = (tempSouthTropic - southPole) / (90 + tropicsSouth);

  if (latitude <= tropicsNorth && latitude >= tropicsSouth) {
    return equator - Math.abs(latitude) * tropicalGradient;
  }

  return latitude > 0
    ? tempNorthTropic - (latitude - tropicsNorth) * northernGradient
    : tempSouthTropic + (latitude - tropicsSouth) * southernGradient;
};

const calculateMapCoordinates = (
  width: number,
  height: number,
  mapSize: number,
  latitude: number,
  longitude: number,
): Readonly<{
  latT: number;
  latN: number;
  latS: number;
  lonT: number;
  lonW: number;
  lonE: number;
}> => {
  const sizeFraction = mapSize / 100;
  const latShift = latitude / 100;
  const lonShift = longitude / 100;
  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);
  const lonT = rn(Math.min((width / height) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);
  return { latT, latN, latS, lonT, lonW, lonE };
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getBoundaryPoints = (
  width: number,
  height: number,
  spacing: number,
): [number, number][] => {
  const offset = rn(-1 * spacing);
  const boundarySpacing = spacing * 2;
  const adjustedWidth = width - offset * 2;
  const adjustedHeight = height - offset * 2;
  const numberX = Math.ceil(adjustedWidth / boundarySpacing) - 1;
  const numberY = Math.ceil(adjustedHeight / boundarySpacing) - 1;
  const points: [number, number][] = [];

  for (let index = 0.5; index < numberX; index += 1) {
    const x = Math.ceil((adjustedWidth * index) / numberX + offset);
    points.push([x, offset], [x, adjustedHeight + offset]);
  }

  for (let index = 0.5; index < numberY; index += 1) {
    const y = Math.ceil((adjustedHeight * index) / numberY + offset);
    points.push([offset, y], [adjustedWidth + offset, y]);
  }

  return points;
};

const nextHalfedge = (edge: number): number =>
  edge % 3 === 2 ? edge - 2 : edge + 1;

const triangleOfEdge = (edge: number): number => Math.floor(edge / 3);

const edgesAroundPoint = (halfedges: Int32Array, start: number): number[] => {
  const result: number[] = [];
  let incoming = start;

  do {
    result.push(incoming);
    const outgoing = nextHalfedge(incoming);
    incoming = halfedges[outgoing] ?? -1;
  } while (incoming !== -1 && incoming !== start && result.length < 20);

  return result;
};

const circumcenter = (
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): readonly [number, number] => {
  const [ax, ay] = a;
  const [bx, by] = b;
  const [cx, cy] = c;
  const ad = ax * ax + ay * ay;
  const bd = bx * bx + by * by;
  const cd = cx * cx + cy * cy;
  const determinant = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));

  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) {
    return [Math.floor((ax + bx + cx) / 3), Math.floor((ay + by + cy) / 3)];
  }

  return [
    Math.floor(
      (ad * (by - cy) + bd * (cy - ay) + cd * (ay - by)) / determinant,
    ),
    Math.floor(
      (ad * (cx - bx) + bd * (ax - cx) + cd * (bx - ax)) / determinant,
    ),
  ];
};

const buildVoronoiAdjacency = (
  xs: Float32Array,
  ys: Float32Array,
  width: number,
  height: number,
  boundaryPoints: readonly [number, number][] = [],
): {
  offsets: Uint32Array;
  neighbors: Uint32Array;
  border: Uint8Array;
  vertexX: Float32Array;
  vertexY: Float32Array;
  cellVertexOffsets: Uint32Array;
  cellVertices: Uint32Array;
} => {
  const cellCount = xs.length;
  const corePoints: [number, number][] = Array.from(
    { length: cellCount },
    (_, index) => [xs[index] ?? 0, ys[index] ?? 0],
  );
  const allPoints = corePoints.concat(boundaryPoints);
  const delaunay = Delaunay.from(allPoints);
  const triangles = delaunay.triangles;
  const halfedges = delaunay.halfedges;
  const triangleCount = Math.floor(triangles.length / 3);
  const vertexX = new Float32Array(triangleCount);
  const vertexY = new Float32Array(triangleCount);
  const cellNeighborsById: number[][] = Array.from(
    { length: cellCount },
    () => [],
  );
  const cellVerticesById: number[][] = Array.from(
    { length: cellCount },
    () => [],
  );
  const border = new Uint8Array(cellCount);

  for (let triangleId = 0; triangleId < triangleCount; triangleId += 1) {
    const edge = triangleId * 3;
    const a = allPoints[triangles[edge] ?? 0] ?? [0, 0];
    const b = allPoints[triangles[edge + 1] ?? 0] ?? [0, 0];
    const c = allPoints[triangles[edge + 2] ?? 0] ?? [0, 0];
    const [x, y] = circumcenter(a, b, c);
    vertexX[triangleId] = x;
    vertexY[triangleId] = y;
  }

  for (let edge = 0; edge < triangles.length; edge += 1) {
    const cellId = triangles[nextHalfedge(edge)] ?? -1;
    if (
      cellId < 0 ||
      cellId >= cellCount ||
      cellNeighborsById[cellId]!.length > 0
    ) {
      continue;
    }

    const edges = edgesAroundPoint(halfedges, edge);
    const cellVertices = edges.map((currentEdge) =>
      triangleOfEdge(currentEdge),
    );
    const cellNeighbors = edges
      .map((currentEdge) => triangles[currentEdge] ?? -1)
      .filter((neighborId) => neighborId >= 0 && neighborId < cellCount);

    cellVerticesById[cellId] = cellVertices;
    cellNeighborsById[cellId] = cellNeighbors;
    border[cellId] = edges.length > cellNeighbors.length ? 1 : 0;
  }

  const offsets = new Uint32Array(cellCount + 1);
  const neighbors: number[] = [];
  const cellVertexOffsets = new Uint32Array(cellCount + 1);
  const cellVertices: number[] = [];

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    offsets[cellId] = neighbors.length;
    cellVertexOffsets[cellId] = cellVertices.length;
    neighbors.push(...(cellNeighborsById[cellId] ?? []));
    cellVertices.push(...(cellVerticesById[cellId] ?? []));
  }

  offsets[cellCount] = neighbors.length;
  cellVertexOffsets[cellCount] = cellVertices.length;

  return {
    offsets,
    neighbors: Uint32Array.from(neighbors),
    border,
    vertexX,
    vertexY,
    cellVertexOffsets,
    cellVertices: Uint32Array.from(cellVertices),
  };
};

const forEachNeighbor = (
  cellId: number,
  offsets: Uint32Array,
  neighbors: Uint32Array,
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

const isTopologyBorderCell = (
  cellId: number,
  vertexOffsets: Uint32Array,
  neighborOffsets: Uint32Array,
): boolean => {
  const vertexFrom = vertexOffsets[cellId];
  const vertexTo = vertexOffsets[cellId + 1];
  const neighborFrom = neighborOffsets[cellId];
  const neighborTo = neighborOffsets[cellId + 1];

  if (
    vertexFrom === undefined ||
    vertexTo === undefined ||
    neighborFrom === undefined ||
    neighborTo === undefined
  ) {
    return false;
  }

  return vertexTo - vertexFrom > neighborTo - neighborFrom;
};

const markDistanceField = (
  distanceField: Int8Array,
  cellCount: number,
  neighborOffsets: Uint32Array,
  neighbors: Uint32Array,
  start: number,
  increment: 1 | -1,
  limit = Number.POSITIVE_INFINITY,
): void => {
  for (
    let distance = start, marked = Number.POSITIVE_INFINITY;
    marked > 0 && distance !== limit;
    distance += increment
  ) {
    marked = 0;
    const previousDistance = distance - increment;

    for (let cellId = 0; cellId < cellCount; cellId += 1) {
      if ((distanceField[cellId] ?? 0) !== previousDistance) {
        continue;
      }

      forEachNeighbor(cellId, neighborOffsets, neighbors, (neighborId) => {
        if ((distanceField[neighborId] ?? 0) !== 0) {
          return;
        }

        distanceField[neighborId] = distance;
        marked += 1;
      });
    }
  }
};

type FrontierEntry = {
  cost: number;
  stateId: number;
  packId: number;
};

const compareFrontierEntries = (
  left: FrontierEntry,
  right: FrontierEntry,
): number => {
  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }

  if (left.stateId !== right.stateId) {
    return left.stateId - right.stateId;
  }

  return left.packId - right.packId;
};

const pushFrontierEntry = (
  heap: FrontierEntry[],
  entry: FrontierEntry,
): void => {
  heap.push(entry);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];
    if (!parent || compareFrontierEntries(parent, entry) <= 0) {
      break;
    }

    heap[index] = parent;
    index = parentIndex;
  }

  heap[index] = entry;
};

const popFrontierEntry = (heap: FrontierEntry[]): FrontierEntry | undefined => {
  const first = heap[0];
  const last = heap.pop();

  if (!first) {
    return undefined;
  }

  if (!last || heap.length === 0) {
    return first;
  }

  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = index;

    const left = heap[leftIndex];
    const right = heap[rightIndex];
    const current =
      smallestIndex === index ? last : (heap[smallestIndex] ?? last);

    if (left && compareFrontierEntries(left, current) < 0) {
      smallestIndex = leftIndex;
    }

    const smallest =
      smallestIndex === index ? last : (heap[smallestIndex] ?? last);
    if (right && compareFrontierEntries(right, smallest) < 0) {
      smallestIndex = rightIndex;
    }

    if (smallestIndex === index) {
      break;
    }

    heap[index] = heap[smallestIndex] as FrontierEntry;
    index = smallestIndex;
  }

  heap[index] = last;
  return first;
};

const polygonArea = (
  vertexIds: Uint32Array,
  from: number,
  to: number,
  vertexX: Float32Array,
  vertexY: Float32Array,
): number => {
  if (to - from < 3) {
    return 0;
  }

  let sum = 0;

  for (let index = from; index < to; index += 1) {
    const currentId = vertexIds[index] ?? 0;
    const nextId = vertexIds[index + 1 < to ? index + 1 : from] ?? 0;

    const x1 = vertexX[currentId] ?? 0;
    const y1 = vertexY[currentId] ?? 0;
    const x2 = vertexX[nextId] ?? 0;
    const y2 = vertexY[nextId] ?? 0;

    sum += x1 * y2 - x2 * y1;
  }

  return Math.abs(sum) / 2;
};

export const runGridStage = (context: GenerationContext): void => {
  const { width, height, requestedCells, jitter } = context.config;
  const gridRandom = context.random;

  const spacing = rn(Math.sqrt((width * height) / requestedCells), 2);
  const cellsX = Math.max(
    1,
    Math.floor((width + 0.5 * spacing - EPSILON) / spacing),
  );
  const cellsY = Math.max(
    1,
    Math.floor((height + 0.5 * spacing - EPSILON) / spacing),
  );

  const radius = spacing / 2;
  const jittering = radius * jitter;
  const cellCount = cellsX * cellsY;
  const boundaryPoints = getBoundaryPoints(width, height, spacing);

  context.grid.spacing = spacing;
  context.grid.cellsX = cellsX;
  context.grid.cellsY = cellsY;

  context.world.cellCount = cellCount;
  context.world.cellsX = new Float32Array(cellCount);
  context.world.cellsY = new Float32Array(cellCount);
  context.world.cellsBorder = new Uint8Array(cellCount);
  context.world.cellsArea = new Float32Array(cellCount);
  context.world.cellsH = new Uint8Array(cellCount);
  context.world.cellsCulture = new Uint16Array(cellCount);
  context.world.cultureCount = 0;
  context.world.cultureSeedCell = new Uint32Array(1);
  context.world.cultureSize = new Uint32Array(1);
  context.world.cellsBurg = new Uint16Array(cellCount);
  context.world.burgCount = 0;
  context.world.burgCell = new Uint32Array(1);
  context.world.burgX = new Float32Array(1);
  context.world.burgY = new Float32Array(1);
  context.world.burgPopulation = new Uint16Array(1);
  context.world.burgCapital = new Uint8Array(1);
  context.world.burgPort = new Uint8Array(1);
  context.world.burgCulture = new Uint16Array(1);
  context.world.cellsState = new Uint16Array(cellCount);
  context.world.stateCount = 0;
  context.world.stateCenterBurg = new Uint16Array(1);
  context.world.stateCulture = new Uint16Array(1);
  context.world.stateForm = new Uint8Array(1);
  context.world.stateCells = new Uint32Array(1);
  context.world.routeCount = 0;
  context.world.routeFromState = new Uint16Array(1);
  context.world.routeToState = new Uint16Array(1);
  context.world.routeKind = new Uint8Array(1);
  context.world.routeWeight = new Uint16Array(1);
  context.world.cellRouteOffsets = new Uint32Array(cellCount + 1);
  context.world.cellRouteNeighbors = new Uint32Array(0);
  context.world.cellRouteKinds = new Uint8Array(0);
  context.world.cellsProvince = new Uint16Array(cellCount);
  context.world.provinceCount = 0;
  context.world.provinceState = new Uint16Array(1);
  context.world.provinceCenterCell = new Uint32Array(1);
  context.world.provinceCells = new Uint32Array(1);
  context.world.cellsReligion = new Uint16Array(cellCount);
  context.world.religionCount = 0;
  context.world.religionSeedCell = new Uint32Array(1);
  context.world.religionType = new Uint8Array(1);
  context.world.religionSize = new Uint32Array(1);
  context.world.cellsMilitary = new Uint16Array(cellCount);
  context.world.militaryCount = 0;
  context.world.militaryCell = new Uint32Array(1);
  context.world.militaryState = new Uint16Array(1);
  context.world.militaryType = new Uint8Array(1);
  context.world.militaryStrength = new Uint16Array(1);
  context.world.markerCount = 0;
  context.world.markerCell = new Uint32Array(1);
  context.world.markerType = new Uint8Array(1);
  context.world.markerStrength = new Uint8Array(1);
  context.world.cellsZone = new Uint16Array(cellCount);
  context.world.zoneCount = 0;
  context.world.zoneSeedCell = new Uint32Array(1);
  context.world.zoneType = new Uint8Array(1);
  context.world.zoneCells = new Uint32Array(1);
  context.world.cellsFeature = new Uint8Array(cellCount);
  context.world.cellsFeatureId = new Uint32Array(cellCount);
  context.world.featureCount = 0;
  context.world.featureType = new Uint8Array(1);
  context.world.featureGroup = new Uint8Array(1);
  context.world.featureLand = new Uint8Array(1);
  context.world.featureBorder = new Uint8Array(1);
  context.world.featureSize = new Uint32Array(1);
  context.world.featureFirstCell = new Uint32Array(1);
  context.world.cellsCoast = new Int8Array(cellCount);
  context.world.cellsLandmass = new Uint32Array(cellCount);
  context.world.landmassCount = 0;
  context.world.landmassKind = new Uint8Array(1);
  context.world.landmassSize = new Uint32Array(1);
  context.world.landmassBorder = new Uint8Array(1);
  context.world.cellsTemp = new Int8Array(cellCount);
  context.world.cellsPrec = new Uint8Array(cellCount);
  context.world.cellsFlow = new Uint32Array(cellCount);
  context.world.cellsRiver = new Uint32Array(cellCount);
  context.world.cellsBiome = new Uint8Array(cellCount);
  context.world.cellsWaterbody = new Uint32Array(cellCount);
  context.world.waterbodyCount = 0;
  context.world.waterbodyType = new Uint8Array(1);
  context.world.waterbodyGroup = new Uint8Array(1);
  context.world.waterbodySize = new Uint32Array(1);
  context.world.packCellCount = 0;
  context.world.gridToPack = new Int32Array(cellCount);
  context.world.packToGrid = new Uint32Array(0);
  context.world.packX = new Float32Array(0);
  context.world.packY = new Float32Array(0);
  context.world.packH = new Uint8Array(0);
  context.world.packArea = new Float32Array(0);
  context.world.packNeighborOffsets = new Uint32Array(1);
  context.world.packNeighbors = new Uint32Array(0);
  context.world.packCellsFeatureId = new Uint32Array(0);
  context.world.packFeatureCount = 0;
  context.world.packFeatureType = new Uint8Array(1);
  context.world.packFeatureFeatureId = new Uint32Array(1);
  context.world.packFeatureBorder = new Uint8Array(1);
  context.world.packFeatureSize = new Uint32Array(1);
  context.world.packFeatureFirstCell = new Uint32Array(1);
  context.world.packCoast = new Int8Array(0);
  context.world.packHaven = new Int32Array(0);
  context.world.packHarbor = new Uint8Array(0);
  context.world.packVertexX = new Float32Array(0);
  context.world.packVertexY = new Float32Array(0);
  context.world.packCellVertexOffsets = new Uint32Array(1);
  context.world.packCellVertices = new Uint32Array(0);
  context.world.vertexX = new Float32Array(0);
  context.world.vertexY = new Float32Array(0);
  context.world.cellVertexOffsets = new Uint32Array(cellCount + 1);
  context.world.cellVertices = new Uint32Array(0);

  let index = 0;
  for (let row = 0; row < cellsY; row += 1) {
    const y = radius + row * spacing;

    for (let column = 0; column < cellsX; column += 1) {
      const x = radius + column * spacing;
      const xJitter = (gridRandom() * 2 - 1) * jittering;
      const yJitter = (gridRandom() * 2 - 1) * jittering;

      context.world.cellsX[index] = clamp(rn(x + xJitter, 2), 0, width);
      context.world.cellsY[index] = clamp(rn(y + yJitter, 2), 0, height);
      index += 1;
    }
  }

  const adjacency = buildVoronoiAdjacency(
    context.world.cellsX,
    context.world.cellsY,
    width,
    height,
    boundaryPoints,
  );
  context.world.cellNeighborOffsets = adjacency.offsets;
  context.world.cellNeighbors = adjacency.neighbors;
  context.world.cellsBorder = adjacency.border;
  context.world.vertexX = adjacency.vertexX;
  context.world.vertexY = adjacency.vertexY;
  context.world.cellVertexOffsets = adjacency.cellVertexOffsets;
  context.world.cellVertices = adjacency.cellVertices;

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const from = context.world.cellVertexOffsets[cellId] ?? 0;
    const to = context.world.cellVertexOffsets[cellId + 1] ?? from;

    context.world.cellsArea[cellId] = polygonArea(
      context.world.cellVertices,
      from,
      to,
      context.world.vertexX,
      context.world.vertexY,
    );
  }
};

export const runHeightmapStage = (context: GenerationContext): void => {
  const { width, height, heightNoise, heightTemplate, requestedCells } =
    context.config;
  const { cellCount, cellsH } = context.world;
  const heights = new Uint8Array(cellCount);
  const heightmapRandom = context.random;
  const blobPower = getBlobPower(requestedCells);
  const linePower = getLinePower(requestedCells);
  const steps = HEIGHTMAP_STEPS[heightTemplate] ?? [];

  const rand = (min?: number, max?: number): number => {
    if (min === undefined && max === undefined) {
      return heightmapRandom();
    }

    const low = max === undefined ? 0 : (min ?? 0);
    const high = max === undefined ? (min ?? 0) : max;
    return Math.floor(heightmapRandom() * (high - low + 1)) + low;
  };

  const probability = (value: number): boolean => {
    if (value >= 1) {
      return true;
    }
    if (value <= 0) {
      return false;
    }
    return heightmapRandom() < value;
  };

  const getNumberInRange = (spec: string): number => {
    if (!Number.isNaN(Number(spec))) {
      const value = Number(spec);
      return Math.trunc(value) + Number(probability(value - Math.trunc(value)));
    }

    const sign = spec[0] === "-" ? -1 : 1;
    let normalized = spec;
    if (Number.isNaN(Number(spec[0]))) {
      normalized = spec.slice(1);
    }
    const range = normalized.includes("-") ? normalized.split("-") : null;
    if (!range) {
      return 0;
    }

    const min = Number.parseFloat(range[0] ?? "0") * sign;
    const max = Number.parseFloat(range[1] ?? range[0] ?? "0");
    return rand(min, max);
  };

  const getPointInRange = (spec: string, length: number): number => {
    const min = Number.parseInt(spec.split("-")[0] ?? "0", 10) / 100 || 0;
    const max = Number.parseInt(spec.split("-")[1] ?? "0", 10) / 100 || min;
    return rand(min * length, max * length);
  };

  const findGridCell = (x: number, y: number): number => {
    return (
      Math.floor(Math.min(y / context.grid.spacing, context.grid.cellsY - 1)) *
        context.grid.cellsX +
      Math.floor(Math.min(x / context.grid.spacing, context.grid.cellsX - 1))
    );
  };

  const samplePointInRange = (
    rangeX: string,
    rangeY: string,
  ): Readonly<{ x: number; y: number; cellId: number }> => {
    const x = getPointInRange(rangeX, width);
    const y = getPointInRange(rangeY, height);
    return { x, y, cellId: findGridCell(x, y) };
  };

  const sampleEndPoint = (
    startX: number,
    startY: number,
    isTrough: boolean,
  ): Readonly<{ cellId: number; x: number; y: number }> => {
    let dist = 0;
    let limit = 0;
    let endX = 0;
    let endY = 0;

    do {
      endX = heightmapRandom() * width * 0.8 + width * 0.1;
      endY = heightmapRandom() * height * 0.7 + height * 0.15;
      dist = Math.abs(endY - startY) + Math.abs(endX - startX);
      limit += 1;
    } while (
      (dist < width / 8 || dist > width / (isTrough ? 2 : 3)) &&
      limit < 50
    );

    return { x: endX, y: endY, cellId: findGridCell(endX, endY) };
  };

  const neighborsOf = (cellId: number): number[] => {
    const neighbors: number[] = [];
    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        neighbors.push(neighborId);
      },
    );
    return neighbors;
  };

  const addHill = (
    count: string,
    heightSpec: string,
    rangeX: string,
    rangeY: string,
  ): void => {
    const addOneHill = () => {
      const change = new Uint8Array(heights.length);
      let limit = 0;
      let start = 0;
      const h = clamp(getNumberInRange(heightSpec), 0, 100);

      do {
        start = samplePointInRange(rangeX, rangeY).cellId;
        limit += 1;
      } while ((heights[start] ?? 0) + h > 90 && limit < 50);

      change[start] = h;
      const queue = [start];
      while (queue.length) {
        const current = queue.shift() ?? 0;
        for (const neighbor of neighborsOf(current)) {
          if ((change[neighbor] ?? 0) !== 0) {
            continue;
          }

          change[neighbor] =
            (change[current] ?? 0) ** blobPower *
            (heightmapRandom() * 0.2 + 0.9);
          if ((change[neighbor] ?? 0) > 1) {
            queue.push(neighbor);
          }
        }
      }

      for (let index = 0; index < heights.length; index += 1) {
        heights[index] = clamp(
          (heights[index] ?? 0) + (change[index] ?? 0),
          0,
          100,
        );
      }
    };

    const desiredCount = getNumberInRange(count);
    for (let index = 0; index < desiredCount; index += 1) {
      addOneHill();
    }
  };

  const addPit = (
    count: string,
    heightSpec: string,
    rangeX: string,
    rangeY: string,
  ): void => {
    const addOnePit = () => {
      const used = new Uint8Array(heights.length);
      let limit = 0;
      let start = 0;
      let h = clamp(getNumberInRange(heightSpec), 0, 100);

      do {
        start = samplePointInRange(rangeX, rangeY).cellId;
        limit += 1;
      } while ((heights[start] ?? 0) < 20 && limit < 50);

      const queue = [start];
      while (queue.length) {
        const current = queue.shift() ?? 0;
        h = h ** blobPower * (heightmapRandom() * 0.2 + 0.9);
        if (h < 1) {
          return;
        }

        for (const neighbor of neighborsOf(current)) {
          if ((used[neighbor] ?? 0) === 1) {
            continue;
          }

          heights[neighbor] = clamp(
            (heights[neighbor] ?? 0) - h * (heightmapRandom() * 0.2 + 0.9),
            0,
            100,
          );
          used[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    };

    const desiredCount = getNumberInRange(count);
    for (let index = 0; index < desiredCount; index += 1) {
      addOnePit();
    }
  };

  const tracePath = (
    startCellId: number,
    endCellId: number,
    randomDividerChance: number,
    used: Uint8Array,
  ): number[] => {
    const path = [startCellId];
    let current = startCellId;
    used[current] = 1;

    while (current !== endCellId) {
      let min = Number.POSITIVE_INFINITY;
      let next = current;

      for (const neighbor of neighborsOf(current)) {
        if ((used[neighbor] ?? 0) === 1) {
          continue;
        }

        let diff =
          ((context.world.cellsX[endCellId] ?? 0) -
            (context.world.cellsX[neighbor] ?? 0)) **
            2 +
          ((context.world.cellsY[endCellId] ?? 0) -
            (context.world.cellsY[neighbor] ?? 0)) **
            2;
        if (heightmapRandom() > randomDividerChance) {
          diff /= 2;
        }
        if (diff < min) {
          min = diff;
          next = neighbor;
        }
      }

      if (min === Number.POSITIVE_INFINITY) {
        return path;
      }

      current = next;
      path.push(current);
      used[current] = 1;
    }

    return path;
  };

  const shapeRange = (
    count: string,
    heightSpec: string,
    rangeX: string,
    rangeY: string,
    isTrough: boolean,
  ): void => {
    const addOne = () => {
      const used = new Uint8Array(heights.length);
      let h = clamp(getNumberInRange(heightSpec), 0, 100);
      let startCellId = 0;
      let endCellId = 0;

      if (rangeX && rangeY) {
        let startX = 0;
        let startY = 0;
        let limit = 0;

        if (isTrough) {
          do {
            const start = samplePointInRange(rangeX, rangeY);
            startX = start.x;
            startY = start.y;
            startCellId = start.cellId;
            limit += 1;
          } while ((heights[startCellId] ?? 0) < 20 && limit < 50);
        } else {
          const start = samplePointInRange(rangeX, rangeY);
          startX = start.x;
          startY = start.y;
          startCellId = start.cellId;
        }

        endCellId = sampleEndPoint(startX, startY, isTrough).cellId;
      }

      const ridge = tracePath(
        startCellId,
        endCellId,
        isTrough ? 0.8 : 0.85,
        used,
      );

      let queue = ridge.slice();
      let iterations = 0;
      while (queue.length) {
        const frontier = queue.slice();
        queue = [];
        iterations += 1;

        for (const cellId of frontier) {
          heights[cellId] = clamp(
            (heights[cellId] ?? 0) +
              (isTrough ? -1 : 1) * h * (heightmapRandom() * 0.3 + 0.85),
            0,
            100,
          );
        }

        h = h ** linePower - 1;
        if (h < 2) {
          break;
        }

        for (const cellId of frontier) {
          for (const neighbor of neighborsOf(cellId)) {
            if ((used[neighbor] ?? 0) === 1) {
              continue;
            }

            queue.push(neighbor);
            used[neighbor] = 1;
          }
        }
      }

      ridge.forEach((currentCell, distance) => {
        if (distance % 6 !== 0) {
          return;
        }

        let cursor = currentCell;
        for (let index = 0; index < iterations; index += 1) {
          const neighbors = neighborsOf(cursor);
          if (neighbors.length === 0) {
            break;
          }

          let lowest = neighbors[0] ?? 0;
          for (const neighbor of neighbors) {
            if ((heights[neighbor] ?? 0) < (heights[lowest] ?? 0)) {
              lowest = neighbor;
            }
          }

          heights[lowest] =
            ((heights[cursor] ?? 0) * 2 + (heights[lowest] ?? 0)) / 3;
          cursor = lowest;
        }
      });
    };

    const desiredCount = getNumberInRange(count);
    for (let index = 0; index < desiredCount; index += 1) {
      addOne();
    }
  };

  const addStrait = (widthSpec: string, direction = "vertical"): void => {
    const desiredWidth = Math.min(
      getNumberInRange(widthSpec),
      context.grid.cellsX / 3,
    );
    if (desiredWidth < 1 && probability(desiredWidth)) {
      return;
    }

    const used = new Uint8Array(heights.length);
    const vertical = direction === "vertical";
    const startX = vertical
      ? Math.floor(heightmapRandom() * width * 0.4 + width * 0.3)
      : 5;
    const startY = vertical
      ? 5
      : Math.floor(heightmapRandom() * height * 0.4 + height * 0.3);
    const endX = vertical
      ? Math.floor(
          width - startX - width * 0.1 + heightmapRandom() * width * 0.2,
        )
      : width - 5;
    const endY = vertical
      ? height - 5
      : Math.floor(
          height - startY - height * 0.1 + heightmapRandom() * height * 0.2,
        );
    const startCellId = findGridCell(startX, startY);
    const endCellId = findGridCell(endX, endY);

    const getStraitPath = (start: number, end: number): number[] => {
      const path: number[] = [];
      let current = start;

      while (current !== end) {
        let min = Number.POSITIVE_INFINITY;
        let next = current;

        for (const neighbor of neighborsOf(current)) {
          let diff =
            ((context.world.cellsX[end] ?? 0) -
              (context.world.cellsX[neighbor] ?? 0)) **
              2 +
            ((context.world.cellsY[end] ?? 0) -
              (context.world.cellsY[neighbor] ?? 0)) **
              2;
          if (heightmapRandom() > 0.8) {
            diff /= 2;
          }
          if (diff < min) {
            min = diff;
            next = neighbor;
          }
        }

        const nextCell = next;
        current = nextCell;
        path.push(current);
      }

      return path;
    };

    let frontier = getStraitPath(startCellId, endCellId);
    const query: number[] = [];
    const step = 0.1 / desiredWidth;

    for (let layer = 0; layer < desiredWidth; layer += 1) {
      const exponent = 0.9 - step * desiredWidth;

      for (const cellId of frontier) {
        for (const neighbor of neighborsOf(cellId)) {
          if ((used[neighbor] ?? 0) === 1) {
            continue;
          }
          used[neighbor] = 1;
          query.push(neighbor);
          heights[neighbor] = (heights[neighbor] ?? 0) ** exponent;
          if ((heights[neighbor] ?? 0) > 100) {
            heights[neighbor] = 5;
          }
        }
      }

      frontier = query.slice();
    }
  };

  const invertHeightField = (count: number, axes: string): void => {
    if (!probability(count)) {
      return;
    }

    const invertX = axes !== "y";
    const invertY = axes !== "x";
    const { cellsX, cellsY } = context.grid;
    const inverted = new Uint8Array(heights.length);

    for (let index = 0; index < heights.length; index += 1) {
      const x = index % cellsX;
      const y = Math.floor(index / cellsX);
      const nx = invertX ? cellsX - x - 1 : x;
      const ny = invertY ? cellsY - y - 1 : y;
      const invertedIndex = nx + ny * cellsX;
      inverted[index] = heights[invertedIndex] ?? 0;
    }

    heights.set(inverted);
  };

  for (const [tool, a2, a3, a4, a5] of steps) {
    if (tool === "Hill") {
      addHill(a2, a3, a4, a5);
      continue;
    }
    if (tool === "Pit") {
      addPit(a2, a3, a4, a5);
      continue;
    }
    if (tool === "Range") {
      shapeRange(a2, a3, a4, a5, false);
      continue;
    }
    if (tool === "Trough") {
      shapeRange(a2, a3, a4, a5, true);
      continue;
    }
    if (tool === "Strait") {
      addStrait(a2, a3);
      continue;
    }
    if (tool === "Mask") {
      maskHeightField(context, heights, Number(a2));
      continue;
    }
    if (tool === "Invert") {
      invertHeightField(Number(a2), a3);
      continue;
    }
    if (tool === "Add") {
      modifyHeightField(heights, a3, Number(a2), 1);
      continue;
    }
    if (tool === "Multiply") {
      modifyHeightField(heights, a3, 0, Number(a2));
      continue;
    }
    if (tool === "Smooth") {
      smoothHeightField(context, heights, Number(a2));
    }
  }

  if (heightNoise > 0) {
    const noiseSeed = hashSeed(
      `${context.config.seed}:${heightTemplate}:detail`,
    );
    for (let index = 0; index < cellCount; index += 1) {
      const x = (context.world.cellsX[index] ?? 0) / width;
      const y = (context.world.cellsY[index] ?? 0) / height;
      const detail =
        sampleValueNoise(noiseSeed, x, y, 8, 6.5) * heightNoise * 3;
      heights[index] = clamp((heights[index] ?? 0) + detail, 0, 100);
    }
  }

  cellsH.set(heights);
};

export const runFeatureStage = (context: GenerationContext): void => {
  const { seaLevel } = context.config;
  const {
    cellCount,
    cellsH,
    cellsFeature,
    cellsCoast,
    cellNeighborOffsets,
    cellNeighbors,
  } = context.world;

  const featureIds = new Uint32Array(cellCount);

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const height = cellsH[cellId] ?? 0;
    cellsFeature[cellId] = height >= seaLevel ? 1 : 0;
    cellsCoast[cellId] = 0;
  }

  let nextFeatureId = 0;

  for (let startCell = 0; startCell < cellCount; startCell += 1) {
    if ((featureIds[startCell] ?? 0) !== 0) {
      continue;
    }

    nextFeatureId += 1;
    const queue = [startCell];
    featureIds[startCell] = nextFeatureId;
    const land = (cellsFeature[startCell] ?? 0) === 1;

    while (queue.length > 0) {
      const cellId = queue.pop();
      if (cellId === undefined) {
        break;
      }

      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          const neighborIsLand = (cellsFeature[neighborId] ?? 0) === 1;

          if (land === neighborIsLand) {
            if ((featureIds[neighborId] ?? 0) !== 0) {
              return;
            }

            featureIds[neighborId] = nextFeatureId;
            queue.push(neighborId);
            return;
          }

          if (land) {
            cellsCoast[cellId] = 1;
            cellsCoast[neighborId] = -1;
          }
        },
      );
    }
  }

  markDistanceField(
    cellsCoast,
    cellCount,
    cellNeighborOffsets,
    cellNeighbors,
    2,
    1,
    11,
  );
  markDistanceField(
    cellsCoast,
    cellCount,
    cellNeighborOffsets,
    cellNeighbors,
    -2,
    -1,
    -10,
  );
};

export const runDeepDepressionLakeStage = (
  context: GenerationContext,
): boolean => {
  const elevationLimit = context.config.climate.lakeElevationLimit;
  if (elevationLimit >= 80) {
    return false;
  }

  const { cellCount, cellsBorder, cellsH, cellNeighborOffsets, cellNeighbors } =
    context.world;

  let changed = false;

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsBorder[cellId] ?? 0) === 1 || (cellsH[cellId] ?? 0) < 20) {
      continue;
    }

    let minNeighborHeight = Number.POSITIVE_INFINITY;
    const equalHeightNeighbors: number[] = [];
    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        const neighborHeight = cellsH[neighborId] ?? 0;
        if (neighborHeight < minNeighborHeight) {
          minNeighborHeight = neighborHeight;
        }
        if (neighborHeight === (cellsH[cellId] ?? 0)) {
          equalHeightNeighbors.push(neighborId);
        }
      },
    );

    if ((cellsH[cellId] ?? 0) > minNeighborHeight) {
      continue;
    }

    let deep = true;
    const threshold = (cellsH[cellId] ?? 0) + elevationLimit;
    const queue = [cellId];
    const checked = new Uint8Array(cellCount);
    checked[cellId] = 1;

    while (deep && queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        break;
      }

      forEachNeighbor(
        current,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          if (!deep || (checked[neighborId] ?? 0) === 1) {
            return;
          }

          const neighborHeight = cellsH[neighborId] ?? 0;
          if (neighborHeight >= threshold) {
            return;
          }
          if (neighborHeight < 20) {
            deep = false;
            return;
          }

          checked[neighborId] = 1;
          queue.push(neighborId);
        },
      );
    }

    if (!deep) {
      continue;
    }

    cellsH[cellId] = 19;
    for (const neighborId of equalHeightNeighbors) {
      cellsH[neighborId] = 19;
    }
    changed = true;
  }

  return changed;
};

export const runPackStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsX,
    cellsY,
    cellsH,
    cellsCoast,
    cellNeighborOffsets,
    cellNeighbors,
    gridToPack,
  } = context.world;
  const retentionCoast = context.internal.packRetentionCoast ?? cellsCoast;

  gridToPack.fill(-1);

  const spacingSquared = context.grid.spacing * context.grid.spacing;
  const packSources: number[] = [];
  const pointX: number[] = [];
  const pointY: number[] = [];
  const pointH: number[] = [];
  const pointCoast: number[] = [];

  const includeGridCell = (cellId: number): boolean => {
    const height = cellsH[cellId] ?? 0;
    const coast = retentionCoast[cellId] ?? 0;
    if (height >= 20) {
      return true;
    }
    if (coast !== -1 && coast !== -2) {
      return false;
    }
    if (coast === -2) {
      if (cellId % 4 === 0) {
        return false;
      }
    }
    return true;
  };

  const pushPackPoint = (cellId: number, x: number, y: number): void => {
    packSources.push(cellId);
    pointX.push(x);
    pointY.push(y);
    pointH.push(cellsH[cellId] ?? 0);
    pointCoast.push(retentionCoast[cellId] ?? 0);
  };

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if (!includeGridCell(cellId)) {
      continue;
    }

    const x = cellsX[cellId] ?? 0;
    const y = cellsY[cellId] ?? 0;
    pushPackPoint(cellId, x, y);

    const coast = retentionCoast[cellId] ?? 0;
    if (coast !== 1 && coast !== -1) {
      continue;
    }

    if ((context.world.cellsBorder[cellId] ?? 0) === 1) {
      continue;
    }

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborCellId) => {
        if (cellId > neighborCellId) {
          return;
        }

        if ((retentionCoast[neighborCellId] ?? 0) !== coast) {
          return;
        }

        const dx = (cellsX[neighborCellId] ?? 0) - x;
        const dy = (cellsY[neighborCellId] ?? 0) - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < spacingSquared) {
          return;
        }

        pushPackPoint(
          cellId,
          rn((x + (cellsX[neighborCellId] ?? 0)) / 2, 1),
          rn((y + (cellsY[neighborCellId] ?? 0)) / 2, 1),
        );
      },
    );
  }

  const packCellCount = packSources.length;
  const packToGrid = Uint32Array.from(packSources);
  const packX = Float32Array.from(pointX);
  const packY = Float32Array.from(pointY);
  const packH = Uint8Array.from(pointH);
  const packArea = new Float32Array(packCellCount);
  const packCoast = new Int8Array(packCellCount);
  const packHaven = new Int32Array(packCellCount);
  const packHarbor = new Uint8Array(packCellCount);
  const packAdjacency = buildVoronoiAdjacency(
    packX,
    packY,
    context.config.width,
    context.config.height,
    getBoundaryPoints(
      context.config.width,
      context.config.height,
      context.grid.spacing,
    ),
  );
  packHaven.fill(-1);

  for (let packId = 0; packId < packCellCount; packId += 1) {
    const gridCellId = packToGrid[packId] ?? 0;
    const vertexFrom = packAdjacency.cellVertexOffsets[packId] ?? 0;
    const vertexTo = packAdjacency.cellVertexOffsets[packId + 1] ?? vertexFrom;
    const isPrimaryPackCell =
      Math.abs((packX[packId] ?? 0) - (cellsX[gridCellId] ?? 0)) < 1e-6 &&
      Math.abs((packY[packId] ?? 0) - (cellsY[gridCellId] ?? 0)) < 1e-6;
    if (isPrimaryPackCell && (gridToPack[gridCellId] ?? -1) === -1) {
      gridToPack[gridCellId] = packId;
    }

    packArea[packId] = polygonArea(
      packAdjacency.cellVertices,
      vertexFrom,
      vertexTo,
      packAdjacency.vertexX,
      packAdjacency.vertexY,
    );
  }

  context.world.packCellCount = packCellCount;
  context.world.packToGrid = packToGrid;
  context.world.packX = packX;
  context.world.packY = packY;
  context.world.packH = packH;
  context.world.packArea = packArea;
  context.world.packNeighborOffsets = packAdjacency.offsets;
  context.world.packNeighbors = packAdjacency.neighbors;
  context.world.packCellsFeatureId = new Uint32Array(packCellCount);
  context.world.packCoast = packCoast;
  context.world.packHaven = packHaven;
  context.world.packHarbor = packHarbor;
  context.world.packVertexX = packAdjacency.vertexX;
  context.world.packVertexY = packAdjacency.vertexY;
  context.world.packCellVertexOffsets = packAdjacency.cellVertexOffsets;
  context.world.packCellVertices = packAdjacency.cellVertices;
};

export const runPackFeatureStage = (context: GenerationContext): void => {
  const {
    cellsLandmass,
    cellsWaterbody,
    packH,
    packCellCount,
    packToGrid,
    packX,
    packY,
    packNeighborOffsets,
    packNeighbors,
    packCellVertexOffsets,
    packCellsFeatureId,
    waterbodyCount,
  } = context.world;
  const { seaLevel } = context.config;

  packCellsFeatureId.fill(0);

  if (packCellCount <= 0) {
    context.world.packFeatureCount = 0;
    context.world.packFeatureType = new Uint8Array(1);
    context.world.packFeatureFeatureId = new Uint32Array(1);
    context.world.packFeatureBorder = new Uint8Array(1);
    context.world.packFeatureSize = new Uint32Array(1);
    context.world.packFeatureFirstCell = new Uint32Array(1);
    return;
  }

  let packFeatureCount = 0;
  const packCoast = new Int8Array(packCellCount);
  const packHaven = new Int32Array(packCellCount);
  const packHarbor = new Uint8Array(packCellCount);
  const packFeatureType: number[] = [0];
  const packFeatureFeatureId: number[] = [0];
  const packFeatureBorder: number[] = [0];
  const packFeatureSize: number[] = [0];
  const packFeatureFirstCell: number[] = [0];
  const isLandPackCell = (packId: number): boolean =>
    (packH[packId] ?? 0) >= seaLevel;
  const isFeatureBoundaryCell = (packId: number, land: boolean): boolean => {
    if (
      isTopologyBorderCell(packId, packCellVertexOffsets, packNeighborOffsets)
    ) {
      return true;
    }

    let boundary = false;
    forEachNeighbor(
      packId,
      packNeighborOffsets,
      packNeighbors,
      (neighborId) => {
        if (boundary) {
          return;
        }

        if (isLandPackCell(neighborId) !== land) {
          boundary = true;
        }
      },
    );

    return boundary;
  };
  packHaven.fill(-1);

  const defineHaven = (packId: number): void => {
    let closestPackId = -1;
    let closestDistanceSquared = Number.POSITIVE_INFINITY;
    let adjacentWaterCount = 0;
    const x = packX[packId] ?? 0;
    const y = packY[packId] ?? 0;

    forEachNeighbor(
      packId,
      packNeighborOffsets,
      packNeighbors,
      (neighborId) => {
        if (isLandPackCell(neighborId)) {
          return;
        }

        adjacentWaterCount += 1;
        const dx = (packX[neighborId] ?? 0) - x;
        const dy = (packY[neighborId] ?? 0) - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < closestDistanceSquared) {
          closestDistanceSquared = distanceSquared;
          closestPackId = neighborId;
        }
      },
    );

    packHarbor[packId] = Math.min(adjacentWaterCount, 255);
    if (closestPackId >= 0) {
      packHaven[packId] = packToGrid[closestPackId] ?? -1;
    }
  };

  for (
    let startPackCell = 0;
    startPackCell < packCellCount;
    startPackCell += 1
  ) {
    if ((packCellsFeatureId[startPackCell] ?? 0) !== 0) {
      continue;
    }

    packFeatureCount += 1;
    const packFeatureId = packFeatureCount;
    const queue = [startPackCell];
    packCellsFeatureId[startPackCell] = packFeatureId;

    let size = 0;
    let border = false;
    const land = isLandPackCell(startPackCell);
    let firstBoundaryPackCell = Number.POSITIVE_INFINITY;
    let sourceFeatureId = 0;

    while (queue.length > 0) {
      const packCellId = queue.pop();
      if (packCellId === undefined) {
        break;
      }

      size += 1;
      if (sourceFeatureId === 0) {
        const gridCellId = packToGrid[packCellId] ?? 0;
        sourceFeatureId = land
          ? waterbodyCount + (cellsLandmass[gridCellId] ?? 0)
          : (cellsWaterbody[gridCellId] ?? 0);
      }
      if (
        isTopologyBorderCell(
          packCellId,
          packCellVertexOffsets,
          packNeighborOffsets,
        )
      ) {
        border = true;
      }
      if (isFeatureBoundaryCell(packCellId, land)) {
        firstBoundaryPackCell = Math.min(firstBoundaryPackCell, packCellId);
      }

      forEachNeighbor(
        packCellId,
        packNeighborOffsets,
        packNeighbors,
        (neighborPackId) => {
          const neighborIsLand = isLandPackCell(neighborPackId);

          if (land && !neighborIsLand) {
            packCoast[packCellId] = 1;
            packCoast[neighborPackId] = -1;
            if ((packHaven[packCellId] ?? -1) < 0) {
              defineHaven(packCellId);
            }
          } else if (land && neighborIsLand) {
            if (
              (packCoast[neighborPackId] ?? 0) === 0 &&
              (packCoast[packCellId] ?? 0) === 1
            ) {
              packCoast[neighborPackId] = 2;
            } else if (
              (packCoast[packCellId] ?? 0) === 0 &&
              (packCoast[neighborPackId] ?? 0) === 1
            ) {
              packCoast[packCellId] = 2;
            }
          }

          if (
            (packCellsFeatureId[neighborPackId] ?? 0) !== 0 ||
            neighborIsLand !== land
          ) {
            return;
          }

          packCellsFeatureId[neighborPackId] = packFeatureId;
          queue.push(neighborPackId);
        },
      );
    }

    packFeatureType[packFeatureId] = land ? 3 : border ? 1 : 2;
    packFeatureFeatureId[packFeatureId] = sourceFeatureId;
    packFeatureBorder[packFeatureId] = border ? 1 : 0;
    packFeatureSize[packFeatureId] = size;
    packFeatureFirstCell[packFeatureId] =
      land || !border
        ? Number.isFinite(firstBoundaryPackCell)
          ? firstBoundaryPackCell
          : startPackCell
        : startPackCell;
  }

  markDistanceField(
    packCoast,
    packCellCount,
    packNeighborOffsets,
    packNeighbors,
    3,
    1,
  );
  markDistanceField(
    packCoast,
    packCellCount,
    packNeighborOffsets,
    packNeighbors,
    -2,
    -1,
    -10,
  );

  context.world.packFeatureCount = packFeatureCount;
  context.world.packCoast = packCoast;
  context.world.packHaven = packHaven;
  context.world.packHarbor = packHarbor;
  context.world.packFeatureType = Uint8Array.from(packFeatureType);
  context.world.packFeatureFeatureId = Uint32Array.from(packFeatureFeatureId);
  context.world.packFeatureBorder = Uint8Array.from(packFeatureBorder);
  context.world.packFeatureSize = Uint32Array.from(packFeatureSize);
  context.world.packFeatureFirstCell = Uint32Array.from(packFeatureFirstCell);
};

export const runGridFeatureMarkupStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsLandmass,
    landmassCount,
    landmassKind,
    landmassBorder,
    landmassSize,
    cellsWaterbody,
    waterbodyCount,
    waterbodyType,
    waterbodyGroup,
    waterbodySize,
    cellsFeatureId,
    cellNeighborOffsets,
    cellNeighbors,
  } = context.world;

  cellsFeatureId.fill(0);

  const featureCount = waterbodyCount + landmassCount;
  if (featureCount <= 0) {
    context.world.featureCount = 0;
    context.world.featureType = new Uint8Array(1);
    context.world.featureGroup = new Uint8Array(1);
    context.world.featureLand = new Uint8Array(1);
    context.world.featureBorder = new Uint8Array(1);
    context.world.featureSize = new Uint32Array(1);
    context.world.featureFirstCell = new Uint32Array(1);
    return;
  }

  const featureType = new Uint8Array(featureCount + 1);
  const featureGroup = new Uint8Array(featureCount + 1);
  const featureLand = new Uint8Array(featureCount + 1);
  const featureBorder = new Uint8Array(featureCount + 1);
  const featureSize = new Uint32Array(featureCount + 1);
  const featureFirstCell = new Uint32Array(featureCount + 1);

  for (let waterbodyId = 1; waterbodyId <= waterbodyCount; waterbodyId += 1) {
    featureType[waterbodyId] =
      (waterbodyType[waterbodyId] ?? 0) === WATERBODY_TYPE_OCEAN ? 1 : 2;
    featureGroup[waterbodyId] = waterbodyGroup[waterbodyId] ?? 0;
    featureLand[waterbodyId] = 0;
    featureBorder[waterbodyId] =
      (waterbodyType[waterbodyId] ?? 0) === WATERBODY_TYPE_OCEAN ? 1 : 0;
    featureSize[waterbodyId] = waterbodySize[waterbodyId] ?? 0;
  }

  const landmassTouchesOcean = new Uint8Array(landmassCount + 1);
  const landmassTouchesLake = new Uint8Array(landmassCount + 1);

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const landmassId = cellsLandmass[cellId] ?? 0;
    if (landmassId <= 0) {
      continue;
    }

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if ((cellsFeature[neighborId] ?? 0) !== 0) {
          return;
        }

        const waterbodyId = cellsWaterbody[neighborId] ?? 0;
        if (waterbodyId <= 0) {
          return;
        }

        if ((waterbodyType[waterbodyId] ?? 0) === WATERBODY_TYPE_OCEAN) {
          landmassTouchesOcean[landmassId] = 1;
        } else {
          landmassTouchesLake[landmassId] = 1;
        }
      },
    );
  }

  for (let landmassId = 1; landmassId <= landmassCount; landmassId += 1) {
    const featureId = waterbodyCount + landmassId;
    featureType[featureId] = 3;
    featureGroup[featureId] =
      (landmassTouchesOcean[landmassId] ?? 0) === 0 &&
      (landmassTouchesLake[landmassId] ?? 0) === 1
        ? FEATURE_GROUP_LAKE_ISLAND
        : (landmassKind[landmassId] ?? 0) === 1
          ? FEATURE_GROUP_CONTINENT
          : (landmassKind[landmassId] ?? 0) === 2
            ? FEATURE_GROUP_ISLAND
            : FEATURE_GROUP_ISLE;
    featureLand[featureId] = 1;
    featureBorder[featureId] = landmassBorder[landmassId] ?? 0;
    featureSize[featureId] = landmassSize[landmassId] ?? 0;
  }

  const seen = new Uint8Array(featureCount + 1);

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const isLand = (cellsFeature[cellId] ?? 0) === 1;
    const featureId = isLand
      ? waterbodyCount + (cellsLandmass[cellId] ?? 0)
      : (cellsWaterbody[cellId] ?? 0);

    if (featureId <= 0 || featureId > featureCount) {
      throw new Error("grid feature markup produced invalid feature id");
    }

    cellsFeatureId[cellId] = featureId;
    if ((seen[featureId] ?? 0) === 0) {
      seen[featureId] = 1;
      featureFirstCell[featureId] = cellId;
    }
  }

  context.world.featureCount = featureCount;
  context.world.featureType = featureType;
  context.world.featureGroup = featureGroup;
  context.world.featureLand = featureLand;
  context.world.featureBorder = featureBorder;
  context.world.featureSize = featureSize;
  context.world.featureFirstCell = featureFirstCell;
};

export const runLandmassStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsBorder,
    cellsFeature,
    cellNeighborOffsets,
    cellNeighbors,
    cellsLandmass,
  } = context.world;

  cellsLandmass.fill(0);

  let landmassCount = 0;
  const landmassKind: number[] = [0];
  const landmassSize: number[] = [0];
  const landmassBorder: number[] = [0];

  const continentThreshold = Math.max(1, Math.floor(cellCount / 10));
  const islandThreshold = Math.max(1, Math.floor(cellCount / 1000));

  for (let startCell = 0; startCell < cellCount; startCell += 1) {
    const isLand = (cellsFeature[startCell] ?? 0) === 1;
    if (!isLand || (cellsLandmass[startCell] ?? 0) !== 0) {
      continue;
    }

    landmassCount += 1;
    const landmassId = landmassCount;
    const queue = [startCell];
    cellsLandmass[startCell] = landmassId;

    let size = 0;
    let border = false;

    while (queue.length > 0) {
      const cellId = queue.pop();
      if (cellId === undefined) {
        break;
      }

      size += 1;
      if ((cellsBorder[cellId] ?? 0) === 1) {
        border = true;
      }

      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          const neighborIsLand = (cellsFeature[neighborId] ?? 0) === 1;
          const assigned = cellsLandmass[neighborId] ?? 0;

          if (!neighborIsLand || assigned !== 0) {
            return;
          }

          cellsLandmass[neighborId] = landmassId;
          queue.push(neighborId);
        },
      );
    }

    let kind = 3;
    if (size >= continentThreshold) {
      kind = 1;
    } else if (size >= islandThreshold) {
      kind = 2;
    }

    landmassKind[landmassId] = kind;
    landmassSize[landmassId] = size;
    landmassBorder[landmassId] = border ? 1 : 0;
  }

  context.world.landmassCount = landmassCount;
  context.world.landmassKind = Uint8Array.from(landmassKind);
  context.world.landmassSize = Uint32Array.from(landmassSize);
  context.world.landmassBorder = Uint8Array.from(landmassBorder);
};

export const runWaterbodyStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsBorder,
    cellsFeature,
    cellNeighborOffsets,
    cellNeighbors,
    cellsWaterbody,
  } = context.world;

  cellsWaterbody.fill(0);

  let waterbodyCount = 0;
  const waterbodyType: number[] = [0];
  const waterbodyGroup: number[] = [WATERBODY_GROUP_NONE];
  const waterbodySize: number[] = [0];
  const oceanMinSize = cellCount / 25;
  const seaMinSize = cellCount / 1000;

  for (let startCell = 0; startCell < cellCount; startCell += 1) {
    const isWater = (cellsFeature[startCell] ?? 0) === 0;
    if (!isWater || (cellsWaterbody[startCell] ?? 0) !== 0) {
      continue;
    }

    waterbodyCount += 1;
    const waterbodyId = waterbodyCount;
    const queue = [startCell];
    cellsWaterbody[startCell] = waterbodyId;

    let size = 0;
    let border = false;

    while (queue.length > 0) {
      const cellId = queue.pop();
      if (cellId === undefined) {
        break;
      }

      size += 1;
      if ((cellsBorder[cellId] ?? 0) === 1) {
        border = true;
      }

      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          const neighborIsWater = (cellsFeature[neighborId] ?? 0) === 0;
          const assigned = cellsWaterbody[neighborId] ?? 0;

          if (!neighborIsWater || assigned !== 0) {
            return;
          }

          cellsWaterbody[neighborId] = waterbodyId;
          queue.push(neighborId);
        },
      );
    }

    waterbodyType[waterbodyId] = border
      ? WATERBODY_TYPE_OCEAN
      : WATERBODY_TYPE_LAKE;
    waterbodyGroup[waterbodyId] = border
      ? size > oceanMinSize
        ? WATERBODY_GROUP_OCEAN
        : size > seaMinSize
          ? WATERBODY_GROUP_SEA
          : WATERBODY_GROUP_GULF
      : WATERBODY_GROUP_FRESHWATER;
    waterbodySize[waterbodyId] = size;
  }

  context.world.waterbodyCount = waterbodyCount;
  context.world.waterbodyType = Uint8Array.from(waterbodyType);
  context.world.waterbodyGroup = Uint8Array.from(waterbodyGroup);
  context.world.waterbodySize = Uint32Array.from(waterbodySize);
};

export const runOpenNearSeaLakesStage = (
  context: GenerationContext,
): boolean => {
  const { seaLevel } = context.config;
  const {
    cellCount,
    cellsH,
    cellsFeature,
    cellsCoast,
    cellsWaterbody,
    waterbodyType,
    cellNeighborOffsets,
    cellNeighbors,
  } = context.world;

  const breachLimit = 22;
  let openedAnyLake = false;
  const packRetentionCoast =
    context.internal.packRetentionCoast ?? context.world.cellsCoast.slice();
  context.internal.packRetentionCoast = packRetentionCoast;

  const removeLake = (
    thresholdCellId: number,
    lakeId: number,
    oceanId: number,
  ): void => {
    cellsH[thresholdCellId] = seaLevel - 1;
    cellsFeature[thresholdCellId] = 0;
    cellsCoast[thresholdCellId] = -1;
    packRetentionCoast[thresholdCellId] = -1;
    cellsWaterbody[thresholdCellId] = oceanId;

    forEachNeighbor(
      thresholdCellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if ((cellsH[neighborId] ?? 0) >= seaLevel) {
          cellsCoast[neighborId] = 1;
          packRetentionCoast[neighborId] = 1;
        }
      },
    );

    for (let lakeCellId = 0; lakeCellId < cellCount; lakeCellId += 1) {
      if ((cellsWaterbody[lakeCellId] ?? 0) !== lakeId) {
        continue;
      }

      cellsWaterbody[lakeCellId] = oceanId;
    }

    waterbodyType[lakeId] = 1;
  };

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 0) {
      continue;
    }

    const lakeId = cellsWaterbody[cellId] ?? 0;
    if (lakeId <= 0 || (waterbodyType[lakeId] ?? 0) !== 2) {
      continue;
    }

    let thresholdCellId = -1;
    let oceanNeighborId = -1;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if (thresholdCellId >= 0) {
          return;
        }

        if ((cellsFeature[neighborId] ?? 0) !== 1) {
          return;
        }

        if ((cellsH[neighborId] ?? 0) > breachLimit) {
          return;
        }

        if ((cellsCoast[neighborId] ?? 0) !== 1) {
          return;
        }

        let foundOcean = -1;
        forEachNeighbor(
          neighborId,
          cellNeighborOffsets,
          cellNeighbors,
          (secondNeighborId) => {
            if (foundOcean >= 0 || secondNeighborId === cellId) {
              return;
            }

            if ((cellsFeature[secondNeighborId] ?? 0) !== 0) {
              return;
            }

            const waterbodyId = cellsWaterbody[secondNeighborId] ?? 0;
            if (waterbodyId <= 0 || waterbodyId === lakeId) {
              return;
            }

            if ((waterbodyType[waterbodyId] ?? 0) === 1) {
              foundOcean = secondNeighborId;
            }
          },
        );

        if (foundOcean >= 0) {
          thresholdCellId = neighborId;
          oceanNeighborId = foundOcean;
        }
      },
    );

    if (thresholdCellId < 0 || oceanNeighborId < 0) {
      continue;
    }

    removeLake(thresholdCellId, lakeId, cellsWaterbody[oceanNeighborId] ?? 0);
    openedAnyLake = true;
  }

  return openedAnyLake;
};

export const runClimateStage = (context: GenerationContext): void => {
  const {
    height,
    seaLevel,
    climate: {
      elevationExponent,
      precipitation,
      mapSize,
      latitude,
      longitude,
      winds,
      temperatureEquator,
      temperatureNorthPole,
      temperatureSouthPole,
    },
  } = context.config;

  const { cellCount, cellsY, cellsH, cellsTemp, cellsPrec } = context.world;
  const { cellsX, cellsY: gridCellsY } = context.grid;
  const mapCoordinates = calculateMapCoordinates(
    context.config.width,
    context.config.height,
    mapSize,
    latitude,
    longitude,
  );
  const precipitationModifier = precipitation / 100;
  const randomInt = (min: number, max: number): number =>
    Math.floor(context.random() * (max - min + 1)) + min;
  const latitudeModifier = [
    4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5,
  ];
  const maxPassableElevation = 85;

  for (let index = 0; index < cellCount; index += 1) {
    const y = cellsY[index] ?? 0;
    const h = cellsH[index] ?? 0;

    const rowLatitude =
      mapCoordinates.latN - (y / height) * mapCoordinates.latT;
    const seaLevelTemperature = temperatureAtLatitude(
      rowLatitude,
      temperatureEquator,
      temperatureNorthPole,
      temperatureSouthPole,
    );

    const altitudePenalty =
      h < seaLevel ? 0 : ((h - 18) ** elevationExponent / 1000) * 6.5;

    const temperature = Math.round(seaLevelTemperature - altitudePenalty);
    cellsTemp[index] = clamp(temperature, -128, 127);

    cellsPrec[index] = 0;
  }

  const cellsNumberModifier = (context.config.requestedCells / 10000) ** 0.25;
  const modifier = cellsNumberModifier * precipitationModifier;
  const westerly: Array<[number, number, number]> = [];
  const easterly: Array<[number, number, number]> = [];
  let southerly = 0;
  let northerly = 0;

  const getWindDirections = (tier: number) => {
    const angle = winds[tier] ?? 0;
    return {
      isWest: angle > 40 && angle < 140,
      isEast: angle > 220 && angle < 320,
      isNorth: angle > 100 && angle < 260,
      isSouth: angle > 280 || angle < 80,
    };
  };

  for (
    let rowStart = 0, rowIndex = 0;
    rowStart < cellCount;
    rowStart += cellsX, rowIndex += 1
  ) {
    const lat =
      mapCoordinates.latN - (rowIndex / gridCellsY) * mapCoordinates.latT;
    const latBand = Math.max(
      0,
      Math.min(latitudeModifier.length - 1, ((Math.abs(lat) - 1) / 5) | 0),
    );
    const latMod = latitudeModifier[latBand] ?? 1;
    const windTier = Math.max(0, Math.min(5, (Math.abs(lat - 89) / 30) | 0));
    const { isWest, isEast, isNorth, isSouth } = getWindDirections(windTier);

    if (isWest) westerly.push([rowStart, latMod, windTier]);
    if (isEast) easterly.push([rowStart + cellsX - 1, latMod, windTier]);
    if (isNorth) northerly += 1;
    if (isSouth) southerly += 1;
  }

  const passWind = (
    source:
      | readonly number[]
      | ReadonlyArray<readonly [number, number, number]>,
    maxPrecInit: number,
    next: number,
    steps: number,
  ): void => {
    for (const firstValue of source) {
      let first = firstValue as number | readonly [number, number, number];
      let maxPrec = maxPrecInit;
      if (Array.isArray(first)) {
        maxPrec = Math.min(maxPrecInit * first[1], 255);
        first = first[0];
      }

      let humidity = maxPrec - (cellsH[first as number] ?? 0);
      if (humidity <= 0) {
        continue;
      }

      for (
        let step = 0, current = first as number;
        step < steps;
        step += 1, current += next
      ) {
        if (current < 0 || current >= cellCount) {
          break;
        }
        if ((cellsTemp[current] ?? 0) < -5) {
          continue;
        }

        const nextCell = current + next;
        if ((cellsH[current] ?? 0) < 20) {
          if (
            nextCell >= 0 &&
            nextCell < cellCount &&
            (cellsH[nextCell] ?? 0) >= 20
          ) {
            cellsPrec[nextCell] = clamp(
              (cellsPrec[nextCell] ?? 0) +
                Math.max(humidity / randomInt(10, 20), 1),
              0,
              255,
            );
          } else {
            humidity = Math.min(humidity + 5 * modifier, maxPrec);
            cellsPrec[current] = clamp(
              (cellsPrec[current] ?? 0) + 5 * modifier,
              0,
              255,
            );
          }
          continue;
        }

        if (nextCell < 0 || nextCell >= cellCount) {
          break;
        }

        const isPassable = (cellsH[nextCell] ?? 0) <= maxPassableElevation;
        const normalLoss = Math.max(humidity / (10 * modifier), 1);
        const diff = Math.max(
          (cellsH[nextCell] ?? 0) - (cellsH[current] ?? 0),
          0,
        );
        const mod = ((cellsH[nextCell] ?? 0) / 70) ** 2;
        const cellPrecipitation = isPassable
          ? clamp(normalLoss + diff * mod, 1, humidity)
          : humidity;
        cellsPrec[current] = clamp(
          (cellsPrec[current] ?? 0) + cellPrecipitation,
          0,
          255,
        );
        const evaporation = cellPrecipitation > 1.5 ? 1 : 0;
        humidity = isPassable
          ? clamp(humidity - cellPrecipitation + evaporation, 0, maxPrec)
          : 0;
      }
    }
  };

  if (westerly.length > 0) {
    passWind(westerly, 120 * modifier, 1, cellsX);
  }
  if (easterly.length > 0) {
    passWind(easterly, 120 * modifier, -1, cellsX);
  }

  const verticalTotal = southerly + northerly;
  if (northerly > 0 && verticalTotal > 0) {
    const bandN = Math.max(
      0,
      Math.min(
        latitudeModifier.length - 1,
        ((Math.abs(mapCoordinates.latN) - 1) / 5) | 0,
      ),
    );
    const latModN =
      mapCoordinates.latT > 60
        ? mean(latitudeModifier)
        : (latitudeModifier[bandN] ?? 1);
    const maxPrecN = (northerly / verticalTotal) * 60 * modifier * latModN;
    passWind(
      Array.from({ length: cellsX }, (_, index) => index),
      maxPrecN,
      cellsX,
      gridCellsY,
    );
  }

  if (southerly > 0 && verticalTotal > 0) {
    const bandS = Math.max(
      0,
      Math.min(
        latitudeModifier.length - 1,
        ((Math.abs(mapCoordinates.latS) - 1) / 5) | 0,
      ),
    );
    const latModS =
      mapCoordinates.latT > 60
        ? mean(latitudeModifier)
        : (latitudeModifier[bandS] ?? 1);
    const maxPrecS = (southerly / verticalTotal) * 60 * modifier * latModS;
    passWind(
      Array.from({ length: cellsX }, (_, index) => cellCount - cellsX + index),
      maxPrecS,
      -cellsX,
      gridCellsY,
    );
  }
};

export const runHydrologyStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsBorder,
    cellsH,
    cellsPrec,
    cellsFeature,
    cellsTemp,
    cellsWaterbody,
    waterbodyCount,
    waterbodyType,
    waterbodyGroup,
    waterbodySize,
    featureCount,
    featureGroup,
    featureFirstCell,
    cellNeighborOffsets,
    cellNeighbors,
    cellsFlow,
    cellsRiver,
  } = context.world;

  const MIN_FLUX_TO_FORM_RIVER = 30;
  const MAX_DEPRESSION_ITERATIONS = 100;
  const depressionLakeCheckIteration = Math.floor(
    MAX_DEPRESSION_ITERATIONS * 0.85,
  );
  const depressionLakeCloseIteration = Math.floor(
    MAX_DEPRESSION_ITERATIONS * 0.75,
  );

  const adjustedHeights = Float64Array.from(cellsH);
  const lakeSurfaceHeight = new Float64Array(waterbodyCount + 1);
  const lakeOutletCell = new Int32Array(waterbodyCount + 1);
  const lakeOutletWaterCell = new Int32Array(waterbodyCount + 1);
  const lakeClosed = new Uint8Array(waterbodyCount + 1);
  const lakeInflow = new Uint32Array(waterbodyCount + 1);
  const lakeEvaporation = new Uint32Array(waterbodyCount + 1);
  const lakeHasOutletRiver = new Uint8Array(waterbodyCount + 1);
  const lakeDominantRiver = new Uint32Array(waterbodyCount + 1);
  const lakeDominantFlux = new Uint32Array(waterbodyCount + 1);
  const riverAtCell = new Uint32Array(cellCount);
  const riverDominantFlux = new Uint32Array(cellCount);
  const riverConfluenceFlux = new Uint32Array(cellCount);
  const lakeOutletsByCell: number[][] = Array.from(
    { length: cellCount },
    () => [],
  );
  const shorelineByLake: number[][] = Array.from(
    { length: waterbodyCount + 1 },
    () => [],
  );

  lakeOutletCell.fill(-1);
  lakeOutletWaterCell.fill(-1);

  const getEffectiveHeight = (cellId: number, excludedLakeId = 0): number => {
    if ((cellsFeature[cellId] ?? 0) === 1) {
      return adjustedHeights[cellId] ?? 0;
    }

    const waterbodyId = cellsWaterbody[cellId] ?? 0;
    if (
      waterbodyId > 0 &&
      (waterbodyType[waterbodyId] ?? 0) === 2 &&
      waterbodyId !== excludedLakeId
    ) {
      return lakeSurfaceHeight[waterbodyId] ?? 19;
    }

    return cellsH[cellId] ?? 0;
  };

  const updateLakeOutlet = (lakeId: number, landCellId: number): void => {
    const shorelineHeight = adjustedHeights[landCellId] ?? 0;
    const currentOutlet = lakeOutletCell[lakeId] ?? -1;
    const currentHeight =
      currentOutlet >= 0
        ? (adjustedHeights[currentOutlet] ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;

    if (
      shorelineHeight > currentHeight ||
      (shorelineHeight === currentHeight &&
        currentOutlet >= 0 &&
        currentOutlet <= landCellId)
    ) {
      return;
    }

    let bestWaterCell = -1;
    forEachNeighbor(
      landCellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if (
          bestWaterCell >= 0 ||
          (cellsFeature[neighborId] ?? 0) !== 0 ||
          (cellsWaterbody[neighborId] ?? 0) !== lakeId
        ) {
          return;
        }

        bestWaterCell = neighborId;
      },
    );

    lakeOutletCell[lakeId] = landCellId;
    lakeOutletWaterCell[lakeId] = bestWaterCell;
  };

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    cellsFlow[cellId] = cellsPrec[cellId] ?? 0;
    cellsRiver[cellId] = 0;

    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if ((cellsFeature[neighborId] ?? 0) !== 0) {
          return;
        }

        const lakeId = cellsWaterbody[neighborId] ?? 0;
        if (lakeId <= 0 || (waterbodyType[lakeId] ?? 0) !== 2) {
          return;
        }

        shorelineByLake[lakeId]?.push(cellId);
        updateLakeOutlet(lakeId, cellId);
      },
    );
  }

  for (let lakeId = 1; lakeId <= waterbodyCount; lakeId += 1) {
    if ((waterbodyType[lakeId] ?? 0) !== 2) {
      continue;
    }

    const outletCellId = lakeOutletCell[lakeId] ?? -1;
    lakeSurfaceHeight[lakeId] =
      outletCellId >= 0 ? (adjustedHeights[outletCellId] ?? 19) - 1 : 19;
  }

  const landCells = Array.from({ length: cellCount }, (_, index) => index)
    .filter(
      (cellId) =>
        (cellsFeature[cellId] ?? 0) === 1 && (cellsBorder[cellId] ?? 0) !== 1,
    )
    .sort((a, b) => (adjustedHeights[a] ?? 0) - (adjustedHeights[b] ?? 0));

  let previousDepressions: number | null = null;
  const depressionProgress: number[] = [];

  for (
    let iteration = 0;
    iteration < MAX_DEPRESSION_ITERATIONS;
    iteration += 1
  ) {
    if (depressionProgress.length > 5) {
      let worsening = 0;
      for (const delta of depressionProgress) worsening += delta;
      if (worsening > 0) {
        break;
      }
    }

    let depressions = 0;

    if (iteration < depressionLakeCheckIteration) {
      for (let lakeId = 1; lakeId <= waterbodyCount; lakeId += 1) {
        if (
          (waterbodyType[lakeId] ?? 0) !== 2 ||
          (lakeClosed[lakeId] ?? 0) === 1
        ) {
          continue;
        }

        const shoreline = shorelineByLake[lakeId] ?? [];
        if (shoreline.length === 0) {
          continue;
        }

        let minHeight = Number.POSITIVE_INFINITY;
        let bestOutletCell = -1;
        for (const shorelineCellId of shoreline) {
          const shorelineHeight = adjustedHeights[shorelineCellId] ?? 0;
          if (
            shorelineHeight < minHeight ||
            (shorelineHeight === minHeight &&
              bestOutletCell >= 0 &&
              shorelineCellId < bestOutletCell)
          ) {
            minHeight = shorelineHeight;
            bestOutletCell = shorelineCellId;
          }
        }

        if (
          !Number.isFinite(minHeight) ||
          minHeight >= 100 ||
          (lakeSurfaceHeight[lakeId] ?? 19) > minHeight
        ) {
          continue;
        }

        if (iteration > depressionLakeCloseIteration) {
          lakeClosed[lakeId] = 1;
          lakeSurfaceHeight[lakeId] = minHeight - 1;
          if (bestOutletCell >= 0) {
            lakeOutletCell[lakeId] = bestOutletCell;
            updateLakeOutlet(lakeId, bestOutletCell);
          }
          continue;
        }

        lakeSurfaceHeight[lakeId] = minHeight + 0.2;
        if (bestOutletCell >= 0) {
          lakeOutletCell[lakeId] = bestOutletCell;
          updateLakeOutlet(lakeId, bestOutletCell);
        }
        depressions += 1;
      }
    }

    for (const cellId of landCells) {
      let minNeighborHeight = Number.POSITIVE_INFINITY;
      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          const neighborHeight = getEffectiveHeight(neighborId);
          if (neighborHeight < minNeighborHeight) {
            minNeighborHeight = neighborHeight;
          }
        },
      );

      if (
        !Number.isFinite(minNeighborHeight) ||
        minNeighborHeight >= 100 ||
        (adjustedHeights[cellId] ?? 0) > minNeighborHeight
      ) {
        continue;
      }

      adjustedHeights[cellId] = minNeighborHeight + 0.1;
      depressions += 1;
    }

    if (depressions === 0) {
      break;
    }

    if (previousDepressions !== null) {
      depressionProgress.push(depressions - previousDepressions);
      if (depressionProgress.length > 6) {
        depressionProgress.shift();
      }
    }
    previousDepressions = depressions;
  }

  for (let lakeId = 1; lakeId <= waterbodyCount; lakeId += 1) {
    if ((waterbodyType[lakeId] ?? 0) !== 2) {
      continue;
    }

    const outletCellId = lakeOutletCell[lakeId] ?? -1;
    if (outletCellId >= 0) {
      lakeOutletsByCell[outletCellId]?.push(lakeId);
    }

    const lakeCellCount = Math.max(waterbodySize[lakeId] ?? 0, 1);
    const firstCell = featureFirstCell[lakeId] ?? 0;
    const lakeTemp = cellsTemp[firstCell] ?? 0;
    const rimHeight =
      outletCellId >= 0
        ? Math.max(adjustedHeights[outletCellId] ?? 20, 20)
        : 20;
    const heightAboveSea = Math.max(rimHeight - 18, 0);
    const elevatedHeight =
      heightAboveSea ** context.config.climate.elevationExponent;
    const evaporationRate =
      ((700 * (lakeTemp + 0.006 * elevatedHeight)) / 50 + 75) /
      Math.max(80 - lakeTemp, 1);

    lakeEvaporation[lakeId] = Math.max(
      Math.round(Math.max(evaporationRate, 0) * lakeCellCount),
      0,
    );
  }

  const order = Array.from({ length: cellCount }, (_, index) => index)
    .filter((cellId) => (cellsFeature[cellId] ?? 0) === 1)
    .sort((a, b) => {
      const hA = adjustedHeights[a] ?? 0;
      const hB = adjustedHeights[b] ?? 0;
      if (hB !== hA) {
        return hB - hA;
      }
      return a - b;
    });

  const selectDownhill = (
    cellId: number,
    excludedLakeIds: readonly number[] = [],
  ): number => {
    const currentHeight = adjustedHeights[cellId] ?? 0;
    let target = -1;
    let targetHeight = currentHeight;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        const waterbodyId = cellsWaterbody[neighborId] ?? 0;
        if (
          excludedLakeIds.length > 0 &&
          (cellsFeature[neighborId] ?? 0) === 0 &&
          excludedLakeIds.includes(waterbodyId)
        ) {
          return;
        }

        const neighborHeight = getEffectiveHeight(neighborId, 0);
        if (
          neighborHeight < targetHeight ||
          (neighborHeight === targetHeight &&
            target >= 0 &&
            neighborId < target)
        ) {
          target = neighborId;
          targetHeight = neighborHeight;
        }
      },
    );

    return target;
  };

  let nextRiverId = 1;

  const receiveRiverFlux = (
    cellId: number,
    flux: number,
    riverId: number,
  ): void => {
    if (flux <= 0) {
      return;
    }

    const currentRiver = riverAtCell[cellId] ?? 0;
    const currentDominantFlux = riverDominantFlux[cellId] ?? 0;

    if (currentRiver === 0) {
      riverAtCell[cellId] = riverId;
      riverDominantFlux[cellId] = flux;
    } else if (riverId !== currentRiver) {
      if (flux > currentDominantFlux) {
        riverConfluenceFlux[cellId] =
          (riverConfluenceFlux[cellId] ?? 0) + currentDominantFlux;
        riverAtCell[cellId] = riverId;
        riverDominantFlux[cellId] = flux;
      } else {
        riverConfluenceFlux[cellId] = (riverConfluenceFlux[cellId] ?? 0) + flux;
      }
    } else if (flux > currentDominantFlux) {
      riverDominantFlux[cellId] = flux;
    }

    cellsFlow[cellId] = (cellsFlow[cellId] ?? 0) + flux;
  };

  const receiveLakeFlux = (
    cellId: number,
    flux: number,
    riverId: number,
  ): void => {
    if (flux <= 0) {
      return;
    }

    const lakeId = cellsWaterbody[cellId] ?? 0;
    if (lakeId <= 0 || (waterbodyType[lakeId] ?? 0) !== 2) {
      return;
    }

    lakeInflow[lakeId] = (lakeInflow[lakeId] ?? 0) + flux;
    if (flux > (lakeDominantFlux[lakeId] ?? 0)) {
      lakeDominantFlux[lakeId] = flux;
      lakeDominantRiver[lakeId] = riverId;
    }
  };

  for (const cellId of order) {
    const outletLakes = lakeOutletsByCell[cellId] ?? [];
    for (const lakeId of outletLakes) {
      const remainingFlux = Math.max(
        (lakeInflow[lakeId] ?? 0) - (lakeEvaporation[lakeId] ?? 0),
        0,
      );
      if (remainingFlux <= 0) {
        continue;
      }

      let outletRiverId = lakeDominantRiver[lakeId] ?? 0;
      if (outletRiverId === 0) {
        outletRiverId = nextRiverId;
        nextRiverId += 1;
      }

      lakeHasOutletRiver[lakeId] = 1;
      receiveRiverFlux(cellId, remainingFlux, outletRiverId);
    }

    if ((cellsBorder[cellId] ?? 0) === 1 && (riverAtCell[cellId] ?? 0) > 0) {
      continue;
    }

    const flow = cellsFlow[cellId] ?? 0;
    const target = selectDownhill(cellId, outletLakes);
    if (
      target < 0 ||
      (adjustedHeights[cellId] ?? 0) <= getEffectiveHeight(target)
    ) {
      continue;
    }

    if (flow < MIN_FLUX_TO_FORM_RIVER) {
      if ((cellsFeature[target] ?? 0) === 1) {
        cellsFlow[target] = (cellsFlow[target] ?? 0) + flow;
      }
      continue;
    }

    if ((riverAtCell[cellId] ?? 0) === 0) {
      riverAtCell[cellId] = nextRiverId;
      riverDominantFlux[cellId] = flow;
      nextRiverId += 1;
    } else if (flow > (riverDominantFlux[cellId] ?? 0)) {
      riverDominantFlux[cellId] = flow;
    }

    const riverId = riverAtCell[cellId] ?? 0;
    if ((cellsFeature[target] ?? 0) === 0) {
      receiveLakeFlux(target, flow, riverId);
      continue;
    }

    receiveRiverFlux(target, flow, riverId);
  }

  const riverCellCounts = new Uint32Array(nextRiverId + 1);
  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const riverId = riverAtCell[cellId] ?? 0;
    if (riverId > 0 && (cellsFlow[cellId] ?? 0) >= MIN_FLUX_TO_FORM_RIVER) {
      riverCellCounts[riverId] = (riverCellCounts[riverId] ?? 0) + 1;
    }
  }

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      cellsRiver[cellId] = 0;
      continue;
    }

    const riverId = riverAtCell[cellId] ?? 0;
    cellsRiver[cellId] =
      riverId > 0 && (riverCellCounts[riverId] ?? 0) >= 3 ? riverId : 0;
  }

  for (let lakeId = 1; lakeId <= waterbodyCount; lakeId += 1) {
    if ((waterbodyType[lakeId] ?? 0) !== WATERBODY_TYPE_LAKE) {
      continue;
    }

    const lakeCellCount = waterbodySize[lakeId] ?? 0;
    const firstCell = featureFirstCell[lakeId] ?? 0;
    const lakeTemp = cellsTemp[firstCell] ?? 0;
    const lakeFlux = lakeInflow[lakeId] ?? 0;
    const evaporation = lakeEvaporation[lakeId] ?? 0;
    const hasOutletRiver = (lakeHasOutletRiver[lakeId] ?? 0) === 1;
    const lakeHeight = lakeSurfaceHeight[lakeId] ?? 19;

    waterbodyGroup[lakeId] =
      lakeTemp < -3
        ? WATERBODY_GROUP_FROZEN
        : lakeHeight > 60 && lakeCellCount < 10 && firstCell % 10 === 0
          ? WATERBODY_GROUP_LAVA
          : !hasOutletRiver && lakeFlux === 0 && evaporation > lakeFlux * 4
            ? WATERBODY_GROUP_DRY
            : !hasOutletRiver &&
                lakeFlux === 0 &&
                lakeCellCount < 3 &&
                firstCell % 10 === 0
              ? WATERBODY_GROUP_SINKHOLE
              : !hasOutletRiver && evaporation > lakeFlux
                ? WATERBODY_GROUP_SALT
                : WATERBODY_GROUP_FRESHWATER;

    if (lakeId <= featureCount) {
      featureGroup[lakeId] = waterbodyGroup[lakeId] ?? WATERBODY_GROUP_NONE;
    }
  }
};

export const runBiomeStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsTemp,
    cellsPrec,
    cellsRiver,
    cellsBiome,
  } = context.world;

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const isLand = (cellsFeature[cellId] ?? 0) === 1;
    if (!isLand) {
      cellsBiome[cellId] = 0;
      continue;
    }

    const temp = cellsTemp[cellId] ?? 0;
    const prec = cellsPrec[cellId] ?? 0;
    const river = cellsRiver[cellId] ?? 0;
    const wetness = Math.min(255, prec + (river > 0 ? 30 : 0));

    if (temp < -15) {
      cellsBiome[cellId] = wetness > 100 ? 2 : 1;
      continue;
    }

    if (temp < -2) {
      cellsBiome[cellId] = wetness > 120 ? 3 : 2;
      continue;
    }

    if (temp < 12) {
      if (wetness < 80) {
        cellsBiome[cellId] = 4;
      } else {
        cellsBiome[cellId] = 5;
      }
      continue;
    }

    if (wetness < 70) {
      cellsBiome[cellId] = 7;
    } else if (wetness < 130) {
      cellsBiome[cellId] = 8;
    } else {
      cellsBiome[cellId] = 6;
    }
  }
};

export const runCulturesStage = (context: GenerationContext): void => {
  const { culturesCount: requestedCultures } = context.config;

  const {
    cellsCulture,
    cellsBiome,
    cellsFeature,
    cellsFlow,
    cellsLandmass,
    cellsTemp,
    cellsWaterbody,
    landmassKind,
    packCellCount,
    packArea,
    packCoast,
    packH,
    packHarbor,
    packHaven,
    packNeighborOffsets,
    packNeighbors,
    packToGrid,
    packX,
    packY,
    waterbodySize,
    waterbodyType,
  } = context.world;

  cellsCulture.fill(0);

  if (packCellCount <= 0) {
    context.world.cultureCount = 0;
    context.world.cultureSeedCell = new Uint32Array(1);
    context.world.cultureSize = new Uint32Array(1);
    return;
  }

  const eligiblePackIds = Array.from(
    { length: packCellCount },
    (_, packId) => packId,
  ).filter((packId) => {
    const gridCellId = packToGrid[packId] ?? 0;
    return (
      (cellsFeature[gridCellId] ?? 0) === 1 &&
      Math.abs((packX[packId] ?? 0) - (context.world.cellsX[gridCellId] ?? 0)) <
        1e-6 &&
      Math.abs((packY[packId] ?? 0) - (context.world.cellsY[gridCellId] ?? 0)) <
        1e-6
    );
  });

  if (eligiblePackIds.length <= 0) {
    context.world.cultureCount = 0;
    context.world.cultureSeedCell = new Uint32Array(1);
    context.world.cultureSize = new Uint32Array(1);
    return;
  }

  type CultureTemplate = Readonly<{
    odd: number;
    sort: (packId: number) => number;
  }>;

  type CultureQueueEntry = Readonly<{
    cost: number;
    cultureId: number;
    packId: number;
  }>;

  const suitability = computeSuitability(context);
  const populatedPackIds = eligiblePackIds.filter(
    (packId) => (suitability[packId] ?? 0) > 0,
  );
  const targetCultures = Math.min(
    requestedCultures,
    Math.max(populatedPackIds.length, 1),
  );
  const candidatePackIds =
    populatedPackIds.length > 0 ? populatedPackIds : eligiblePackIds;

  let maxSuitability = 0;
  for (const packId of candidatePackIds) {
    const score = suitability[packId] ?? 0;
    if (score > maxSuitability) {
      maxSuitability = score;
    }
  }
  maxSuitability = Math.max(maxSuitability, 1);

  const biomeCosts = [0, 20, 80, 70, 60, 40, 30, 20, 30];
  const getNormalizedScore = (packId: number): number =>
    Math.ceil(((suitability[packId] ?? 0) / maxSuitability) * 3);
  const getTemperatureDistance = (packId: number, goal: number): number => {
    const gridCellId = packToGrid[packId] ?? 0;
    return Math.abs((cellsTemp[gridCellId] ?? 0) - goal) + 1;
  };
  const getBiomePenalty = (
    packId: number,
    biomes: readonly number[],
    fee = 4,
  ): number => {
    const gridCellId = packToGrid[packId] ?? 0;
    return biomes.includes(cellsBiome[gridCellId] ?? 0) ? 1 : fee;
  };
  const getSeaCoastPenalty = (packId: number, fee = 4): number => {
    const havenCell = packHaven[packId] ?? -1;
    if (havenCell < 0) {
      return fee;
    }
    const waterbodyId = cellsWaterbody[havenCell] ?? 0;
    return (waterbodyType[waterbodyId] ?? 0) === 1 ? 1 : fee;
  };
  const getCoastDistance = (packId: number): number =>
    Math.max(packCoast[packId] ?? 0, 1);
  const getAltitude = (packId: number): number => packH[packId] ?? 0;

  const cultureTemplates: CultureTemplate[] = [
    {
      odd: 0.7,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 10) /
        getBiomePenalty(packId, [6, 8]),
    },
    {
      odd: 1,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 10) /
        getSeaCoastPenalty(packId),
    },
    {
      odd: 0.6,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 12) /
        getBiomePenalty(packId, [6, 8]),
    },
    {
      odd: 0.6,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 15),
    },
    {
      odd: 0.6,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 16),
    },
    {
      odd: 0.7,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 6)) *
        getCoastDistance(packId),
    },
    {
      odd: 0.7,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 5),
    },
    {
      odd: 0.7,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 18)) *
        getAltitude(packId),
    },
    {
      odd: 0.7,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 15),
    },
    {
      odd: 0.3,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 5) /
          getBiomePenalty(packId, [9])) *
        getCoastDistance(packId),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 12) /
        getCoastDistance(packId),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 13),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 15) /
        getCoastDistance(packId),
    },
    {
      odd: 0.4,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 17) /
        getSeaCoastPenalty(packId),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getAltitude(packId) /
        getTemperatureDistance(packId, 18) /
        getBiomePenalty(packId, [7]),
    },
    {
      odd: 0.2,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 11) /
          getBiomePenalty(packId, [4])) *
        getCoastDistance(packId),
    },
    {
      odd: 0.2,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 13),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 19) /
          getBiomePenalty(packId, [1, 2, 3], 7)) *
        getCoastDistance(packId),
    },
    {
      odd: 0.2,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 26) /
          getBiomePenalty(packId, [1, 2], 7)) *
        getCoastDistance(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        getTemperatureDistance(packId, -1) /
        getBiomePenalty(packId, [10, 11]) /
        getSeaCoastPenalty(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 15)) *
        getAltitude(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 15) /
        getBiomePenalty(packId, [5, 7]),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 11) /
          getBiomePenalty(packId, [6, 8])) *
        getCoastDistance(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 22)) *
        getCoastDistance(packId),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 18)) *
        getAltitude(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 24) /
        getSeaCoastPenalty(packId) /
        getCoastDistance(packId),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 26),
    },
    {
      odd: 0.05,
      sort: (packId) =>
        getAltitude(packId) / getTemperatureDistance(packId, 13),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 29) /
        getBiomePenalty(packId, [1, 3, 5, 7]),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) /
        getTemperatureDistance(packId, 25) /
        getBiomePenalty(packId, [7], 7) /
        getCoastDistance(packId),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        getNormalizedScore(packId) / getTemperatureDistance(packId, 17),
    },
    {
      odd: 0.1,
      sort: (packId) =>
        (getNormalizedScore(packId) /
          getTemperatureDistance(packId, 5) /
          getBiomePenalty(packId, [2, 4, 10], 7)) *
        getCoastDistance(packId),
    },
    {
      odd: 0.2,
      sort: (packId) =>
        (getNormalizedScore(packId) / getTemperatureDistance(packId, 18)) *
        getSeaCoastPenalty(packId),
    },
  ];

  const selectTemplates = (count: number): CultureTemplate[] => {
    const pool = cultureTemplates.slice();
    const selected: CultureTemplate[] = [];

    while (selected.length < count && pool.length > 0) {
      let attempts = 0;
      let templateIndex = 0;
      do {
        templateIndex = Math.floor(context.random() * pool.length);
        attempts += 1;
      } while (
        attempts < 200 &&
        context.random() >= (pool[templateIndex]?.odd ?? 1)
      );

      selected.push(pool[templateIndex] as CultureTemplate);
      pool.splice(templateIndex, 1);
    }

    return selected;
  };

  const templates = selectTemplates(targetCultures);
  const isSeed = new Uint8Array(packCellCount);
  const seedPackIds: number[] = [];
  const hasCenterNear = (
    selectedPackIds: readonly number[],
    packId: number,
    spacing: number,
  ): boolean => {
    const x = packX[packId] ?? 0;
    const y = packY[packId] ?? 0;
    const spacingSq = spacing * spacing;

    for (const selectedPackId of selectedPackIds) {
      const dx = (packX[selectedPackId] ?? 0) - x;
      const dy = (packY[selectedPackId] ?? 0) - y;
      if (dx * dx + dy * dy <= spacingSq) {
        return true;
      }
    }

    return false;
  };
  const getBiasedIndex = (maxInclusive: number): number =>
    Math.floor(context.random() ** 5 * (maxInclusive + 1));
  const placeCenter = (sortingFn: (packId: number) => number): number => {
    const sorted = candidatePackIds
      .slice()
      .sort(
        (left, right) => sortingFn(right) - sortingFn(left) || left - right,
      );
    const maxIndex = Math.max(Math.floor(sorted.length / 2), 0);
    let spacing =
      (context.config.width + context.config.height) / 2 / targetCultures;
    let selectedPackId = sorted[0] ?? candidatePackIds[0] ?? 0;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = sorted[getBiasedIndex(maxIndex)] ?? selectedPackId;
      selectedPackId = candidate;
      spacing *= 0.9;
      if ((isSeed[candidate] ?? 0) === 1) {
        continue;
      }
      if (!hasCenterNear(seedPackIds, candidate, spacing)) {
        break;
      }
    }

    return selectedPackId;
  };

  const getCultureType = (packId: number): PoliticalType => {
    const cellId = packToGrid[packId] ?? 0;
    const biome = cellsBiome[cellId] ?? 0;
    const height = packH[packId] ?? 0;
    const harbor = packHarbor[packId] ?? 0;
    const havenCell = packHaven[packId] ?? -1;
    const waterbodyId = havenCell >= 0 ? (cellsWaterbody[havenCell] ?? 0) : 0;
    const waterType = waterbodyType[waterbodyId] ?? 0;
    const waterSize = waterbodySize[waterbodyId] ?? 0;
    const landmassId = cellsLandmass[cellId] ?? 0;
    const isIsle = landmassId > 0 && (landmassKind[landmassId] ?? 0) === 3;

    if (height < 70 && [1, 2, 4].includes(biome)) {
      return "Nomadic";
    }
    if (height > 50) {
      return "Highland";
    }
    if (waterType === 2 && waterSize > 5) {
      return "Lake";
    }
    if (
      (harbor > 0 && waterType === 1 && context.random() < 0.1) ||
      (harbor === 1 && context.random() < 0.6) ||
      (isIsle && context.random() < 0.4)
    ) {
      return "Naval";
    }
    if ((cellsFlow[cellId] ?? 0) > 100) {
      return "River";
    }
    if ((packCoast[packId] ?? 0) > 2 && [3, 5, 6, 7, 8].includes(biome)) {
      return "Hunting";
    }
    return "Generic";
  };
  const getExpansionism = (type: PoliticalType): number => {
    let base = 1;
    if (type === "Lake") base = 0.8;
    else if (type === "Naval") base = 1.5;
    else if (type === "River") base = 0.9;
    else if (type === "Nomadic") base = 1.5;
    else if (type === "Hunting") base = 0.7;
    else if (type === "Highland") base = 1.2;
    return rn(
      ((context.random() * context.config.hiddenControls.sizeVariety) / 2 + 1) *
        base,
      1,
    );
  };

  for (const template of templates) {
    const centerPackId = placeCenter(template.sort);
    seedPackIds.push(centerPackId);
    isSeed[centerPackId] = 1;
  }

  const cultureCount = seedPackIds.length;
  const cultureSeedCell = new Uint32Array(cultureCount + 1);
  const cultureSize = new Uint32Array(cultureCount + 1);
  const packCulture = new Uint16Array(packCellCount);
  const cost = new Float64Array(packCellCount);
  const cultureTypes: PoliticalType[] = ["Generic"];
  const cultureNativeBiome = new Uint8Array(cultureCount + 1);
  const cultureExpansionism = new Float64Array(cultureCount + 1);
  const queue: CultureQueueEntry[] = [];

  const compareEntries = (
    left: CultureQueueEntry,
    right: CultureQueueEntry,
  ): number => {
    if (left.cost !== right.cost) {
      return left.cost - right.cost;
    }
    if (left.cultureId !== right.cultureId) {
      return left.cultureId - right.cultureId;
    }
    return left.packId - right.packId;
  };
  const pushQueue = (entry: CultureQueueEntry): void => {
    queue.push(entry);
    let index = queue.length - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = queue[parentIndex];
      if (!parent || compareEntries(parent, entry) <= 0) {
        break;
      }
      queue[index] = parent;
      index = parentIndex;
    }

    queue[index] = entry;
  };
  const popQueue = (): CultureQueueEntry | undefined => {
    const first = queue[0];
    const last = queue.pop();

    if (!first) {
      return undefined;
    }
    if (!last || queue.length === 0) {
      return first;
    }

    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;
      const current =
        smallestIndex === index ? last : (queue[smallestIndex] ?? last);
      const left = queue[leftIndex];
      if (left && compareEntries(left, current) < 0) {
        smallestIndex = leftIndex;
      }
      const smallest =
        smallestIndex === index ? last : (queue[smallestIndex] ?? last);
      const right = queue[rightIndex];
      if (right && compareEntries(right, smallest) < 0) {
        smallestIndex = rightIndex;
      }
      if (smallestIndex === index) {
        break;
      }
      queue[index] = queue[smallestIndex] as CultureQueueEntry;
      index = smallestIndex;
    }

    queue[index] = last;
    return first;
  };
  const getBiomeCost = (
    nativeBiome: number,
    biome: number,
    type: PoliticalType,
  ): number => {
    if (nativeBiome === biome) {
      return 10;
    }
    const baseCost = biomeCosts[biome] ?? 50;
    if (type === "Hunting") {
      return baseCost * 5;
    }
    if (type === "Nomadic" && biome > 4 && biome < 10) {
      return baseCost * 10;
    }
    return baseCost * 2;
  };
  const getHeightCost = (packId: number, type: PoliticalType): number => {
    const cellId = packToGrid[packId] ?? 0;
    const height = packH[packId] ?? 0;
    const waterbodyId = cellsWaterbody[cellId] ?? 0;
    const waterType = waterbodyType[waterbodyId] ?? 0;
    const area = packArea[packId] ?? 0;

    if (type === "Lake" && waterType === 2) return 10;
    if (type === "Naval" && height < 20) return area * 2;
    if (type === "Nomadic" && height < 20) return area * 50;
    if (height < 20) return area * 6;
    if (type === "Highland" && height < 44) return 3000;
    if (type === "Highland" && height < 62) return 200;
    if (type === "Highland") return 0;
    if (height >= 67) return 200;
    if (height >= 44) return 30;
    return 0;
  };
  const getRiverCost = (packId: number, type: PoliticalType): number => {
    const cellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    if (type === "River") {
      return flow > 0 ? 0 : 100;
    }
    if (flow <= 0) {
      return 0;
    }
    return clamp(flow / 10, 20, 100);
  };
  const getTypeCost = (packId: number, type: PoliticalType): number => {
    const coast = packCoast[packId] ?? 0;
    if (coast === 1) {
      return type === "Naval" || type === "Lake"
        ? 0
        : type === "Nomadic"
          ? 60
          : 20;
    }
    if (coast === 2) {
      return type === "Naval" || type === "Nomadic" ? 30 : 0;
    }
    if (coast > 2) {
      return type === "Naval" || type === "Lake" ? 100 : 0;
    }
    return 0;
  };

  cost.fill(Number.POSITIVE_INFINITY);

  for (let cultureIndex = 0; cultureIndex < cultureCount; cultureIndex += 1) {
    const packId = seedPackIds[cultureIndex] ?? 0;
    const cultureId = cultureIndex + 1;
    const centerCell = packToGrid[packId] ?? 0;
    const type = getCultureType(packId);
    cultureSeedCell[cultureId] = centerCell;
    cultureTypes[cultureId] = type;
    cultureNativeBiome[cultureId] = cellsBiome[centerCell] ?? 0;
    cultureExpansionism[cultureId] = getExpansionism(type);
    packCulture[packId] = cultureId;
    cost[packId] = 0;
    pushQueue({ cost: 0, cultureId, packId });
  }

  context.internal.cultureTypes = cultureTypes;

  const maxExpansionCost =
    Math.max(candidatePackIds.length, 1) *
    0.6 *
    context.config.hiddenControls.growthRate;

  while (queue.length > 0) {
    const next = popQueue();
    if (!next) {
      break;
    }
    if (next.cost > (cost[next.packId] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }

    const type = cultureTypes[next.cultureId] ?? "Generic";
    const nativeBiome = cultureNativeBiome[next.cultureId] ?? 0;
    const expansionism = cultureExpansionism[next.cultureId] ?? 1;

    forEachNeighbor(
      next.packId,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if (!isPoliticalPackCell(context, neighborPackId)) {
          return;
        }

        const neighborCell = packToGrid[neighborPackId] ?? 0;
        const totalCost =
          next.cost +
          (getBiomeCost(nativeBiome, cellsBiome[neighborCell] ?? 0, type) +
            getHeightCost(neighborPackId, type) +
            getRiverCost(neighborPackId, type) +
            getTypeCost(neighborPackId, type)) /
            Math.max(expansionism, 0.1);

        if (totalCost > maxExpansionCost) {
          return;
        }
        if (totalCost >= (cost[neighborPackId] ?? Number.POSITIVE_INFINITY)) {
          return;
        }

        cost[neighborPackId] = totalCost;
        packCulture[neighborPackId] = next.cultureId;
        pushQueue({
          cost: totalCost,
          cultureId: next.cultureId,
          packId: neighborPackId,
        });
      },
    );
  }

  for (const packId of eligiblePackIds) {
    if ((packCulture[packId] ?? 0) > 0) {
      continue;
    }

    const x = packX[packId] ?? 0;
    const y = packY[packId] ?? 0;
    let bestCultureId = 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let cultureId = 1; cultureId <= cultureCount; cultureId += 1) {
      const seedPackId = seedPackIds[cultureId - 1] ?? 0;
      const dx = x - (packX[seedPackId] ?? 0);
      const dy = y - (packY[seedPackId] ?? 0);
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistance) {
        bestDistance = distanceSq;
        bestCultureId = cultureId;
      }
    }

    const gridCellId = packToGrid[packId] ?? 0;
    packCulture[packId] = bestCultureId;
    cellsCulture[gridCellId] = bestCultureId;
    cultureSize[bestCultureId] = (cultureSize[bestCultureId] ?? 0) + 1;
  }

  for (const packId of eligiblePackIds) {
    const cultureId = packCulture[packId] ?? 0;
    const gridCellId = packToGrid[packId] ?? 0;
    if (cultureId <= 0 || (cellsCulture[gridCellId] ?? 0) === cultureId) {
      continue;
    }

    cellsCulture[gridCellId] = cultureId;
    cultureSize[cultureId] = (cultureSize[cultureId] ?? 0) + 1;
  }

  context.world.cultureCount = cultureCount;
  context.world.cultureSeedCell = cultureSeedCell;
  context.world.cultureSize = cultureSize;
};

export const runBurgGenerationStage = (context: GenerationContext): void =>
  runPoliticalBurgGenerationStage(context);

export const runBurgSpecificationStage = (context: GenerationContext): void =>
  runPoliticalBurgSpecificationStage(context);

export const runStatesStage = (context: GenerationContext): void =>
  runPoliticalStatesStage(context);

export const runStateFormsStage = (context: GenerationContext): void =>
  runPoliticalStateFormsStage(context);

const ROUTE_KIND_ROAD = 1;
const ROUTE_KIND_TRAIL = 2;
const ROUTE_KIND_SEA = 3;

const LAND_ROUTE_HABITABILITY = [0, 4, 10, 22, 30, 100, 80, 10, 22] as const;

type RouteNode = readonly [number, number];

type RoutedBurg = Readonly<{
  burgId: number;
  cellId: number;
  x: number;
  y: number;
  stateId: number;
  portCellId: number;
}>;

type GeneratedRoute = Readonly<{
  fromState: number;
  toState: number;
  kind: number;
  weight: number;
  cells: readonly number[];
}>;

type PathEntry = Readonly<{
  cellId: number;
  cost: number;
}>;

const comparePathEntries = (left: PathEntry, right: PathEntry): number => {
  if (left.cost !== right.cost) {
    return left.cost - right.cost;
  }

  return left.cellId - right.cellId;
};

const pushPathEntry = (heap: PathEntry[], entry: PathEntry): void => {
  heap.push(entry);
  let index = heap.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];
    if (!parent || comparePathEntries(parent, entry) <= 0) {
      break;
    }

    heap[index] = parent;
    index = parentIndex;
  }

  heap[index] = entry;
};

const popPathEntry = (heap: PathEntry[]): PathEntry | undefined => {
  const first = heap[0];
  const last = heap.pop();

  if (!first) {
    return undefined;
  }

  if (!last || heap.length === 0) {
    return first;
  }

  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = index;

    const left = heap[leftIndex];
    const right = heap[rightIndex];
    const current =
      smallestIndex === index ? last : (heap[smallestIndex] ?? last);

    if (left && comparePathEntries(left, current) < 0) {
      smallestIndex = leftIndex;
    }

    const smallest =
      smallestIndex === index ? last : (heap[smallestIndex] ?? last);
    if (right && comparePathEntries(right, smallest) < 0) {
      smallestIndex = rightIndex;
    }

    if (smallestIndex === index) {
      break;
    }

    heap[index] = heap[smallestIndex] as PathEntry;
    index = smallestIndex;
  }

  heap[index] = last;
  return first;
};

const routeEdgeKey = (from: number, to: number): string => `${from}:${to}`;

const addRouteConnections = (
  cells: readonly number[],
  kind: number,
  connections: Map<string, number>,
): void => {
  for (let index = 0; index < cells.length - 1; index += 1) {
    const cellId = cells[index] ?? -1;
    const nextCellId = cells[index + 1] ?? -1;
    if (cellId < 0 || nextCellId < 0 || cellId === nextCellId) {
      continue;
    }

    connections.set(routeEdgeKey(cellId, nextCellId), kind);
    connections.set(routeEdgeKey(nextCellId, cellId), kind);
  }
};

const getRouteSegments = (
  pathCells: readonly number[],
  connections: ReadonlyMap<string, number>,
): number[][] => {
  const segments: number[][] = [];
  let segment: number[] = [];

  for (let index = 0; index < pathCells.length; index += 1) {
    const cellId = pathCells[index] ?? -1;
    const nextCellId = pathCells[index + 1] ?? -1;
    const isConnected =
      nextCellId >= 0 &&
      (connections.has(routeEdgeKey(cellId, nextCellId)) ||
        connections.has(routeEdgeKey(nextCellId, cellId)));

    if (isConnected) {
      if (segment.length > 0) {
        segment.push(cellId);
        if (segment.length > 1) {
          segments.push(segment);
        }
        segment = [];
      }
      continue;
    }

    segment.push(cellId);
  }

  if (segment.length > 1) {
    segments.push(segment);
  }

  return segments;
};

const mergeRouteSegments = (segments: readonly number[][]): number[][] => {
  const merged = segments.map((segment) => segment.slice());
  let mergedCount = 0;

  for (let leftIndex = 0; leftIndex < merged.length; leftIndex += 1) {
    const left = merged[leftIndex];
    if (!left || left.length === 0) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < merged.length;
      rightIndex += 1
    ) {
      const right = merged[rightIndex];
      if (!right || right.length === 0) {
        continue;
      }

      const leftEnd = left[left.length - 1];
      const rightStart = right[0];
      if (leftEnd !== rightStart) {
        continue;
      }

      merged[leftIndex] = left.concat(right.slice(1));
      merged[rightIndex] = [];
      mergedCount += 1;
    }
  }

  const filtered = merged.filter((segment) => segment.length > 1);
  return mergedCount > 1 ? mergeRouteSegments(filtered) : filtered;
};

const calculateUrquhartEdges = (points: readonly RouteNode[]): number[][] => {
  if (points.length < 2) {
    return [];
  }

  if (points.length === 2) {
    return [[0, 1]];
  }

  const delaunay = Delaunay.from(points.map(([x, y]) => [x, y]));
  const { halfedges, triangles } = delaunay;
  const removed = new Uint8Array(triangles.length);
  const score = (pointA: number, pointB: number): number => {
    const a = points[pointA] ?? [0, 0];
    const b = points[pointB] ?? [0, 0];
    const dx = (a[0] ?? 0) - (b[0] ?? 0);
    const dy = (a[1] ?? 0) - (b[1] ?? 0);
    return dx * dx + dy * dy;
  };

  for (let edge = 0; edge < triangles.length; edge += 3) {
    const pointA = triangles[edge] ?? 0;
    const pointB = triangles[edge + 1] ?? 0;
    const pointC = triangles[edge + 2] ?? 0;
    const scoreAB = score(pointA, pointB);
    const scoreBC = score(pointB, pointC);
    const scoreCA = score(pointC, pointA);

    const removedEdge =
      scoreCA > scoreAB && scoreCA > scoreBC
        ? Math.max(edge + 2, halfedges[edge + 2] ?? -1)
        : scoreBC > scoreAB && scoreBC > scoreCA
          ? Math.max(edge + 1, halfedges[edge + 1] ?? -1)
          : Math.max(edge, halfedges[edge] ?? -1);
    if (removedEdge >= 0) {
      removed[removedEdge] = 1;
    }
  }

  const edges: number[][] = [];
  for (let edge = 0; edge < triangles.length; edge += 1) {
    const opposite = halfedges[edge] ?? -1;
    if (edge <= opposite || removed[edge] === 1) {
      continue;
    }

    const from = triangles[edge] ?? -1;
    const to = triangles[edge % 3 === 2 ? edge - 2 : edge + 1] ?? -1;
    if (from >= 0 && to >= 0 && from !== to) {
      edges.push([from, to]);
    }
  }

  return edges;
};

const getSeaRouteTypeModifier = (coast: number): number => {
  if (coast === -1) {
    return 1;
  }
  if (coast === -2) {
    return 1.8;
  }
  if (coast === -3) {
    return 4;
  }
  if (coast === -4) {
    return 6;
  }
  return 8;
};

const buildCellRouteLinks = (
  cellCount: number,
  connections: ReadonlyMap<string, number>,
): Readonly<{
  offsets: Uint32Array;
  neighbors: Uint32Array;
  kinds: Uint8Array;
}> => {
  const byCell: number[][] = Array.from({ length: cellCount }, () => []);
  const byCellKinds: number[][] = Array.from({ length: cellCount }, () => []);

  for (const [key, kind] of connections.entries()) {
    const [fromText, toText] = key.split(":");
    const from = Number.parseInt(fromText ?? "-1", 10);
    const to = Number.parseInt(toText ?? "-1", 10);
    if (from < 0 || to < 0 || from >= cellCount || to >= cellCount) {
      continue;
    }

    byCell[from]?.push(to);
    byCellKinds[from]?.push(kind);
  }

  const offsets = new Uint32Array(cellCount + 1);
  const neighbors: number[] = [];
  const kinds: number[] = [];

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    offsets[cellId] = neighbors.length;
    const cellNeighbors = byCell[cellId] ?? [];
    const cellKinds = byCellKinds[cellId] ?? [];
    for (let index = 0; index < cellNeighbors.length; index += 1) {
      neighbors.push(cellNeighbors[index] ?? 0);
      kinds.push(cellKinds[index] ?? 0);
    }
  }

  offsets[cellCount] = neighbors.length;
  return {
    offsets,
    neighbors: Uint32Array.from(neighbors),
    kinds: Uint8Array.from(kinds),
  };
};

const getRouteLength = (
  context: GenerationContext,
  cells: readonly number[],
): number => {
  let total = 0;

  for (let index = 0; index < cells.length - 1; index += 1) {
    const current = cells[index] ?? -1;
    const next = cells[index + 1] ?? -1;
    if (current < 0 || next < 0) {
      continue;
    }

    const dx =
      (context.world.cellsX[current] ?? 0) - (context.world.cellsX[next] ?? 0);
    const dy =
      (context.world.cellsY[current] ?? 0) - (context.world.cellsY[next] ?? 0);
    total += Math.sqrt(dx * dx + dy * dy);
  }

  return clamp(Math.round(total), 1, 65535);
};

const findRoutePath = (
  context: GenerationContext,
  startCellId: number,
  endCellId: number,
  isWater: boolean,
  connections: ReadonlyMap<string, number>,
): number[] | null => {
  if (startCellId === endCellId) {
    return [startCellId];
  }

  const {
    cellCount,
    cellsFeature,
    cellsBiome,
    cellsH,
    cellsTemp,
    cellsCoast,
    cellsBurg,
    cellsX,
    cellsY,
    cellNeighborOffsets,
    cellNeighbors,
  } = context.world;
  const distance = new Float64Array(cellCount);
  distance.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(cellCount);
  previous.fill(-1);
  const frontier: PathEntry[] = [];

  distance[startCellId] = 0;
  pushPathEntry(frontier, { cellId: startCellId, cost: 0 });

  while (frontier.length > 0) {
    const next = popPathEntry(frontier);
    if (!next) {
      break;
    }

    const currentCellId = next.cellId;
    const currentCost = next.cost;
    if (currentCost > (distance[currentCellId] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }

    if (currentCellId === endCellId) {
      const path: number[] = [];
      let cursor = endCellId;
      while (cursor >= 0) {
        path.push(cursor);
        if (cursor === startCellId) {
          break;
        }
        cursor = previous[cursor] ?? -1;
      }
      path.reverse();
      return path.length > 1 ? path : null;
    }

    forEachNeighbor(
      currentCellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        const nextIsWater = (cellsFeature[neighborId] ?? 0) !== 1;
        if (isWater !== nextIsWater) {
          return;
        }

        if (isWater && (cellsTemp[neighborId] ?? 0) < -4) {
          return;
        }

        if (!isWater) {
          const biome = cellsBiome[neighborId] ?? 0;
          const habitability = LAND_ROUTE_HABITABILITY[biome] ?? 0;
          if (habitability <= 0) {
            return;
          }
        }

        const dx = (cellsX[currentCellId] ?? 0) - (cellsX[neighborId] ?? 0);
        const dy = (cellsY[currentCellId] ?? 0) - (cellsY[neighborId] ?? 0);
        const distanceCost = dx * dx + dy * dy;
        const connectionModifier = connections.has(
          routeEdgeKey(currentCellId, neighborId),
        )
          ? 0.5
          : 1;
        const stepCost = isWater
          ? distanceCost *
            getSeaRouteTypeModifier(cellsCoast[neighborId] ?? 0) *
            connectionModifier
          : distanceCost *
            (1 +
              Math.max(
                100 -
                  (LAND_ROUTE_HABITABILITY[cellsBiome[neighborId] ?? 0] ?? 0),
                0,
              ) /
                1000) *
            (1 + Math.max((cellsH[neighborId] ?? 0) - 25, 25) / 25) *
            connectionModifier *
            ((cellsBurg[neighborId] ?? 0) > 0 ? 1 : 3);
        const totalCost = currentCost + stepCost;

        if (totalCost >= (distance[neighborId] ?? Number.POSITIVE_INFINITY)) {
          return;
        }

        distance[neighborId] = totalCost;
        previous[neighborId] = currentCellId;
        pushPathEntry(frontier, { cellId: neighborId, cost: totalCost });
      },
    );
  }

  return null;
};

const generateRouteSegments = (
  context: GenerationContext,
  burgGroups: Readonly<Record<number, readonly RoutedBurg[]>>,
  connections: Map<string, number>,
  kind: number,
): GeneratedRoute[] => {
  const routes: GeneratedRoute[] = [];

  for (const burgs of Object.values(burgGroups)) {
    if (burgs.length < 2) {
      continue;
    }

    const points = burgs.map(({ x, y }) => [x, y] as RouteNode);
    const urquhartEdges = calculateUrquhartEdges(points);

    for (const edge of urquhartEdges) {
      const fromIndex = edge[0] ?? -1;
      const toIndex = edge[1] ?? -1;
      const fromBurg = fromIndex >= 0 ? burgs[fromIndex] : undefined;
      const toBurg = toIndex >= 0 ? burgs[toIndex] : undefined;
      if (!fromBurg || !toBurg) {
        continue;
      }

      const startCellId =
        kind === ROUTE_KIND_SEA ? fromBurg.portCellId : fromBurg.cellId;
      const endCellId =
        kind === ROUTE_KIND_SEA ? toBurg.portCellId : toBurg.cellId;
      if (startCellId < 0 || endCellId < 0) {
        continue;
      }

      const corePath = findRoutePath(
        context,
        startCellId,
        endCellId,
        kind === ROUTE_KIND_SEA,
        connections,
      );
      if (!corePath || corePath.length < 2) {
        continue;
      }

      const fullPath =
        kind === ROUTE_KIND_SEA
          ? [fromBurg.cellId].concat(corePath, [toBurg.cellId])
          : corePath;
      const segments = mergeRouteSegments(
        getRouteSegments(fullPath, connections),
      );

      for (const segment of segments) {
        addRouteConnections(segment, kind, connections);
        routes.push({
          fromState: fromBurg.stateId,
          toState: toBurg.stateId,
          kind,
          weight: getRouteLength(context, segment),
          cells: segment,
        });
      }
    }
  }

  return routes;
};

export const runRoutesStage = (context: GenerationContext): void => {
  const {
    cellCount,
    stateCount,
    burgCount,
    burgCell,
    burgX,
    burgY,
    burgCapital,
    burgPort,
    cellsState,
    cellsFeatureId,
    gridToPack,
    packHaven,
  } = context.world;

  if (stateCount <= 0 || burgCount <= 0) {
    context.world.routeCount = 0;
    context.world.routeFromState = new Uint16Array(1);
    context.world.routeToState = new Uint16Array(1);
    context.world.routeKind = new Uint8Array(1);
    context.world.routeWeight = new Uint16Array(1);
    context.world.cellRouteOffsets = new Uint32Array(cellCount + 1);
    context.world.cellRouteNeighbors = new Uint32Array(0);
    context.world.cellRouteKinds = new Uint8Array(0);
    return;
  }

  const landBurgsByFeature: Record<number, RoutedBurg[]> = {};
  const capitalsByFeature: Record<number, RoutedBurg[]> = {};
  const portsByWaterbody: Record<number, RoutedBurg[]> = {};

  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const cellId = burgCell[burgId] ?? -1;
    if (cellId < 0) {
      continue;
    }

    const featureId = cellsFeatureId[cellId] ?? 0;
    const stateId = cellsState[cellId] ?? 0;
    const port = burgPort[burgId] ?? 0;
    const packId =
      context.internal.burgPackIds[burgId] ?? gridToPack[cellId] ?? -1;
    const portCellId = packId >= 0 ? (packHaven[packId] ?? -1) : -1;
    const routedBurg: RoutedBurg = {
      burgId,
      cellId,
      x: burgX[burgId] ?? 0,
      y: burgY[burgId] ?? 0,
      stateId,
      portCellId,
    };

    if (featureId > 0) {
      landBurgsByFeature[featureId] ??= [];
      landBurgsByFeature[featureId]!.push(routedBurg);

      if ((burgCapital[burgId] ?? 0) === 1) {
        capitalsByFeature[featureId] ??= [];
        capitalsByFeature[featureId]!.push(routedBurg);
      }
    }

    if (port > 0 && portCellId >= 0) {
      portsByWaterbody[port] ??= [];
      portsByWaterbody[port]!.push(routedBurg);
    }
  }

  const connections = new Map<string, number>();
  const routes = generateRouteSegments(
    context,
    capitalsByFeature,
    connections,
    ROUTE_KIND_ROAD,
  )
    .concat(
      generateRouteSegments(
        context,
        landBurgsByFeature,
        connections,
        ROUTE_KIND_TRAIL,
      ),
    )
    .concat(
      generateRouteSegments(
        context,
        portsByWaterbody,
        connections,
        ROUTE_KIND_SEA,
      ),
    );

  const routeCount = routes.length;
  const routeFromState = new Uint16Array(routeCount + 1);
  const routeToState = new Uint16Array(routeCount + 1);
  const routeKind = new Uint8Array(routeCount + 1);
  const routeWeight = new Uint16Array(routeCount + 1);

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
    const routeId = routeIndex + 1;
    const route = routes[routeIndex];
    if (!route) {
      continue;
    }

    routeFromState[routeId] = clamp(route.fromState, 0, 65535);
    routeToState[routeId] = clamp(route.toState, 0, 65535);
    routeKind[routeId] = route.kind;
    routeWeight[routeId] = route.weight;
  }

  const cellRouteLinks = buildCellRouteLinks(cellCount, connections);

  context.world.routeCount = routeCount;
  context.world.routeFromState = routeFromState;
  context.world.routeToState = routeToState;
  context.world.routeKind = routeKind;
  context.world.routeWeight = routeWeight;
  context.world.cellRouteOffsets = cellRouteLinks.offsets;
  context.world.cellRouteNeighbors = cellRouteLinks.neighbors;
  context.world.cellRouteKinds = cellRouteLinks.kinds;
};

export const runProvincesStage = (context: GenerationContext): void =>
  runPoliticalProvincesStage(context);

export const runReligionsStage = (context: GenerationContext): void =>
  runPoliticalReligionsStage(context);

export const runMilitaryStage = (context: GenerationContext): void => {
  const {
    cellsMilitary,
    cellsState,
    cellsTemp,
    cellsFlow,
    cellsPrec,
    cellsBurg,
    burgCount,
    burgCell,
    burgPopulation,
  } = context.world;

  cellsMilitary.fill(0);

  if (burgCount <= 0) {
    context.world.militaryCount = 0;
    context.world.militaryCell = new Uint32Array(1);
    context.world.militaryState = new Uint16Array(1);
    context.world.militaryType = new Uint8Array(1);
    context.world.militaryStrength = new Uint16Array(1);
    return;
  }

  const burgScore = (burgId: number): number => {
    const cellId = burgCell[burgId] ?? 0;
    const population = burgPopulation[burgId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    const precipitation = cellsPrec[cellId] ?? 0;
    const temperature = Math.max(cellsTemp[cellId] ?? 0, -40);

    return (
      population * 1.4 + flow / 6 + precipitation / 3 + (temperature + 20) * 2
    );
  };

  const burgIds = Array.from(
    { length: burgCount },
    (_, index) => index + 1,
  ).sort((a, b) => {
    const scoreDiff = burgScore(b) - burgScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a - b;
  });

  const targetMilitary = Math.max(
    1,
    Math.min(512, Math.round(burgCount * 0.85)),
  );
  const militaryCount = Math.min(targetMilitary, burgCount);

  const militaryCell = new Uint32Array(militaryCount + 1);
  const militaryState = new Uint16Array(militaryCount + 1);
  const militaryType = new Uint8Array(militaryCount + 1);
  const militaryStrength = new Uint16Array(militaryCount + 1);

  for (let unitIndex = 0; unitIndex < militaryCount; unitIndex += 1) {
    const militaryId = unitIndex + 1;
    const burgId = burgIds[unitIndex] ?? 1;
    const cellId = burgCell[burgId] ?? 0;
    const stateId = cellsState[cellId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    const precipitation = cellsPrec[cellId] ?? 0;
    const temperature = cellsTemp[cellId] ?? 0;
    const population = burgPopulation[burgId] ?? 0;

    cellsMilitary[cellId] = militaryId;
    militaryCell[militaryId] = cellId;
    militaryState[militaryId] = stateId;

    let unitType = 1;
    if (temperature <= -8) {
      unitType = 3;
    } else if (flow > 1200 || precipitation > 180) {
      unitType = 2;
    }
    militaryType[militaryId] = unitType;

    const strength = Math.round(
      population * 0.7 + flow / 10 + precipitation / 2 + 35,
    );
    militaryStrength[militaryId] = clamp(strength, 20, 65535);
  }

  context.world.militaryCount = militaryCount;
  context.world.militaryCell = militaryCell;
  context.world.militaryState = militaryState;
  context.world.militaryType = militaryType;
  context.world.militaryStrength = militaryStrength;
};

export const runMarkersZonesStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsH,
    cellsCoast,
    cellsFlow,
    cellsTemp,
    cellsPrec,
    cellsRiver,
    cellsX,
    cellsY,
    cellsBurg,
    cellsZone,
  } = context.world;

  const { layers } = context.config;

  cellsZone.fill(0);

  if (!layers.markers) {
    context.world.markerCount = 0;
    context.world.markerCell = new Uint32Array(1);
    context.world.markerType = new Uint8Array(1);
    context.world.markerStrength = new Uint8Array(1);
  }

  if (!layers.zones) {
    context.world.zoneCount = 0;
    context.world.zoneSeedCell = new Uint32Array(1);
    context.world.zoneType = new Uint8Array(1);
    context.world.zoneCells = new Uint32Array(1);
  }

  const landCells: number[] = [];
  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) === 1) {
      landCells.push(cellId);
    }
  }

  if (landCells.length === 0) {
    return;
  }

  if (layers.markers) {
    const scored = landCells
      .map((cellId) => {
        const h = cellsH[cellId] ?? 0;
        const river = cellsRiver[cellId] ?? 0;
        const flow = cellsFlow[cellId] ?? 0;
        const coast = cellsCoast[cellId] ?? 0;
        const burg = cellsBurg[cellId] ?? 0;
        const temp = cellsTemp[cellId] ?? 0;

        const score =
          h * 1.2 +
          (river > 0 ? 120 : 0) +
          flow / 10 +
          (coast === 1 ? 80 : 0) +
          (burg > 0 ? 90 : 0) +
          Math.max(0, -temp) * 1.4;

        return { cellId, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.cellId - b.cellId;
      });

    const targetMarkers = Math.min(
      64,
      Math.max(1, Math.round(Math.sqrt(landCells.length) / 1.5)),
    );
    const selected: number[] = [];
    const minDistanceSq = Math.max(
      context.grid.spacing * context.grid.spacing * 25,
      1,
    );

    for (const candidate of scored) {
      if (selected.length >= targetMarkers) {
        break;
      }

      const x = cellsX[candidate.cellId] ?? 0;
      const y = cellsY[candidate.cellId] ?? 0;
      let tooClose = false;

      for (const existingCellId of selected) {
        const dx = x - (cellsX[existingCellId] ?? 0);
        const dy = y - (cellsY[existingCellId] ?? 0);
        if (dx * dx + dy * dy < minDistanceSq) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        selected.push(candidate.cellId);
      }
    }

    const markerCount = selected.length;
    const nextMarkerCell = new Uint32Array(markerCount + 1);
    const nextMarkerType = new Uint8Array(markerCount + 1);
    const nextMarkerStrength = new Uint8Array(markerCount + 1);

    for (let markerIndex = 0; markerIndex < markerCount; markerIndex += 1) {
      const markerId = markerIndex + 1;
      const cellId = selected[markerIndex] ?? 0;

      nextMarkerCell[markerId] = cellId;

      const h = cellsH[cellId] ?? 0;
      const river = cellsRiver[cellId] ?? 0;
      const coast = cellsCoast[cellId] ?? 0;
      const burg = cellsBurg[cellId] ?? 0;

      let type = 4;
      if (h >= 75) {
        type = 1;
      } else if (river > 0) {
        type = 2;
      } else if (coast === 1) {
        type = 3;
      } else if (burg > 0) {
        type = 5;
      }

      nextMarkerType[markerId] = type;
      nextMarkerStrength[markerId] = clamp(
        Math.round((cellsFlow[cellId] ?? 0) / 120 + h / 3 + 20),
        1,
        255,
      );
    }

    context.world.markerCount = markerCount;
    context.world.markerCell = nextMarkerCell;
    context.world.markerType = nextMarkerType;
    context.world.markerStrength = nextMarkerStrength;
  }

  if (layers.zones) {
    const zoneTarget = Math.min(
      24,
      Math.max(1, Math.round(Math.sqrt(landCells.length) / 2.5)),
    );

    const seeds: number[] = [];
    const scoredLand = landCells
      .map((cellId) => {
        const h = cellsH[cellId] ?? 0;
        const temp = cellsTemp[cellId] ?? 0;
        const prec = cellsPrec[cellId] ?? 0;
        const variability = Math.abs(temp) + Math.abs(prec - 128) / 2 + h / 3;
        return { cellId, variability };
      })
      .sort((a, b) => {
        if (b.variability !== a.variability) {
          return b.variability - a.variability;
        }
        return a.cellId - b.cellId;
      });

    const minDistanceSq = Math.max(
      context.grid.spacing * context.grid.spacing * 64,
      1,
    );

    for (const candidate of scoredLand) {
      if (seeds.length >= zoneTarget) {
        break;
      }

      const x = cellsX[candidate.cellId] ?? 0;
      const y = cellsY[candidate.cellId] ?? 0;
      let tooClose = false;

      for (const seedCellId of seeds) {
        const dx = x - (cellsX[seedCellId] ?? 0);
        const dy = y - (cellsY[seedCellId] ?? 0);
        if (dx * dx + dy * dy < minDistanceSq) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        seeds.push(candidate.cellId);
      }
    }

    if (seeds.length === 0) {
      seeds.push(landCells[0] ?? 0);
    }

    const zoneCount = seeds.length;
    const zoneSeedCell = new Uint32Array(zoneCount + 1);
    const zoneType = new Uint8Array(zoneCount + 1);
    const zoneCells = new Uint32Array(zoneCount + 1);

    for (let zoneIndex = 0; zoneIndex < zoneCount; zoneIndex += 1) {
      zoneSeedCell[zoneIndex + 1] = seeds[zoneIndex] ?? 0;
    }

    for (const cellId of landCells) {
      const x = cellsX[cellId] ?? 0;
      const y = cellsY[cellId] ?? 0;

      let bestZoneIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let zoneIndex = 0; zoneIndex < zoneCount; zoneIndex += 1) {
        const seedCellId = seeds[zoneIndex] ?? 0;
        const dx = x - (cellsX[seedCellId] ?? 0);
        const dy = y - (cellsY[seedCellId] ?? 0);
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistance) {
          bestDistance = distanceSq;
          bestZoneIndex = zoneIndex;
        }
      }

      const zoneId = bestZoneIndex + 1;
      cellsZone[cellId] = zoneId;
      zoneCells[zoneId] = (zoneCells[zoneId] ?? 0) + 1;
    }

    for (let zoneId = 1; zoneId <= zoneCount; zoneId += 1) {
      const seedCellId = zoneSeedCell[zoneId] ?? 0;
      const temp = cellsTemp[seedCellId] ?? 0;
      const prec = cellsPrec[seedCellId] ?? 0;
      const h = cellsH[seedCellId] ?? 0;

      let type = 4;
      if (temp < -10) {
        type = 1;
      } else if (prec < 75) {
        type = 2;
      } else if (h > 70) {
        type = 3;
      }

      zoneType[zoneId] = type;
    }

    context.world.zoneCount = zoneCount;
    context.world.zoneSeedCell = zoneSeedCell;
    context.world.zoneType = zoneType;
    context.world.zoneCells = zoneCells;
  }
};
