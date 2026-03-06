import { Delaunay } from "d3-delaunay";
import type { GenerationContext } from "../types";
import { hashSeed } from "./random";

const EPSILON = 1e-10;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

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

type HeightmapTool =
  | "Hill"
  | "Pit"
  | "Range"
  | "Trough"
  | "Strait"
  | "Mask"
  | "Add"
  | "Multiply"
  | "Smooth";

type HeightmapStep = readonly [HeightmapTool, string, string, string, string];

const HEIGHTMAP_STEPS: Readonly<Record<string, readonly HeightmapStep[]>> = {
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
  "inland-sea": [
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
  field: Float32Array,
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
  field: Float32Array,
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
  field: Float32Array,
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
  field: Float32Array,
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
  if (latitude >= 0) {
    return equator - ((equator - northPole) * latitude) / 90;
  }

  return equator - ((equator - southPole) * Math.abs(latitude)) / 90;
};

const buildVoronoiAdjacency = (
  xs: Float32Array,
  ys: Float32Array,
  width: number,
  height: number,
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
  const offsets = new Uint32Array(cellCount + 1);
  const neighbors: number[] = [];

  const points: [number, number][] = Array.from(
    { length: cellCount },
    (_, index) => [xs[index] ?? 0, ys[index] ?? 0],
  );

  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi([0, 0, width, height]);
  const border = new Uint8Array(cellCount);
  const vertexX: number[] = [];
  const vertexY: number[] = [];
  const vertexMap = new Map<string, number>();
  const cellVertexOffsets = new Uint32Array(cellCount + 1);
  const cellVertices: number[] = [];

  const getVertexId = (x: number, y: number): number => {
    const key = `${x.toFixed(4)},${y.toFixed(4)}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const vertexId = vertexX.length;
    vertexMap.set(key, vertexId);
    vertexX.push(x);
    vertexY.push(y);
    return vertexId;
  };

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    offsets[cellId] = neighbors.length;
    neighbors.push(...delaunay.neighbors(cellId));
    cellVertexOffsets[cellId] = cellVertices.length;

    const polygon = voronoi.cellPolygon(cellId);
    let touchesBorder = false;

    if (!polygon) {
      touchesBorder = true;
    } else {
      let pointsCount = polygon.length;
      if (pointsCount > 1) {
        const [firstX, firstY] = polygon[0] ?? [0, 0];
        const [lastX, lastY] = polygon[pointsCount - 1] ?? [0, 0];
        if (
          Math.abs(firstX - lastX) < 1e-9 &&
          Math.abs(firstY - lastY) < 1e-9
        ) {
          pointsCount -= 1;
        }
      }

      for (let vertexIndex = 0; vertexIndex < pointsCount; vertexIndex += 1) {
        const [x, y] = polygon[vertexIndex] ?? [0, 0];
        if (x <= 0 || y <= 0 || x >= width || y >= height) {
          touchesBorder = true;
        }

        const vertexId = getVertexId(x, y);
        cellVertices.push(vertexId);
      }
    }

    border[cellId] = touchesBorder ? 1 : 0;
  }

  offsets[cellCount] = neighbors.length;
  cellVertexOffsets[cellCount] = cellVertices.length;

  return {
    offsets,
    neighbors: Uint32Array.from(neighbors),
    border,
    vertexX: Float32Array.from(vertexX),
    vertexY: Float32Array.from(vertexY),
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

  const spacing = Math.sqrt((width * height) / requestedCells);
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
  context.world.burgPopulation = new Uint16Array(1);
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
  context.world.cellsRiver = new Uint8Array(cellCount);
  context.world.cellsBiome = new Uint8Array(cellCount);
  context.world.cellsWaterbody = new Uint32Array(cellCount);
  context.world.waterbodyCount = 0;
  context.world.waterbodyType = new Uint8Array(1);
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
  context.world.packFeatureBorder = new Uint8Array(1);
  context.world.packFeatureSize = new Uint32Array(1);
  context.world.packFeatureFirstCell = new Uint32Array(1);
  context.world.packCoast = new Int8Array(0);
  context.world.packHaven = new Int32Array(0);
  context.world.packHarbor = new Uint8Array(0);
  context.world.vertexX = new Float32Array(0);
  context.world.vertexY = new Float32Array(0);
  context.world.cellVertexOffsets = new Uint32Array(cellCount + 1);
  context.world.cellVertices = new Uint32Array(0);

  let index = 0;
  for (let row = 0; row < cellsY; row += 1) {
    const y = radius + row * spacing;

    for (let column = 0; column < cellsX; column += 1) {
      const x = radius + column * spacing;
      const xJitter = (context.random() * 2 - 1) * jittering;
      const yJitter = (context.random() * 2 - 1) * jittering;

      context.world.cellsX[index] = clamp(x + xJitter, 0, width);
      context.world.cellsY[index] = clamp(y + yJitter, 0, height);
      index += 1;
    }
  }

  const adjacency = buildVoronoiAdjacency(
    context.world.cellsX,
    context.world.cellsY,
    width,
    height,
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
  const blobPower = getBlobPower(requestedCells);
  const linePower = getLinePower(requestedCells);
  const steps = HEIGHTMAP_STEPS[heightTemplate] ?? [];

  const rand = (min?: number, max?: number): number => {
    if (min === undefined && max === undefined) {
      return context.random();
    }

    if (max === undefined) {
      max = min;
      min = 0;
    }

    const low = min ?? 0;
    const high = max ?? low;
    return Math.floor(context.random() * (high - low + 1)) + low;
  };

  const probability = (value: number): boolean => {
    if (value >= 1) {
      return true;
    }
    if (value <= 0) {
      return false;
    }
    return context.random() < value;
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
        const x = getPointInRange(rangeX, width);
        const y = getPointInRange(rangeY, height);
        start = findGridCell(x, y);
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
            (context.random() * 0.2 + 0.9);
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
        const x = getPointInRange(rangeX, width);
        const y = getPointInRange(rangeY, height);
        start = findGridCell(x, y);
        limit += 1;
      } while ((heights[start] ?? 0) < 20 && limit < 50);

      const queue = [start];
      while (queue.length) {
        const current = queue.shift() ?? 0;
        h = h ** blobPower * (context.random() * 0.2 + 0.9);
        if (h < 1) {
          return;
        }

        for (const neighbor of neighborsOf(current)) {
          if ((used[neighbor] ?? 0) === 1) {
            continue;
          }

          heights[neighbor] = clamp(
            (heights[neighbor] ?? 0) - h * (context.random() * 0.2 + 0.9),
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
        if (context.random() > randomDividerChance) {
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
        let startX = getPointInRange(rangeX, width);
        let startY = getPointInRange(rangeY, height);
        let limit = 0;

        if (isTrough) {
          do {
            startX = getPointInRange(rangeX, width);
            startY = getPointInRange(rangeY, height);
            startCellId = findGridCell(startX, startY);
            limit += 1;
          } while ((heights[startCellId] ?? 0) < 20 && limit < 50);
        } else {
          startCellId = findGridCell(startX, startY);
        }

        let dist = 0;
        limit = 0;
        let endX = 0;
        let endY = 0;
        do {
          endX = context.random() * width * 0.8 + width * 0.1;
          endY = context.random() * height * 0.7 + height * 0.15;
          dist = Math.abs(endY - startY) + Math.abs(endX - startX);
          limit += 1;
        } while (
          (dist < width / 8 || dist > width / (isTrough ? 2 : 3)) &&
          limit < 50
        );

        endCellId = findGridCell(endX, endY);
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
              (isTrough ? -1 : 1) * h * (context.random() * 0.3 + 0.85),
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
      ? Math.floor(context.random() * width * 0.4 + width * 0.3)
      : 5;
    const startY = vertical
      ? 5
      : Math.floor(context.random() * height * 0.4 + height * 0.3);
    const endX = vertical
      ? Math.floor(
          width - startX - width * 0.1 + context.random() * width * 0.2,
        )
      : width - 5;
    const endY = vertical
      ? height - 5
      : Math.floor(
          height - startY - height * 0.1 + context.random() * height * 0.2,
        );
    const startCellId = findGridCell(startX, startY);
    const endCellId = findGridCell(endX, endY);

    const getStraitPath = (current: number, end: number): number[] => {
      const path: number[] = [];

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
          if (context.random() > 0.8) {
            diff /= 2;
          }
          if (diff < min) {
            min = diff;
            next = neighbor;
          }
        }

        current = next;
        path.push(current);
      }

      return path;
    };

    let frontier = getStraitPath(startCellId, endCellId);
    const step = 0.1 / desiredWidth;

    for (let layer = 0; layer < desiredWidth; layer += 1) {
      const query: number[] = [];
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
      maskHeightField(context, heights as unknown as Float32Array, Number(a2));
      continue;
    }
    if (tool === "Add") {
      modifyHeightField(heights as unknown as Float32Array, a3, Number(a2), 1);
      continue;
    }
    if (tool === "Multiply") {
      modifyHeightField(heights as unknown as Float32Array, a3, 0, Number(a2));
      continue;
    }
    if (tool === "Smooth") {
      smoothHeightField(
        context,
        heights as unknown as Float32Array,
        Number(a2),
      );
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

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const height = cellsH[cellId] ?? 0;
    cellsFeature[cellId] = height >= seaLevel ? 1 : 0;
    cellsCoast[cellId] = 0;
  }

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const isLand = cellsFeature[cellId] === 1;
    let touchesOpposite = false;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if (touchesOpposite) {
          return;
        }

        const neighborIsLand = cellsFeature[neighborId] === 1;
        if (neighborIsLand !== isLand) {
          touchesOpposite = true;
        }
      },
    );

    if (touchesOpposite) {
      cellsCoast[cellId] = isLand ? 1 : -1;
    }
  }

  const MAX_DISTANCE = 10;

  for (let distance = 2; distance <= MAX_DISTANCE; distance += 1) {
    for (let cellId = 0; cellId < cellCount; cellId += 1) {
      if (cellsFeature[cellId] !== 1 || cellsCoast[cellId] !== 0) {
        continue;
      }

      let reachesPreviousBand = false;
      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          if (reachesPreviousBand) {
            return;
          }

          if (cellsCoast[neighborId] === distance - 1) {
            reachesPreviousBand = true;
          }
        },
      );

      if (reachesPreviousBand) {
        cellsCoast[cellId] = distance;
      }
    }
  }

  for (let distance = -2; distance >= -MAX_DISTANCE; distance -= 1) {
    for (let cellId = 0; cellId < cellCount; cellId += 1) {
      if (cellsFeature[cellId] !== 0 || cellsCoast[cellId] !== 0) {
        continue;
      }

      let reachesPreviousBand = false;
      forEachNeighbor(
        cellId,
        cellNeighborOffsets,
        cellNeighbors,
        (neighborId) => {
          if (reachesPreviousBand) {
            return;
          }

          if (cellsCoast[neighborId] === distance + 1) {
            reachesPreviousBand = true;
          }
        },
      );

      if (reachesPreviousBand) {
        cellsCoast[cellId] = distance;
      }
    }
  }
};

export const runPackStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsX,
    cellsY,
    cellsH,
    cellsCoast,
    cellsArea,
    cellsFeature,
    cellNeighborOffsets,
    cellNeighbors,
    gridToPack,
  } = context.world;

  gridToPack.fill(-1);

  let packCellCount = 0;
  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    gridToPack[cellId] = packCellCount;
    packCellCount += 1;
  }

  const packToGrid = new Uint32Array(packCellCount);
  const packX = new Float32Array(packCellCount);
  const packY = new Float32Array(packCellCount);
  const packH = new Uint8Array(packCellCount);
  const packArea = new Float32Array(packCellCount);
  const packCoast = new Int8Array(packCellCount);
  const packHaven = new Int32Array(packCellCount);
  const packHarbor = new Uint8Array(packCellCount);

  packHaven.fill(-1);

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    const packId = gridToPack[cellId] ?? -1;
    if (packId < 0) {
      continue;
    }

    packToGrid[packId] = cellId;
    packX[packId] = cellsX[cellId] ?? 0;
    packY[packId] = cellsY[cellId] ?? 0;
    packH[packId] = cellsH[cellId] ?? 0;
    packArea[packId] = cellsArea[cellId] ?? 0;

    const coast = cellsCoast[cellId] ?? 0;
    packCoast[packId] = coast > 0 ? coast : 0;

    let nearestWaterCell = -1;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    let adjacentWaterCount = 0;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborCellId) => {
        if ((gridToPack[neighborCellId] ?? -1) >= 0) {
          return;
        }

        adjacentWaterCount += 1;
        const dx = (cellsX[neighborCellId] ?? 0) - (cellsX[cellId] ?? 0);
        const dy = (cellsY[neighborCellId] ?? 0) - (cellsY[cellId] ?? 0);
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < nearestDistanceSq) {
          nearestDistanceSq = distanceSq;
          nearestWaterCell = neighborCellId;
        }
      },
    );

    if (adjacentWaterCount > 0) {
      packHaven[packId] = nearestWaterCell;
      packHarbor[packId] = Math.min(adjacentWaterCount, 255);
    }
  }

  const neighborLists: number[][] = Array.from(
    { length: packCellCount },
    () => [],
  );

  for (let packId = 0; packId < packCellCount; packId += 1) {
    const gridCellId = packToGrid[packId] ?? 0;
    const seen = new Set<number>();
    const packNeighborList = neighborLists[packId];
    if (!packNeighborList) {
      continue;
    }

    forEachNeighbor(
      gridCellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborCellId) => {
        const neighborPackId = gridToPack[neighborCellId] ?? -1;
        if (neighborPackId < 0 || neighborPackId === packId) {
          return;
        }

        if (seen.has(neighborPackId)) {
          return;
        }

        seen.add(neighborPackId);
        packNeighborList.push(neighborPackId);
      },
    );

    packNeighborList.sort((a, b) => a - b);
  }

  const packNeighborOffsets = new Uint32Array(packCellCount + 1);
  const packNeighborsFlat: number[] = [];

  for (let packId = 0; packId < packCellCount; packId += 1) {
    packNeighborOffsets[packId] = packNeighborsFlat.length;
    packNeighborsFlat.push(...(neighborLists[packId] ?? []));
  }
  packNeighborOffsets[packCellCount] = packNeighborsFlat.length;

  context.world.packCellCount = packCellCount;
  context.world.packToGrid = packToGrid;
  context.world.packX = packX;
  context.world.packY = packY;
  context.world.packH = packH;
  context.world.packArea = packArea;
  context.world.packNeighborOffsets = packNeighborOffsets;
  context.world.packNeighbors = Uint32Array.from(packNeighborsFlat);
  context.world.packCellsFeatureId = new Uint32Array(packCellCount);
  context.world.packCoast = packCoast;
  context.world.packHaven = packHaven;
  context.world.packHarbor = packHarbor;
};

export const runPackFeatureStage = (context: GenerationContext): void => {
  const {
    packCellCount,
    packNeighborOffsets,
    packNeighbors,
    packToGrid,
    cellsBorder,
    packCellsFeatureId,
  } = context.world;

  packCellsFeatureId.fill(0);

  if (packCellCount <= 0) {
    context.world.packFeatureCount = 0;
    context.world.packFeatureType = new Uint8Array(1);
    context.world.packFeatureBorder = new Uint8Array(1);
    context.world.packFeatureSize = new Uint32Array(1);
    context.world.packFeatureFirstCell = new Uint32Array(1);
    return;
  }

  let packFeatureCount = 0;
  const packFeatureType: number[] = [0];
  const packFeatureBorder: number[] = [0];
  const packFeatureSize: number[] = [0];
  const packFeatureFirstCell: number[] = [0];

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

    while (queue.length > 0) {
      const packCellId = queue.pop();
      if (packCellId === undefined) {
        break;
      }

      size += 1;
      const gridCellId = packToGrid[packCellId] ?? 0;
      if ((cellsBorder[gridCellId] ?? 0) === 1) {
        border = true;
      }

      forEachNeighbor(
        packCellId,
        packNeighborOffsets,
        packNeighbors,
        (neighborPackId) => {
          if ((packCellsFeatureId[neighborPackId] ?? 0) !== 0) {
            return;
          }

          packCellsFeatureId[neighborPackId] = packFeatureId;
          queue.push(neighborPackId);
        },
      );
    }

    packFeatureType[packFeatureId] = 3;
    packFeatureBorder[packFeatureId] = border ? 1 : 0;
    packFeatureSize[packFeatureId] = size;
    packFeatureFirstCell[packFeatureId] = startPackCell;
  }

  context.world.packFeatureCount = packFeatureCount;
  context.world.packFeatureType = Uint8Array.from(packFeatureType);
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
    landmassBorder,
    landmassSize,
    cellsWaterbody,
    waterbodyCount,
    waterbodyType,
    waterbodySize,
    cellsFeatureId,
  } = context.world;

  cellsFeatureId.fill(0);

  const featureCount = waterbodyCount + landmassCount;
  if (featureCount <= 0) {
    context.world.featureCount = 0;
    context.world.featureType = new Uint8Array(1);
    context.world.featureLand = new Uint8Array(1);
    context.world.featureBorder = new Uint8Array(1);
    context.world.featureSize = new Uint32Array(1);
    context.world.featureFirstCell = new Uint32Array(1);
    return;
  }

  const featureType = new Uint8Array(featureCount + 1);
  const featureLand = new Uint8Array(featureCount + 1);
  const featureBorder = new Uint8Array(featureCount + 1);
  const featureSize = new Uint32Array(featureCount + 1);
  const featureFirstCell = new Uint32Array(featureCount + 1);

  for (let waterbodyId = 1; waterbodyId <= waterbodyCount; waterbodyId += 1) {
    featureType[waterbodyId] = (waterbodyType[waterbodyId] ?? 0) === 1 ? 1 : 2;
    featureLand[waterbodyId] = 0;
    featureBorder[waterbodyId] =
      (waterbodyType[waterbodyId] ?? 0) === 1 ? 1 : 0;
    featureSize[waterbodyId] = waterbodySize[waterbodyId] ?? 0;
  }

  for (let landmassId = 1; landmassId <= landmassCount; landmassId += 1) {
    const featureId = waterbodyCount + landmassId;
    featureType[featureId] = 3;
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
  const waterbodySize: number[] = [0];

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

    waterbodyType[waterbodyId] = border ? 1 : 2;
    waterbodySize[waterbodyId] = size;
  }

  context.world.waterbodyCount = waterbodyCount;
  context.world.waterbodyType = Uint8Array.from(waterbodyType);
  context.world.waterbodySize = Uint32Array.from(waterbodySize);
};

export const runClimateStage = (context: GenerationContext): void => {
  const {
    height,
    seaLevel,
    climate: {
      elevationExponent,
      temperatureEquator,
      temperatureNorthPole,
      temperatureSouthPole,
    },
  } = context.config;

  const { cellCount, cellsY, cellsH, cellsTemp, cellsPrec } = context.world;

  for (let index = 0; index < cellCount; index += 1) {
    const y = cellsY[index] ?? 0;
    const h = cellsH[index] ?? 0;

    const latitude = 90 - (y / height) * 180;
    const seaLevelTemperature = temperatureAtLatitude(
      latitude,
      temperatureEquator,
      temperatureNorthPole,
      temperatureSouthPole,
    );

    const altitudePenalty =
      h < seaLevel ? 0 : ((h - seaLevel) ** elevationExponent / 1000) * 6.5;

    const temperature = Math.round(seaLevelTemperature - altitudePenalty);
    cellsTemp[index] = clamp(temperature, -128, 127);

    const latitudeMoisture = 1 - Math.abs(latitude) / 90;
    const elevationDryness = h / 100;
    const randomVariation = (context.random() - 0.5) * 0.2;
    const precipitation = clamp01(
      0.2 +
        latitudeMoisture * 0.6 +
        (1 - elevationDryness) * 0.25 +
        randomVariation,
    );

    cellsPrec[index] = Math.round(precipitation * 255);
  }
};

export const runHydrologyStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsH,
    cellsPrec,
    cellsFeature,
    cellNeighborOffsets,
    cellNeighbors,
    cellsFlow,
    cellsRiver,
  } = context.world;

  const order = Array.from({ length: cellCount }, (_, index) => index).sort(
    (a, b) => {
      const hA = cellsH[a] ?? 0;
      const hB = cellsH[b] ?? 0;
      return hB - hA;
    },
  );

  const downhill = new Int32Array(cellCount);
  downhill.fill(-1);

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    cellsFlow[cellId] = cellsPrec[cellId] ?? 0;
    cellsRiver[cellId] = 0;

    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const currentHeight = cellsH[cellId] ?? 0;
    let target = -1;
    let targetHeight = currentHeight;
    let waterTarget = -1;
    let waterTargetHeight = Number.POSITIVE_INFINITY;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        const neighborHeight = cellsH[neighborId] ?? 0;
        const neighborIsWater = (cellsFeature[neighborId] ?? 0) === 0;

        if (neighborIsWater && neighborHeight < waterTargetHeight) {
          waterTarget = neighborId;
          waterTargetHeight = neighborHeight;
        }

        if (neighborHeight < targetHeight) {
          target = neighborId;
          targetHeight = neighborHeight;
        }
      },
    );

    if (target < 0 && waterTarget >= 0) {
      target = waterTarget;
    }

    downhill[cellId] = target;
  }

  for (const cellId of order) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const flow = cellsFlow[cellId] ?? 0;
    const target = downhill[cellId] ?? -1;
    if (target >= 0) {
      cellsFlow[target] = (cellsFlow[target] ?? 0) + flow;
    }
  }

  const riverThreshold = Math.max(600, Math.floor(cellCount / 10));

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const flow = cellsFlow[cellId] ?? 0;
    if (flow >= riverThreshold && (downhill[cellId] ?? -1) >= 0) {
      cellsRiver[cellId] = 1;
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
    const wetness = Math.min(255, prec + river * 30);

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
    cellsTemp,
    cellsPrec,
    packCellCount,
    packToGrid,
    packX,
    packY,
  } = context.world;

  cellsCulture.fill(0);

  if (packCellCount <= 0) {
    context.world.cultureCount = 0;
    context.world.cultureSeedCell = new Uint32Array(1);
    context.world.cultureSize = new Uint32Array(1);
    return;
  }

  const targetCultures = Math.min(requestedCultures, packCellCount);
  const isSeed = new Uint8Array(packCellCount);
  const seedPackIds: number[] = [];

  const firstSeed = Math.floor(context.random() * packCellCount);
  seedPackIds.push(firstSeed);
  isSeed[firstSeed] = 1;

  const minDistance = new Float64Array(packCellCount);
  minDistance.fill(Number.POSITIVE_INFINITY);

  const updateDistances = (seedPackId: number): void => {
    const sx = packX[seedPackId] ?? 0;
    const sy = packY[seedPackId] ?? 0;

    for (let packId = 0; packId < packCellCount; packId += 1) {
      const x = packX[packId] ?? 0;
      const y = packY[packId] ?? 0;
      const dx = x - sx;
      const dy = y - sy;
      const distanceSq = dx * dx + dy * dy;
      const currentMinDistance = minDistance[packId];

      if (currentMinDistance === undefined || distanceSq < currentMinDistance) {
        minDistance[packId] = distanceSq;
      }
    }
  };

  updateDistances(firstSeed);

  while (seedPackIds.length < targetCultures) {
    let bestPackId = -1;
    let bestScore = -1;

    for (let packId = 0; packId < packCellCount; packId += 1) {
      if ((isSeed[packId] ?? 0) === 1) {
        continue;
      }

      const gridCellId = packToGrid[packId] ?? 0;
      const precipitation = cellsPrec[gridCellId] ?? 0;
      const temperature = cellsTemp[gridCellId] ?? 0;
      const tempBonus = temperature > 0 ? temperature / 80 : 0;
      const suitability = 1 + precipitation / 510 + tempBonus * 0.25;
      const score = (minDistance[packId] ?? 0) * suitability;

      if (
        score > bestScore ||
        (score === bestScore && (bestPackId < 0 || packId < bestPackId))
      ) {
        bestScore = score;
        bestPackId = packId;
      }
    }

    if (bestPackId < 0) {
      break;
    }

    seedPackIds.push(bestPackId);
    isSeed[bestPackId] = 1;
    updateDistances(bestPackId);
  }

  const cultureCount = seedPackIds.length;
  const cultureSeedCell = new Uint32Array(cultureCount + 1);
  const cultureSize = new Uint32Array(cultureCount + 1);

  for (let cultureIndex = 0; cultureIndex < cultureCount; cultureIndex += 1) {
    const packId = seedPackIds[cultureIndex] ?? 0;
    cultureSeedCell[cultureIndex + 1] = packToGrid[packId] ?? 0;
  }

  for (let packId = 0; packId < packCellCount; packId += 1) {
    const x = packX[packId] ?? 0;
    const y = packY[packId] ?? 0;

    let bestCultureIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let cultureIndex = 0; cultureIndex < cultureCount; cultureIndex += 1) {
      const seedPackId = seedPackIds[cultureIndex] ?? 0;
      const sx = packX[seedPackId] ?? 0;
      const sy = packY[seedPackId] ?? 0;
      const dx = x - sx;
      const dy = y - sy;
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistance) {
        bestDistance = distanceSq;
        bestCultureIndex = cultureIndex;
      }
    }

    const cultureId = bestCultureIndex + 1;
    const gridCellId = packToGrid[packId] ?? 0;
    cellsCulture[gridCellId] = cultureId;
    cultureSize[cultureId] = (cultureSize[cultureId] ?? 0) + 1;
  }

  context.world.cultureCount = cultureCount;
  context.world.cultureSeedCell = cultureSeedCell;
  context.world.cultureSize = cultureSize;
};

export const runSettlementsStage = (context: GenerationContext): void => {
  const {
    cellsBurg,
    cellsCulture,
    cellsFlow,
    cellsPrec,
    cellsTemp,
    cellsLandmass,
    landmassCount,
    landmassSize,
    packCellCount,
    packToGrid,
    packX,
    packY,
    packArea,
    packCoast,
    packHarbor,
  } = context.world;

  cellsBurg.fill(0);

  if (packCellCount <= 0) {
    context.world.burgCount = 0;
    context.world.burgCell = new Uint32Array(1);
    context.world.burgPopulation = new Uint16Array(1);
    context.world.burgPort = new Uint8Array(1);
    context.world.burgCulture = new Uint16Array(1);
    return;
  }

  const totalArea = Array.from(packArea).reduce((sum, area) => sum + area, 0);
  const averageArea = totalArea / Math.max(packCellCount, 1);
  const averageLandmassSize =
    landmassCount > 0
      ? packCellCount / Math.max(landmassCount, 1)
      : packCellCount;

  const suitabilityScore = (packId: number): number => {
    const gridCellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[gridCellId] ?? 0;
    const precipitation = cellsPrec[gridCellId] ?? 0;
    const temperature = cellsTemp[gridCellId] ?? 0;
    const area = packArea[packId] ?? 0;
    const coast = packCoast[packId] ?? 0;
    const harbor = packHarbor[packId] ?? 0;
    const landmassId = cellsLandmass[gridCellId] ?? 0;
    const landmassCellCount = landmassSize[landmassId] ?? 0;

    const temperatureScore =
      temperature <= -20 ? 0.2 : temperature < 0 ? 0.7 : 1 + temperature / 70;
    const flowScore = Math.min(flow / 1500, 4);
    const moistureScore = precipitation / 220;
    const areaScore =
      averageArea > 0 ? Math.min(area / averageArea, 2.5) * 0.35 : 0;
    const coastScore = coast > 0 ? 0.8 : 0;
    const harborScore = harbor > 0 ? 1.5 + harbor * 0.2 : 0;
    const landmassScore =
      averageLandmassSize > 0
        ? Math.min(landmassCellCount / averageLandmassSize, 3) * 0.9
        : 0;

    return (
      1 +
      temperatureScore +
      flowScore +
      moistureScore +
      areaScore +
      coastScore +
      harborScore +
      landmassScore
    );
  };

  const selected = new Uint8Array(packCellCount);
  const selectedPackIds: number[] = [];
  const minDistanceSq = new Float64Array(packCellCount);
  minDistanceSq.fill(Number.POSITIVE_INFINITY);

  const updateDistances = (seedPackId: number): void => {
    const sx = packX[seedPackId] ?? 0;
    const sy = packY[seedPackId] ?? 0;

    for (let packId = 0; packId < packCellCount; packId += 1) {
      const dx = (packX[packId] ?? 0) - sx;
      const dy = (packY[packId] ?? 0) - sy;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < (minDistanceSq[packId] ?? Number.POSITIVE_INFINITY)) {
        minDistanceSq[packId] = distanceSq;
      }
    }
  };

  const targetBurgs = Math.min(
    packCellCount,
    Math.max(6, Math.min(512, Math.round(packCellCount / 75))),
  );
  const distanceScale = Math.max(
    context.grid.spacing * context.grid.spacing * 5,
    1,
  );

  let firstPackId = 0;
  let firstScore = -1;
  for (let packId = 0; packId < packCellCount; packId += 1) {
    const score = suitabilityScore(packId);
    if (score > firstScore || (score === firstScore && packId < firstPackId)) {
      firstScore = score;
      firstPackId = packId;
    }
  }

  selected[firstPackId] = 1;
  selectedPackIds.push(firstPackId);
  updateDistances(firstPackId);

  while (selectedPackIds.length < targetBurgs) {
    let bestPackId = -1;
    let bestRank = -1;

    for (let packId = 0; packId < packCellCount; packId += 1) {
      if ((selected[packId] ?? 0) === 1) {
        continue;
      }

      const score = suitabilityScore(packId);
      const distanceBoost =
        0.85 + Math.min((minDistanceSq[packId] ?? 0) / distanceScale, 2.2);
      const rank = score * distanceBoost;

      if (
        rank > bestRank ||
        (rank === bestRank && (bestPackId < 0 || packId < bestPackId))
      ) {
        bestRank = rank;
        bestPackId = packId;
      }
    }

    if (bestPackId < 0) {
      break;
    }

    selected[bestPackId] = 1;
    selectedPackIds.push(bestPackId);
    updateDistances(bestPackId);
  }

  const burgCount = selectedPackIds.length;
  const burgCell = new Uint32Array(burgCount + 1);
  const burgPopulation = new Uint16Array(burgCount + 1);
  const burgPort = new Uint8Array(burgCount + 1);
  const burgCulture = new Uint16Array(burgCount + 1);

  for (let burgIndex = 0; burgIndex < burgCount; burgIndex += 1) {
    const burgId = burgIndex + 1;
    const packId = selectedPackIds[burgIndex] ?? 0;
    const gridCellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[gridCellId] ?? 0;
    const precipitation = cellsPrec[gridCellId] ?? 0;
    const temperature = Math.max(cellsTemp[gridCellId] ?? 0, 0);
    const harbor = packHarbor[packId] ?? 0;
    const area = packArea[packId] ?? 0;
    const areaBonus = averageArea > 0 ? (area / averageArea) * 12 : 0;
    const portBonus = harbor > 0 ? 40 + harbor * 12 : 0;

    const population = Math.round(
      25 +
        flow / 22 +
        precipitation / 8 +
        temperature * 1.4 +
        areaBonus +
        portBonus,
    );

    cellsBurg[gridCellId] = burgId;
    burgCell[burgId] = gridCellId;
    burgPopulation[burgId] = clamp(population, 10, 65535);
    burgPort[burgId] = harbor > 0 ? 1 : 0;
    burgCulture[burgId] = cellsCulture[gridCellId] ?? 0;
  }

  context.world.burgCount = burgCount;
  context.world.burgCell = burgCell;
  context.world.burgPopulation = burgPopulation;
  context.world.burgPort = burgPort;
  context.world.burgCulture = burgCulture;
};

export const runStatesStage = (context: GenerationContext): void => {
  const {
    cellsCulture,
    cellsFeature,
    cellsH,
    cellsFlow,
    cellsLandmass,
    cellsBurg,
    cellsState,
    burgCount,
    burgCell,
    burgPopulation,
    burgPort,
    burgCulture,
    packCellCount,
    packToGrid,
    packX,
    packY,
    packCoast,
    packHarbor,
    packNeighborOffsets,
    packNeighbors,
    gridToPack,
    cellsX,
    cellsY,
    cellNeighborOffsets,
    cellNeighbors,
    landmassSize,
  } = context.world;

  cellsState.fill(0);

  if (packCellCount <= 0 || burgCount <= 0) {
    context.world.stateCount = 0;
    context.world.stateCenterBurg = new Uint16Array(1);
    context.world.stateCulture = new Uint16Array(1);
    context.world.stateForm = new Uint8Array(1);
    context.world.stateCells = new Uint32Array(1);
    return;
  }

  const targetStates = Math.min(
    burgCount,
    Math.max(
      3,
      Math.min(
        64,
        Math.round(
          Math.max(
            context.config.culturesCount * 1.2,
            burgCount / 4,
            Math.sqrt(burgCount) * 2.25,
          ),
        ),
      ),
    ),
  );
  const distanceScale = Math.max(
    context.grid.spacing * context.grid.spacing * 24,
    1,
  );

  const burgScore = (burgId: number): number => {
    const population = burgPopulation[burgId] ?? 0;
    const port = burgPort[burgId] ?? 0;
    const culture = burgCulture[burgId] ?? 0;

    return population + port * 220 + (culture > 0 ? 35 : 0);
  };

  const selected = new Uint8Array(burgCount + 1);
  const selectedBurgIds: number[] = [];
  const minDistanceSq = new Float64Array(burgCount + 1);
  minDistanceSq.fill(Number.POSITIVE_INFINITY);
  const selectedCultureCount = new Uint8Array(context.config.culturesCount + 1);
  const majorLandmassThreshold = Math.max(24, Math.round(packCellCount / 40));
  const bestLandmassBurg = new Uint16Array(landmassSize.length);
  const bestLandmassScore = new Float64Array(landmassSize.length);
  bestLandmassScore.fill(-1);
  const landmassQuota = new Uint16Array(landmassSize.length);
  const selectedLandmassCount = new Uint16Array(landmassSize.length);

  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const cellId = burgCell[burgId] ?? 0;
    const landmassId = cellsLandmass[cellId] ?? 0;
    if (landmassId <= 0 || landmassId >= landmassSize.length) {
      continue;
    }

    const score = burgScore(burgId);
    if (score > (bestLandmassScore[landmassId] ?? -1)) {
      bestLandmassScore[landmassId] = score;
      bestLandmassBurg[landmassId] = burgId;
    }
  }

  let quotaAssigned = 0;
  const landmassFractions: { landmassId: number; remainder: number }[] = [];
  for (let landmassId = 1; landmassId < landmassSize.length; landmassId += 1) {
    if ((bestLandmassBurg[landmassId] ?? 0) === 0) {
      continue;
    }

    const rawQuota =
      ((landmassSize[landmassId] ?? 0) / packCellCount) * targetStates;
    let baseQuota = Math.floor(rawQuota);
    if ((landmassSize[landmassId] ?? 0) >= majorLandmassThreshold) {
      baseQuota = Math.max(baseQuota, 1);
    }

    landmassQuota[landmassId] = baseQuota;
    quotaAssigned += baseQuota;
    landmassFractions.push({
      landmassId,
      remainder: rawQuota - Math.floor(rawQuota),
    });
  }

  landmassFractions.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }

    return b.landmassId - a.landmassId;
  });

  for (
    let index = 0;
    quotaAssigned < targetStates && index < landmassFractions.length;
    index += 1
  ) {
    const landmassId = landmassFractions[index]?.landmassId;
    if (landmassId === undefined) {
      continue;
    }

    landmassQuota[landmassId] = (landmassQuota[landmassId] ?? 0) + 1;
    quotaAssigned += 1;
  }

  const updateDistances = (seedBurgId: number): void => {
    const seedCell = burgCell[seedBurgId] ?? 0;
    const sx = cellsX[seedCell] ?? 0;
    const sy = cellsY[seedCell] ?? 0;

    for (let burgId = 1; burgId <= burgCount; burgId += 1) {
      const cellId = burgCell[burgId] ?? 0;
      const dx = (cellsX[cellId] ?? 0) - sx;
      const dy = (cellsY[cellId] ?? 0) - sy;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < (minDistanceSq[burgId] ?? Number.POSITIVE_INFINITY)) {
        minDistanceSq[burgId] = distanceSq;
      }
    }
  };

  let firstBurgId = 1;
  let firstScore = -1;
  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const score = burgScore(burgId);
    if (score > firstScore || (score === firstScore && burgId < firstBurgId)) {
      firstScore = score;
      firstBurgId = burgId;
    }
  }

  selected[firstBurgId] = 1;
  selectedBurgIds.push(firstBurgId);
  const firstCultureId = burgCulture[firstBurgId] ?? 0;
  const firstLandmassId = cellsLandmass[burgCell[firstBurgId] ?? 0] ?? 0;
  if (firstCultureId > 0 && firstCultureId < selectedCultureCount.length) {
    selectedCultureCount[firstCultureId] = 1;
  }
  if (firstLandmassId > 0 && firstLandmassId < selectedLandmassCount.length) {
    selectedLandmassCount[firstLandmassId] = 1;
  }
  updateDistances(firstBurgId);

  while (selectedBurgIds.length < targetStates) {
    let bestBurgId = -1;
    let bestRank = -1;

    for (let burgId = 1; burgId <= burgCount; burgId += 1) {
      if ((selected[burgId] ?? 0) === 1) {
        continue;
      }

      const score = burgScore(burgId);
      const cultureId = burgCulture[burgId] ?? 0;
      const landmassId = cellsLandmass[burgCell[burgId] ?? 0] ?? 0;
      const quotaBoost =
        landmassId > 0 &&
        (selectedLandmassCount[landmassId] ?? 0) <
          (landmassQuota[landmassId] ?? 0)
          ? 1.4
          : 0.82;
      const cultureBoost =
        cultureId > 0 && (selectedCultureCount[cultureId] ?? 0) === 0
          ? 1.15
          : 1;
      const distanceBoost =
        0.95 + Math.min((minDistanceSq[burgId] ?? 0) / distanceScale, 2.75);
      const rank = score * distanceBoost * cultureBoost * quotaBoost;

      if (
        rank > bestRank ||
        (rank === bestRank && (bestBurgId < 0 || burgId < bestBurgId))
      ) {
        bestRank = rank;
        bestBurgId = burgId;
      }
    }

    if (bestBurgId < 0) {
      break;
    }

    selected[bestBurgId] = 1;
    selectedBurgIds.push(bestBurgId);
    const cultureId = burgCulture[bestBurgId] ?? 0;
    const landmassId = cellsLandmass[burgCell[bestBurgId] ?? 0] ?? 0;
    if (cultureId > 0 && cultureId < selectedCultureCount.length) {
      selectedCultureCount[cultureId] = 1;
    }
    if (landmassId > 0 && landmassId < selectedLandmassCount.length) {
      selectedLandmassCount[landmassId] =
        (selectedLandmassCount[landmassId] ?? 0) + 1;
    }
    updateDistances(bestBurgId);
  }
  const selectedLandmass = new Uint8Array(landmassSize.length);

  for (const burgId of selectedBurgIds) {
    const landmassId = cellsLandmass[burgCell[burgId] ?? 0] ?? 0;
    if (landmassId > 0 && landmassId < selectedLandmass.length) {
      selectedLandmass[landmassId] = 1;
    }
  }

  for (let landmassId = 1; landmassId < landmassSize.length; landmassId += 1) {
    if ((landmassSize[landmassId] ?? 0) < majorLandmassThreshold) {
      continue;
    }

    if ((selectedLandmass[landmassId] ?? 0) === 1) {
      continue;
    }

    const burgId = bestLandmassBurg[landmassId] ?? 0;
    if (burgId <= 0 || (selected[burgId] ?? 0) === 1) {
      continue;
    }

    selected[burgId] = 1;
    selectedBurgIds.push(burgId);
    selectedLandmass[landmassId] = 1;
  }

  const stateCount = selectedBurgIds.length;
  const stateCenterBurg = new Uint16Array(stateCount + 1);
  const stateCulture = new Uint16Array(stateCount + 1);
  const stateForm = new Uint8Array(stateCount + 1);
  const stateCells = new Uint32Array(stateCount + 1);
  const capitalX = new Float32Array(stateCount + 1);
  const capitalY = new Float32Array(stateCount + 1);

  for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
    const stateId = stateIndex + 1;
    const capitalBurgId = selectedBurgIds[stateIndex] ?? 1;
    const capitalCell = burgCell[capitalBurgId] ?? 0;
    const capitalPackId = gridToPack[capitalCell] ?? -1;

    stateCenterBurg[stateId] = capitalBurgId;
    stateCulture[stateId] = burgCulture[capitalBurgId] ?? 0;
    capitalX[stateId] = cellsX[capitalCell] ?? 0;
    capitalY[stateId] = cellsY[capitalCell] ?? 0;

    if (capitalPackId >= 0) {
      stateCells[stateId] = 1;
    }
  }

  const packState = new Uint16Array(packCellCount);
  const packCost = new Float64Array(packCellCount);
  packCost.fill(Number.POSITIVE_INFINITY);
  const frontier: FrontierEntry[] = [];

  const getStateExpansionCost = (packId: number, stateId: number): number => {
    const gridCellId = packToGrid[packId] ?? 0;
    const height = cellsH[gridCellId] ?? 0;
    const flow = cellsFlow[gridCellId] ?? 0;
    const cultureId = cellsCulture[gridCellId] ?? 0;
    const coast = packCoast[packId] ?? 0;
    const harbor = packHarbor[packId] ?? 0;

    const heightPenalty = Math.max(0, height - 45) / 10;
    const riverBonus = Math.min(flow / 1400, 1.6);
    const coastBonus = coast > 0 ? 0.55 : 0;
    const harborBonus = harbor > 0 ? 0.6 : 0;
    const culturePenalty =
      cultureId > 0 && cultureId !== (stateCulture[stateId] ?? 0) ? 1.45 : 0;

    return Math.max(
      0.8,
      1.9 +
        heightPenalty +
        culturePenalty -
        riverBonus -
        coastBonus -
        harborBonus,
    );
  };

  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    const capitalBurgId = stateCenterBurg[stateId] ?? 0;
    const capitalCell = burgCell[capitalBurgId] ?? 0;
    const capitalPackId = gridToPack[capitalCell] ?? -1;
    if (capitalPackId < 0) {
      continue;
    }

    packState[capitalPackId] = stateId;
    packCost[capitalPackId] = 0;
    cellsState[capitalCell] = stateId;

    forEachNeighbor(
      capitalPackId,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if ((packState[neighborPackId] ?? 0) !== 0) {
          return;
        }

        pushFrontierEntry(frontier, {
          cost: getStateExpansionCost(neighborPackId, stateId),
          stateId,
          packId: neighborPackId,
        });
      },
    );
  }

  while (frontier.length > 0) {
    const next = popFrontierEntry(frontier);
    if (!next) {
      break;
    }

    if ((packState[next.packId] ?? 0) !== 0) {
      continue;
    }

    packState[next.packId] = next.stateId;
    packCost[next.packId] = next.cost;
    const gridCellId = packToGrid[next.packId] ?? 0;
    cellsState[gridCellId] = next.stateId;
    stateCells[next.stateId] = (stateCells[next.stateId] ?? 0) + 1;

    forEachNeighbor(
      next.packId,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if ((packState[neighborPackId] ?? 0) !== 0) {
          return;
        }

        pushFrontierEntry(frontier, {
          cost: next.cost + getStateExpansionCost(neighborPackId, next.stateId),
          stateId: next.stateId,
          packId: neighborPackId,
        });
      },
    );
  }

  for (let packId = 0; packId < packCellCount; packId += 1) {
    const gridCellId = packToGrid[packId] ?? 0;
    if (
      (cellsFeature[gridCellId] ?? 0) !== 1 ||
      (packState[packId] ?? 0) !== 0
    ) {
      continue;
    }

    const x = packX[packId] ?? 0;
    const y = packY[packId] ?? 0;
    const cultureId = cellsCulture[gridCellId] ?? 0;

    let bestStateId = 1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let stateId = 1; stateId <= stateCount; stateId += 1) {
      const dx = x - (capitalX[stateId] ?? 0);
      const dy = y - (capitalY[stateId] ?? 0);
      const distanceSq = dx * dx + dy * dy;
      const sameCulture =
        cultureId !== 0 && cultureId === (stateCulture[stateId] ?? 0);
      const adjustedDistance = sameCulture ? distanceSq * 0.9 : distanceSq;

      if (adjustedDistance < bestDistance) {
        bestDistance = adjustedDistance;
        bestStateId = stateId;
      }
    }

    packState[packId] = bestStateId;
    cellsState[gridCellId] = bestStateId;
    stateCells[bestStateId] = (stateCells[bestStateId] ?? 0) + 1;
  }

  const capitalCellByState = new Uint32Array(stateCount + 1);
  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    capitalCellByState[stateId] = burgCell[stateCenterBurg[stateId] ?? 0] ?? 0;
  }

  for (let cellId = 0; cellId < cellsState.length; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1 || (cellsBurg[cellId] ?? 0) > 0) {
      continue;
    }

    let same = 0;
    let bestForeignState = 0;
    let bestForeignCount = 0;
    const currentState = cellsState[cellId] ?? 0;
    const foreignCounts = new Uint8Array(stateCount + 1);

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if ((cellsFeature[neighborId] ?? 0) !== 1) {
          return;
        }

        const neighborState = cellsState[neighborId] ?? 0;
        if (neighborState === currentState) {
          same += 1;
          return;
        }

        if (neighborState <= 0) {
          return;
        }

        foreignCounts[neighborState] = (foreignCounts[neighborState] ?? 0) + 1;
        if ((foreignCounts[neighborState] ?? 0) > bestForeignCount) {
          bestForeignCount = foreignCounts[neighborState] ?? 0;
          bestForeignState = neighborState;
        }
      },
    );

    if (bestForeignState <= 0 || bestForeignCount < 2 || same > 1) {
      continue;
    }

    const capitalCell = capitalCellByState[currentState] ?? 0;
    let touchesCapital = false;
    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if (neighborId === capitalCell) {
          touchesCapital = true;
        }
      },
    );

    if (!touchesCapital) {
      cellsState[cellId] = bestForeignState;
    }
  }

  stateCells.fill(0);
  for (let cellId = 0; cellId < cellsState.length; cellId += 1) {
    const stateId = cellsState[cellId] ?? 0;
    if ((cellsFeature[cellId] ?? 0) !== 1 || stateId <= 0) {
      continue;
    }

    stateCells[stateId] = (stateCells[stateId] ?? 0) + 1;
  }

  const averageStateCells = packCellCount / Math.max(stateCount, 1);

  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    const capitalBurgId = stateCenterBurg[stateId] ?? 0;
    const port = burgPort[capitalBurgId] ?? 0;
    const size = stateCells[stateId] ?? 0;

    if (port === 1 && size < averageStateCells * 1.25) {
      stateForm[stateId] = 2;
      continue;
    }

    if (size < averageStateCells * 0.5) {
      stateForm[stateId] = 3;
      continue;
    }

    stateForm[stateId] = 1;
  }

  context.world.stateCount = stateCount;
  context.world.stateCenterBurg = stateCenterBurg;
  context.world.stateCulture = stateCulture;
  context.world.stateForm = stateForm;
  context.world.stateCells = stateCells;
};

export const runRoutesStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsState,
    cellsX,
    cellsY,
    cellNeighborOffsets,
    cellNeighbors,
    stateCount,
  } = context.world;

  if (stateCount <= 0) {
    context.world.routeCount = 0;
    context.world.routeFromState = new Uint16Array(1);
    context.world.routeToState = new Uint16Array(1);
    context.world.routeKind = new Uint8Array(1);
    context.world.routeWeight = new Uint16Array(1);
    return;
  }

  const edgeMinDistanceSq = new Map<string, number>();

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const stateA = cellsState[cellId] ?? 0;
    if (stateA <= 0) {
      continue;
    }

    const x = cellsX[cellId] ?? 0;
    const y = cellsY[cellId] ?? 0;

    forEachNeighbor(
      cellId,
      cellNeighborOffsets,
      cellNeighbors,
      (neighborId) => {
        if ((cellsFeature[neighborId] ?? 0) !== 1) {
          return;
        }

        const stateB = cellsState[neighborId] ?? 0;
        if (stateB <= 0 || stateA === stateB) {
          return;
        }

        const from = Math.min(stateA, stateB);
        const to = Math.max(stateA, stateB);
        const key = `${from}:${to}`;

        const dx = (cellsX[neighborId] ?? 0) - x;
        const dy = (cellsY[neighborId] ?? 0) - y;
        const distanceSq = dx * dx + dy * dy;
        const currentMin = edgeMinDistanceSq.get(key);

        if (currentMin === undefined || distanceSq < currentMin) {
          edgeMinDistanceSq.set(key, distanceSq);
        }
      },
    );
  }

  const edges = Array.from(edgeMinDistanceSq.entries())
    .map(([key, distanceSq]) => {
      const [fromText, toText] = key.split(":");
      return {
        from: Number(fromText),
        to: Number(toText),
        distanceSq,
      };
    })
    .filter(
      ({ from, to }) =>
        from > 0 && to > 0 && from <= stateCount && to <= stateCount,
    )
    .sort((a, b) => {
      if (a.from !== b.from) {
        return a.from - b.from;
      }
      return a.to - b.to;
    });

  const routeCount = edges.length;
  const routeFromState = new Uint16Array(routeCount + 1);
  const routeToState = new Uint16Array(routeCount + 1);
  const routeKind = new Uint8Array(routeCount + 1);
  const routeWeight = new Uint16Array(routeCount + 1);

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
    const routeId = routeIndex + 1;
    const edge = edges[routeIndex];
    if (!edge) {
      continue;
    }

    routeFromState[routeId] = edge.from;
    routeToState[routeId] = edge.to;
    routeKind[routeId] = 1;
    routeWeight[routeId] = clamp(
      Math.round(Math.sqrt(edge.distanceSq)),
      1,
      65535,
    );
  }

  context.world.routeCount = routeCount;
  context.world.routeFromState = routeFromState;
  context.world.routeToState = routeToState;
  context.world.routeKind = routeKind;
  context.world.routeWeight = routeWeight;
};

export const runProvincesStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsState,
    cellsProvince,
    stateCount,
    stateCenterBurg,
    burgCount,
    burgCell,
    burgPopulation,
    cellsX,
    cellsY,
  } = context.world;

  cellsProvince.fill(0);

  if (stateCount <= 0 || burgCount <= 0) {
    context.world.provinceCount = 0;
    context.world.provinceState = new Uint16Array(1);
    context.world.provinceCenterCell = new Uint32Array(1);
    context.world.provinceCells = new Uint32Array(1);
    return;
  }

  const stateBurgCounts = new Uint16Array(stateCount + 1);
  const secondBurgCandidate = new Uint16Array(stateCount + 1);
  const secondBurgPopulation = new Uint16Array(stateCount + 1);

  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const cellId = burgCell[burgId] ?? 0;
    const stateId = cellsState[cellId] ?? 0;
    if (stateId <= 0 || stateId > stateCount) {
      continue;
    }

    stateBurgCounts[stateId] = (stateBurgCounts[stateId] ?? 0) + 1;

    if (burgId === (stateCenterBurg[stateId] ?? 0)) {
      continue;
    }

    const population = burgPopulation[burgId] ?? 0;
    const bestPopulation = secondBurgPopulation[stateId] ?? 0;

    if (population > bestPopulation) {
      secondBurgPopulation[stateId] = population;
      secondBurgCandidate[stateId] = burgId;
    }
  }

  const provinceStateList: number[] = [0];
  const provinceCenterCellList: number[] = [0];

  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    const capitalBurg = stateCenterBurg[stateId] ?? 0;
    if (capitalBurg > 0) {
      provinceStateList.push(stateId);
      provinceCenterCellList.push(burgCell[capitalBurg] ?? 0);
    }

    const burgsInState = stateBurgCounts[stateId] ?? 0;
    const secondaryBurg = secondBurgCandidate[stateId] ?? 0;
    if (burgsInState >= 4 && secondaryBurg > 0) {
      provinceStateList.push(stateId);
      provinceCenterCellList.push(burgCell[secondaryBurg] ?? 0);
    }
  }

  const provinceCount = provinceStateList.length - 1;
  if (provinceCount <= 0) {
    context.world.provinceCount = 0;
    context.world.provinceState = new Uint16Array(1);
    context.world.provinceCenterCell = new Uint32Array(1);
    context.world.provinceCells = new Uint32Array(1);
    return;
  }

  const provinceState = Uint16Array.from(provinceStateList);
  const provinceCenterCell = Uint32Array.from(provinceCenterCellList);
  const provinceCells = new Uint32Array(provinceCount + 1);

  const stateProvinceIds: number[][] = Array.from(
    { length: stateCount + 1 },
    () => [],
  );

  for (let provinceId = 1; provinceId <= provinceCount; provinceId += 1) {
    const stateId = provinceState[provinceId] ?? 0;
    if (stateId > 0 && stateId <= stateCount) {
      stateProvinceIds[stateId]?.push(provinceId);
    }
  }

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    const stateId = cellsState[cellId] ?? 0;
    if (stateId <= 0 || stateId > stateCount) {
      continue;
    }

    const provinceIds = stateProvinceIds[stateId] ?? [];
    if (provinceIds.length === 0) {
      continue;
    }

    const x = cellsX[cellId] ?? 0;
    const y = cellsY[cellId] ?? 0;

    let bestProvinceId = provinceIds[0] ?? 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const provinceId of provinceIds) {
      const centerCellId = provinceCenterCell[provinceId] ?? 0;
      const dx = x - (cellsX[centerCellId] ?? 0);
      const dy = y - (cellsY[centerCellId] ?? 0);
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistance) {
        bestDistance = distanceSq;
        bestProvinceId = provinceId;
      }
    }

    cellsProvince[cellId] = bestProvinceId;
    provinceCells[bestProvinceId] = (provinceCells[bestProvinceId] ?? 0) + 1;
  }

  context.world.provinceCount = provinceCount;
  context.world.provinceState = provinceState;
  context.world.provinceCenterCell = provinceCenterCell;
  context.world.provinceCells = provinceCells;
};

export const runReligionsStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsFeature,
    cellsReligion,
    cellsPrec,
    cellsTemp,
    cellsBurg,
    burgCount,
    burgCell,
    packCellCount,
    packToGrid,
    cellsX,
    cellsY,
  } = context.world;

  cellsReligion.fill(0);

  if (packCellCount <= 0) {
    context.world.religionCount = 0;
    context.world.religionSeedCell = new Uint32Array(1);
    context.world.religionType = new Uint8Array(1);
    context.world.religionSize = new Uint32Array(1);
    return;
  }

  const candidateCells: number[] = [];
  const candidateSet = new Set<number>();

  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const cellId = burgCell[burgId] ?? 0;
    if ((cellsFeature[cellId] ?? 0) !== 1 || candidateSet.has(cellId)) {
      continue;
    }
    candidateSet.add(cellId);
    candidateCells.push(cellId);
  }

  if (candidateCells.length === 0) {
    for (let packId = 0; packId < packCellCount; packId += 1) {
      const cellId = packToGrid[packId] ?? 0;
      if ((cellsFeature[cellId] ?? 0) !== 1 || candidateSet.has(cellId)) {
        continue;
      }
      candidateSet.add(cellId);
      candidateCells.push(cellId);
    }
  }

  if (candidateCells.length === 0) {
    context.world.religionCount = 0;
    context.world.religionSeedCell = new Uint32Array(1);
    context.world.religionType = new Uint8Array(1);
    context.world.religionSize = new Uint32Array(1);
    return;
  }

  const targetReligions = Math.min(
    candidateCells.length,
    Math.max(1, Math.min(32, Math.round(Math.sqrt(packCellCount) / 2))),
  );

  const candidateScore = (cellId: number): number => {
    const precipitation = cellsPrec[cellId] ?? 0;
    const temperature = Math.max(cellsTemp[cellId] ?? 0, 0);
    const burg = cellsBurg[cellId] ?? 0;

    return 1 + precipitation / 255 + temperature / 75 + (burg > 0 ? 0.9 : 0);
  };

  const selected = new Set<number>();
  const seedCells: number[] = [];
  const minDistanceSq = new Map<number, number>();

  const updateDistances = (seedCellId: number): void => {
    const sx = cellsX[seedCellId] ?? 0;
    const sy = cellsY[seedCellId] ?? 0;

    for (const candidateCellId of candidateCells) {
      const dx = (cellsX[candidateCellId] ?? 0) - sx;
      const dy = (cellsY[candidateCellId] ?? 0) - sy;
      const distanceSq = dx * dx + dy * dy;
      const currentMin = minDistanceSq.get(candidateCellId);
      if (currentMin === undefined || distanceSq < currentMin) {
        minDistanceSq.set(candidateCellId, distanceSq);
      }
    }
  };

  let firstSeed = candidateCells[0] ?? 0;
  let firstScore = -1;

  for (const candidateCellId of candidateCells) {
    const score = candidateScore(candidateCellId);
    if (
      score > firstScore ||
      (score === firstScore && candidateCellId < firstSeed)
    ) {
      firstScore = score;
      firstSeed = candidateCellId;
    }
  }

  selected.add(firstSeed);
  seedCells.push(firstSeed);
  updateDistances(firstSeed);

  const distanceScale = Math.max(
    context.grid.spacing * context.grid.spacing * 36,
    1,
  );

  while (seedCells.length < targetReligions) {
    let bestCellId = -1;
    let bestRank = -1;

    for (const candidateCellId of candidateCells) {
      if (selected.has(candidateCellId)) {
        continue;
      }

      const score = candidateScore(candidateCellId);
      const distanceBoost =
        1 +
        Math.min((minDistanceSq.get(candidateCellId) ?? 0) / distanceScale, 4);
      const rank = score * distanceBoost;

      if (
        rank > bestRank ||
        (rank === bestRank && candidateCellId < bestCellId)
      ) {
        bestRank = rank;
        bestCellId = candidateCellId;
      }
    }

    if (bestCellId < 0) {
      break;
    }

    selected.add(bestCellId);
    seedCells.push(bestCellId);
    updateDistances(bestCellId);
  }

  const religionCount = seedCells.length;
  const religionSeedCell = new Uint32Array(religionCount + 1);
  const religionType = new Uint8Array(religionCount + 1);
  const religionSize = new Uint32Array(religionCount + 1);

  for (
    let religionIndex = 0;
    religionIndex < religionCount;
    religionIndex += 1
  ) {
    religionSeedCell[religionIndex + 1] = seedCells[religionIndex] ?? 0;
  }

  let landCells = 0;

  for (let cellId = 0; cellId < cellCount; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) {
      continue;
    }

    landCells += 1;
    const x = cellsX[cellId] ?? 0;
    const y = cellsY[cellId] ?? 0;

    let bestReligionIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (
      let religionIndex = 0;
      religionIndex < religionCount;
      religionIndex += 1
    ) {
      const seedCellId = seedCells[religionIndex] ?? 0;
      const dx = x - (cellsX[seedCellId] ?? 0);
      const dy = y - (cellsY[seedCellId] ?? 0);
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < bestDistance) {
        bestDistance = distanceSq;
        bestReligionIndex = religionIndex;
      }
    }

    const religionId = bestReligionIndex + 1;
    cellsReligion[cellId] = religionId;
    religionSize[religionId] = (religionSize[religionId] ?? 0) + 1;
  }

  const averageSize = landCells / Math.max(religionCount, 1);

  for (let religionId = 1; religionId <= religionCount; religionId += 1) {
    const size = religionSize[religionId] ?? 0;
    const seedCellId = religionSeedCell[religionId] ?? 0;
    const hasBurg = (cellsBurg[seedCellId] ?? 0) > 0;

    if (size > averageSize * 1.5 || (hasBurg && size > averageSize * 0.8)) {
      religionType[religionId] = 2;
      continue;
    }

    if (size < averageSize * 0.5) {
      religionType[religionId] = 3;
      continue;
    }

    religionType[religionId] = 1;
  }

  context.world.religionCount = religionCount;
  context.world.religionSeedCell = religionSeedCell;
  context.world.religionType = religionType;
  context.world.religionSize = religionSize;
};

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
          river * 120 +
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
      } else if (river === 1) {
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
