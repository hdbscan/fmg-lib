import type { GenerationConfig, WorldGraphV1 } from "./types";

type Point = readonly [number, number];

export type PolygonMesh = Readonly<{
  vertices: readonly Point[];
  polygons: readonly number[][];
}>;

export type RegionMesh = Readonly<{
  vertices: readonly Point[];
  polygons: readonly number[][];
  states: readonly number[];
  religions: readonly number[];
}>;

export type BurgParityPoint = Readonly<{
  id: number;
  x: number;
  y: number;
  cell: number;
  name: string;
}>;

export type ParityCounts = Readonly<{
  landmasses: number;
  states: number;
  religions: number;
  burgs: number;
}>;

export type ParitySnapshot = Readonly<{
  kind: "upstream-oracle" | "local-world";
  seed: string;
  width: number;
  height: number;
  gridSpacing: number;
  terrain: Readonly<{
    mesh: PolygonMesh;
    land: readonly number[];
  }>;
  regions: RegionMesh;
  burgs: readonly BurgParityPoint[];
  counts: ParityCounts;
  cultureCount?: number;
  statesNumber?: number;
  townsNumber?: number;
  lakeElevationLimit?: number;
  config?: GenerationConfig;
  sourceUrl?: string;
}>;

export type CountParityMetric = Readonly<{
  oracle: number;
  local: number;
  delta: number;
}>;

export type RegionParityMetric = Readonly<{
  oracleRegionCount: number;
  localRegionCount: number;
  matchedRegionPairs: number;
  pixelIntersection: number;
  pixelUnion: number;
  iou: number;
}>;

export type BurgParityMetric = Readonly<{
  oracleCount: number;
  localCount: number;
  threshold: number;
  oracleRecallWithinThreshold: number;
  localPrecisionWithinThreshold: number;
  meanNearestDistance: number;
  medianNearestDistance: number;
}>;

export type ParityReport = Readonly<{
  oracle: Readonly<{
    seed: string;
    width: number;
    height: number;
    sourceUrl?: string;
  }>;
  local: Readonly<{
    seed: string;
    width: number;
    height: number;
    config?: GenerationConfig;
  }>;
  raster: Readonly<{
    width: number;
    height: number;
  }>;
  terrain: Readonly<{
    pixelIntersection: number;
    pixelUnion: number;
    iou: number;
  }>;
  politics: RegionParityMetric;
  religions: RegionParityMetric;
  burgs: BurgParityMetric;
  counts: Readonly<{
    landmasses: CountParityMetric;
    states: CountParityMetric;
    religions: CountParityMetric;
    burgs: CountParityMetric;
  }>;
}>;

const DEFAULT_RASTER_WIDTH = 256;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toPoints = (xs: Float32Array, ys: Float32Array): Point[] =>
  Array.from(xs, (_, index) => [xs[index] ?? 0, ys[index] ?? 0]);

const collectCellPolygons = (
  offsets: Uint32Array,
  vertices: Uint32Array,
): number[][] => {
  const polygons: number[][] = [];

  for (let cellId = 0; cellId < offsets.length - 1; cellId += 1) {
    const from = offsets[cellId] ?? 0;
    const to = offsets[cellId + 1] ?? from;
    polygons.push(Array.from(vertices.slice(from, to)));
  }

  return polygons;
};

const copyNumbers = (
  values: Uint8Array | Uint16Array | Uint32Array,
): number[] => Array.from(values);

const pointInPolygon = (
  x: number,
  y: number,
  polygon: readonly Point[],
): boolean => {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const [x1, y1] = polygon[current] ?? [0, 0];
    const [x2, y2] = polygon[previous] ?? [0, 0];
    const intersects =
      y1 > y !== y2 > y &&
      x < ((x2 - x1) * (y - y1)) / (y2 - y1 || Number.EPSILON) + x1;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

const scalePoint = (
  point: Point,
  mapWidth: number,
  mapHeight: number,
  rasterWidth: number,
  rasterHeight: number,
): Point => [
  (point[0] / mapWidth) * rasterWidth,
  (point[1] / mapHeight) * rasterHeight,
];

const rasterize = (
  mesh: PolygonMesh,
  labels: readonly number[],
  mapWidth: number,
  mapHeight: number,
  rasterWidth: number,
  rasterHeight: number,
): Int32Array => {
  const raster = new Int32Array(rasterWidth * rasterHeight);

  for (let polygonId = 0; polygonId < mesh.polygons.length; polygonId += 1) {
    const label = labels[polygonId] ?? 0;
    if (label <= 0) {
      continue;
    }

    const polygonVertexIds = mesh.polygons[polygonId] ?? [];
    if (polygonVertexIds.length < 3) {
      continue;
    }

    const polygon = polygonVertexIds.map((vertexId) =>
      scalePoint(
        mesh.vertices[vertexId] ?? [0, 0],
        mapWidth,
        mapHeight,
        rasterWidth,
        rasterHeight,
      ),
    );

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const startX = clamp(Math.floor(minX), 0, rasterWidth - 1);
    const endX = clamp(Math.ceil(maxX), 0, rasterWidth - 1);
    const startY = clamp(Math.floor(minY), 0, rasterHeight - 1);
    const endY = clamp(Math.ceil(maxY), 0, rasterHeight - 1);

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        if (!pointInPolygon(x + 0.5, y + 0.5, polygon)) {
          continue;
        }

        raster[y * rasterWidth + x] = label;
      }
    }
  }

  return raster;
};

const computeBinaryIou = (
  oracle: Int32Array,
  local: Int32Array,
): Readonly<{ pixelIntersection: number; pixelUnion: number; iou: number }> => {
  let pixelIntersection = 0;
  let pixelUnion = 0;

  for (let index = 0; index < oracle.length; index += 1) {
    const oracleValue = oracle[index] ?? 0;
    const localValue = local[index] ?? 0;
    if (oracleValue > 0 && localValue > 0) {
      pixelIntersection += 1;
    }
    if (oracleValue > 0 || localValue > 0) {
      pixelUnion += 1;
    }
  }

  return {
    pixelIntersection,
    pixelUnion,
    iou: pixelUnion === 0 ? 1 : pixelIntersection / pixelUnion,
  };
};

const buildRegionMetric = (
  oracleRaster: Int32Array,
  localRaster: Int32Array,
): RegionParityMetric => {
  const oracleIds = new Map<number, number>();
  const localIds = new Map<number, number>();
  const oracleCounts: number[] = [];
  const localCounts: number[] = [];
  const overlaps: number[][] = [];

  const ensureOracle = (label: number): number => {
    const existing = oracleIds.get(label);
    if (existing !== undefined) {
      return existing;
    }

    const index = oracleCounts.length;
    oracleIds.set(label, index);
    oracleCounts.push(0);
    overlaps.push(Array.from({ length: localCounts.length }, () => 0));
    return index;
  };

  const ensureLocal = (label: number): number => {
    const existing = localIds.get(label);
    if (existing !== undefined) {
      return existing;
    }

    const index = localCounts.length;
    localIds.set(label, index);
    localCounts.push(0);
    for (const row of overlaps) {
      row.push(0);
    }
    return index;
  };

  for (let index = 0; index < oracleRaster.length; index += 1) {
    const oracleLabel = oracleRaster[index] ?? 0;
    const localLabel = localRaster[index] ?? 0;

    if (oracleLabel > 0) {
      const oracleIndex = ensureOracle(oracleLabel);
      oracleCounts[oracleIndex] = (oracleCounts[oracleIndex] ?? 0) + 1;
    }
    if (localLabel > 0) {
      const localIndex = ensureLocal(localLabel);
      localCounts[localIndex] = (localCounts[localIndex] ?? 0) + 1;
    }
    if (oracleLabel > 0 && localLabel > 0) {
      const oracleIndex = ensureOracle(oracleLabel);
      const localIndex = ensureLocal(localLabel);
      const row = overlaps[oracleIndex];
      if (row) {
        row[localIndex] = (row[localIndex] ?? 0) + 1;
      }
    }
  }

  const size = Math.max(oracleCounts.length, localCounts.length);
  if (size === 0) {
    return {
      oracleRegionCount: 0,
      localRegionCount: 0,
      matchedRegionPairs: 0,
      pixelIntersection: 0,
      pixelUnion: 0,
      iou: 1,
    };
  }

  const maxOverlap = overlaps.reduce(
    (best, row) => Math.max(best, ...row, 0),
    0,
  );
  const cost = Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (_, columnIndex) => {
      const overlap = overlaps[rowIndex]?.[columnIndex] ?? 0;
      return maxOverlap - overlap;
    }),
  );

  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const p = new Array(size + 1).fill(0);
  const way = new Array(size + 1).fill(0);

  for (let row = 1; row <= size; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minv = new Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array(size + 1).fill(false);

    do {
      used[column0] = true;
      const row0 = p[column0] ?? 0;
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;

      for (let column = 1; column <= size; column += 1) {
        if (used[column]) {
          continue;
        }

        const current =
          (cost[row0 - 1]?.[column - 1] ?? maxOverlap) - u[row0] - v[column];
        if (current < minv[column]) {
          minv[column] = current;
          way[column] = column0;
        }
        if (minv[column] < delta) {
          delta = minv[column];
          column1 = column;
        }
      }

      for (let column = 0; column <= size; column += 1) {
        if (used[column]) {
          u[p[column] ?? 0] += delta;
          v[column] -= delta;
        } else {
          minv[column] -= delta;
        }
      }

      column0 = column1;
    } while ((p[column0] ?? 0) !== 0);

    do {
      const column1 = way[column0] ?? 0;
      p[column0] = p[column1] ?? 0;
      column0 = column1;
    } while (column0 !== 0);
  }

  const assignment = new Array(size).fill(-1);
  for (let column = 1; column <= size; column += 1) {
    const row = p[column] ?? 0;
    if (row > 0) {
      assignment[row - 1] = column - 1;
    }
  }

  let pixelIntersection = 0;
  let pixelUnion = 0;
  let matchedRegionPairs = 0;
  const matchedLocal = new Set<number>();

  for (let rowIndex = 0; rowIndex < oracleCounts.length; rowIndex += 1) {
    const columnIndex = assignment[rowIndex] ?? -1;
    const oracleCount = oracleCounts[rowIndex] ?? 0;
    if (columnIndex < 0 || columnIndex >= localCounts.length) {
      pixelUnion += oracleCount;
      continue;
    }

    matchedLocal.add(columnIndex);
    const localCount = localCounts[columnIndex] ?? 0;
    const overlap = overlaps[rowIndex]?.[columnIndex] ?? 0;
    if (overlap > 0) {
      matchedRegionPairs += 1;
    }
    pixelIntersection += overlap;
    pixelUnion += oracleCount + localCount - overlap;
  }

  for (
    let columnIndex = 0;
    columnIndex < localCounts.length;
    columnIndex += 1
  ) {
    if (!matchedLocal.has(columnIndex)) {
      pixelUnion += localCounts[columnIndex] ?? 0;
    }
  }

  return {
    oracleRegionCount: oracleCounts.length,
    localRegionCount: localCounts.length,
    matchedRegionPairs,
    pixelIntersection,
    pixelUnion,
    iou: pixelUnion === 0 ? 1 : pixelIntersection / pixelUnion,
  };
};

const computeMedian = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const nearestDistances = (
  source: readonly BurgParityPoint[],
  target: readonly BurgParityPoint[],
): number[] => {
  if (source.length === 0) {
    return [];
  }
  if (target.length === 0) {
    return source.map(() => Number.POSITIVE_INFINITY);
  }

  return source.map((point) => {
    let best = Number.POSITIVE_INFINITY;

    for (const candidate of target) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < best) {
        best = distance;
      }
    }

    return best;
  });
};

const computeBurgMetric = (
  oracle: ParitySnapshot,
  local: ParitySnapshot,
): BurgParityMetric => {
  const threshold = Math.max(oracle.gridSpacing, local.gridSpacing);
  const oracleDistances = nearestDistances(oracle.burgs, local.burgs);
  const localDistances = nearestDistances(local.burgs, oracle.burgs);
  const allDistances = oracleDistances
    .filter(Number.isFinite)
    .concat(localDistances.filter(Number.isFinite));
  const sum = allDistances.reduce((total, value) => total + value, 0);

  return {
    oracleCount: oracle.burgs.length,
    localCount: local.burgs.length,
    threshold,
    oracleRecallWithinThreshold:
      oracleDistances.length === 0
        ? 1
        : oracleDistances.filter((value) => value <= threshold).length /
          oracleDistances.length,
    localPrecisionWithinThreshold:
      localDistances.length === 0
        ? 1
        : localDistances.filter((value) => value <= threshold).length /
          localDistances.length,
    meanNearestDistance:
      allDistances.length === 0 ? 0 : sum / allDistances.length,
    medianNearestDistance: computeMedian(allDistances),
  };
};

export const buildLocalParitySnapshot = (
  world: WorldGraphV1,
  config?: GenerationConfig,
): ParitySnapshot => {
  const vertices = toPoints(world.vertexX, world.vertexY);
  const terrainPolygons = collectCellPolygons(
    world.cellVertexOffsets,
    world.cellVertices,
  );
  const regionPolygons = Array.from(world.packToGrid, (gridCellId) => {
    const from = world.cellVertexOffsets[gridCellId] ?? 0;
    const to = world.cellVertexOffsets[gridCellId + 1] ?? from;
    return Array.from(world.cellVertices.slice(from, to));
  });

  const snapshot: ParitySnapshot = {
    kind: "local-world",
    seed: world.seed,
    width: world.width,
    height: world.height,
    gridSpacing: world.gridSpacing,
    terrain: {
      mesh: {
        vertices,
        polygons: terrainPolygons,
      },
      land: copyNumbers(world.cellsFeature),
    },
    regions: {
      vertices,
      polygons: regionPolygons,
      states: Array.from(
        world.packToGrid,
        (gridCellId) => world.cellsState[gridCellId] ?? 0,
      ),
      religions: Array.from(
        world.packToGrid,
        (gridCellId) => world.cellsReligion[gridCellId] ?? 0,
      ),
    },
    burgs: Array.from({ length: world.burgCount }, (_, offset) => {
      const id = offset + 1;
      const cell = world.burgCell[id] ?? 0;
      return {
        id,
        x: world.burgX[id] ?? world.cellsX[cell] ?? 0,
        y: world.burgY[id] ?? world.cellsY[cell] ?? 0,
        cell,
        name: `burg-${id}`,
      };
    }),
    counts: {
      landmasses: world.landmassCount,
      states: world.stateCount,
      religions: world.religionCount,
      burgs: world.burgCount,
    },
  };

  if (config) {
    return { ...snapshot, config };
  }

  return snapshot;
};

export const computeParityReport = (
  oracle: ParitySnapshot,
  local: ParitySnapshot,
  requestedRasterWidth = DEFAULT_RASTER_WIDTH,
): ParityReport => {
  const aspectRatio = oracle.height / oracle.width;
  const rasterWidth = requestedRasterWidth;
  const rasterHeight = Math.max(1, Math.round(rasterWidth * aspectRatio));
  const oracleTerrain = rasterize(
    oracle.terrain.mesh,
    oracle.terrain.land,
    oracle.width,
    oracle.height,
    rasterWidth,
    rasterHeight,
  );
  const localTerrain = rasterize(
    local.terrain.mesh,
    local.terrain.land,
    local.width,
    local.height,
    rasterWidth,
    rasterHeight,
  );
  const oraclePolitics = rasterize(
    { vertices: oracle.regions.vertices, polygons: oracle.regions.polygons },
    oracle.regions.states,
    oracle.width,
    oracle.height,
    rasterWidth,
    rasterHeight,
  );
  const localPolitics = rasterize(
    { vertices: local.regions.vertices, polygons: local.regions.polygons },
    local.regions.states,
    local.width,
    local.height,
    rasterWidth,
    rasterHeight,
  );
  const oracleReligions = rasterize(
    { vertices: oracle.regions.vertices, polygons: oracle.regions.polygons },
    oracle.regions.religions,
    oracle.width,
    oracle.height,
    rasterWidth,
    rasterHeight,
  );
  const localReligions = rasterize(
    { vertices: local.regions.vertices, polygons: local.regions.polygons },
    local.regions.religions,
    local.width,
    local.height,
    rasterWidth,
    rasterHeight,
  );

  const report: ParityReport = {
    oracle: {
      seed: oracle.seed,
      width: oracle.width,
      height: oracle.height,
    },
    local: {
      seed: local.seed,
      width: local.width,
      height: local.height,
    },
    raster: {
      width: rasterWidth,
      height: rasterHeight,
    },
    terrain: computeBinaryIou(oracleTerrain, localTerrain),
    politics: buildRegionMetric(oraclePolitics, localPolitics),
    religions: buildRegionMetric(oracleReligions, localReligions),
    burgs: computeBurgMetric(oracle, local),
    counts: {
      landmasses: {
        oracle: oracle.counts.landmasses,
        local: local.counts.landmasses,
        delta: local.counts.landmasses - oracle.counts.landmasses,
      },
      states: {
        oracle: oracle.counts.states,
        local: local.counts.states,
        delta: local.counts.states - oracle.counts.states,
      },
      religions: {
        oracle: oracle.counts.religions,
        local: local.counts.religions,
        delta: local.counts.religions - oracle.counts.religions,
      },
      burgs: {
        oracle: oracle.counts.burgs,
        local: local.counts.burgs,
        delta: local.counts.burgs - oracle.counts.burgs,
      },
    },
  };

  return {
    ...report,
    oracle: oracle.sourceUrl
      ? { ...report.oracle, sourceUrl: oracle.sourceUrl }
      : report.oracle,
    local: local.config
      ? { ...report.local, config: local.config }
      : report.local,
  };
};
