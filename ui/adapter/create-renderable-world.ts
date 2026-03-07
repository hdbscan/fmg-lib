import type { WorldGraphV1 } from "fmg-lib";
import type {
  RenderBurg,
  RenderCell,
  RenderMarker,
  RenderMilitary,
  RenderProvince,
  RenderReligion,
  RenderRoute,
  RenderState,
  RenderTerrainFeature,
  RenderZone,
  RenderableWorld,
} from "./types";

const readRange = (
  offsets: Uint32Array,
  valuesLength: number,
  index: number,
): readonly [number, number] => {
  const start = offsets[index] ?? 0;
  const end = offsets[index + 1] ?? valuesLength;
  return [start, end];
};

const calcCellPolygon = (world: WorldGraphV1, cellId: number): Float32Array => {
  const [start, end] = readRange(
    world.cellVertexOffsets,
    world.cellVertices.length,
    cellId,
  );

  const pointCount = end - start;
  const polygon = new Float32Array(pointCount * 2);

  for (let cursor = start, writeIndex = 0; cursor < end; cursor += 1) {
    const vertexId = world.cellVertices[cursor] ?? 0;
    polygon[writeIndex] = world.vertexX[vertexId] ?? 0;
    polygon[writeIndex + 1] = world.vertexY[vertexId] ?? 0;
    writeIndex += 2;
  }

  return polygon;
};

const calcBounds = (
  polygon: Float32Array,
): readonly [number, number, number, number] => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < polygon.length; index += 2) {
    const x = polygon[index] ?? 0;
    const y = polygon[index + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX)) {
    return [0, 0, 0, 0];
  }

  return [minX, minY, maxX, maxY];
};

const calcPolygonArea = (polygon: Float32Array): number => {
  if (polygon.length < 6) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < polygon.length; index += 2) {
    const nextIndex = (index + 2) % polygon.length;
    const x0 = polygon[index] ?? 0;
    const y0 = polygon[index + 1] ?? 0;
    const x1 = polygon[nextIndex] ?? 0;
    const y1 = polygon[nextIndex + 1] ?? 0;
    total += x0 * y1 - x1 * y0;
  }

  return Math.abs(total) * 0.5;
};

type TerrainEdgeUse = Readonly<{
  featureId: number;
  fromVertexId: number;
  toVertexId: number;
}>;

const collectTerrainFeatures = (
  world: WorldGraphV1,
): readonly RenderTerrainFeature[] => {
  const edgeUses = new Map<string, TerrainEdgeUse[]>();
  const featureEdges = new Map<number, TerrainEdgeUse[]>();

  const addFeatureEdge = (use: TerrainEdgeUse): void => {
    const edges = featureEdges.get(use.featureId);
    if (edges) {
      edges.push(use);
      return;
    }
    featureEdges.set(use.featureId, [use]);
  };

  for (let packId = 0; packId < world.packCellCount; packId += 1) {
    const featureId = world.packCellsFeatureId[packId] ?? 0;
    const featureType = world.packFeatureType[featureId] ?? 0;
    if (featureId <= 0 || (featureType !== 2 && featureType !== 3)) {
      continue;
    }

    const [start, end] = readRange(
      world.packCellVertexOffsets,
      world.packCellVertices.length,
      packId,
    );

    if (end - start < 3) {
      continue;
    }

    for (let cursor = start; cursor < end; cursor += 1) {
      const fromVertexId = world.packCellVertices[cursor] ?? 0;
      const nextCursor = cursor + 1 < end ? cursor + 1 : start;
      const toVertexId = world.packCellVertices[nextCursor] ?? 0;
      if (fromVertexId === toVertexId) {
        continue;
      }

      const key =
        fromVertexId < toVertexId
          ? `${fromVertexId}:${toVertexId}`
          : `${toVertexId}:${fromVertexId}`;
      const uses = edgeUses.get(key);
      const use: TerrainEdgeUse = { featureId, fromVertexId, toVertexId };
      if (uses) {
        uses.push(use);
      } else {
        edgeUses.set(key, [use]);
      }
    }
  }

  for (const uses of edgeUses.values()) {
    if (uses.length === 1) {
      const [use] = uses;
      if (use) {
        addFeatureEdge(use);
      }
      continue;
    }

    for (const use of uses) {
      if (uses.every((other) => other.featureId === use.featureId)) {
        continue;
      }
      addFeatureEdge(use);
    }
  }

  const terrainFeatures: RenderTerrainFeature[] = [];

  for (const [featureId, edges] of featureEdges) {
    const featureType = world.packFeatureType[featureId] ?? 0;
    if (featureType !== 2 && featureType !== 3) {
      continue;
    }

    const outgoing = new Map<number, number[]>();
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
      const edge = edges[edgeIndex];
      if (!edge) {
        continue;
      }
      const group = outgoing.get(edge.fromVertexId);
      if (group) {
        group.push(edgeIndex);
      } else {
        outgoing.set(edge.fromVertexId, [edgeIndex]);
      }
    }

    const unused = new Set<number>(edges.map((_, index) => index));
    const rings: Float32Array[] = [];
    let area = 0;

    while (unused.size > 0) {
      const startEdgeIndex = unused.values().next().value;
      if (typeof startEdgeIndex !== "number") {
        break;
      }
      const startEdge = edges[startEdgeIndex];
      if (!startEdge) {
        unused.delete(startEdgeIndex);
        continue;
      }

      const vertexIds = [startEdge.fromVertexId];
      let currentVertexId = startEdge.toVertexId;
      const startVertexId = startEdge.fromVertexId;
      unused.delete(startEdgeIndex);

      while (currentVertexId !== startVertexId) {
        vertexIds.push(currentVertexId);
        const nextEdgeIndex = (outgoing.get(currentVertexId) ?? []).find(
          (candidate) => unused.has(candidate),
        );
        if (nextEdgeIndex == null) {
          vertexIds.length = 0;
          break;
        }

        const nextEdge = edges[nextEdgeIndex];
        unused.delete(nextEdgeIndex);
        currentVertexId = nextEdge?.toVertexId ?? startVertexId;
      }

      if (vertexIds.length < 3) {
        continue;
      }

      const polygon = new Float32Array(vertexIds.length * 2);
      for (let index = 0; index < vertexIds.length; index += 1) {
        const vertexId = vertexIds[index] ?? 0;
        polygon[index * 2] = world.packVertexX[vertexId] ?? 0;
        polygon[index * 2 + 1] = world.packVertexY[vertexId] ?? 0;
      }
      rings.push(polygon);
      area += calcPolygonArea(polygon);
    }

    terrainFeatures.push({
      id: featureId,
      type: featureType,
      rings,
      area,
      height: world.packH[world.packFeatureFirstCell[featureId] ?? 0] ?? 0,
    });
  }

  terrainFeatures.sort((left, right) => right.area - left.area);
  return terrainFeatures;
};

const collectStates = (world: WorldGraphV1): readonly RenderState[] => {
  const states: RenderState[] = [];

  for (let stateId = 1; stateId <= world.stateCount; stateId += 1) {
    const centerBurgId = world.stateCenterBurg[stateId] ?? 0;
    const centerCell =
      centerBurgId > 0
        ? (world.burgCell[centerBurgId] ?? 0)
        : (world.provinceCenterCell[stateId] ?? 0);

    states.push({
      id: stateId,
      centerCell,
      centerX: world.cellsX[centerCell] ?? 0,
      centerY: world.cellsY[centerCell] ?? 0,
      culture: world.stateCulture[stateId] ?? 0,
      form: world.stateForm[stateId] ?? 0,
      cells: world.stateCells[stateId] ?? 0,
    });
  }

  return states;
};

const createStateCenterMap = (
  states: readonly RenderState[],
): ReadonlyMap<number, readonly [number, number]> => {
  const map = new Map<number, readonly [number, number]>();

  for (const state of states) {
    map.set(state.id, [state.centerX, state.centerY]);
  }

  return map;
};

const collectRoutes = (
  world: WorldGraphV1,
  stateCenters: ReadonlyMap<number, readonly [number, number]>,
): readonly RenderRoute[] => {
  const routes: RenderRoute[] = [];

  for (let routeId = 1; routeId <= world.routeCount; routeId += 1) {
    const fromState = world.routeFromState[routeId] ?? 0;
    const toState = world.routeToState[routeId] ?? 0;
    const fromCenter = stateCenters.get(fromState) ?? [0, 0];
    const toCenter = stateCenters.get(toState) ?? [0, 0];

    routes.push({
      id: routeId,
      fromState,
      toState,
      kind: world.routeKind[routeId] ?? 0,
      weight: world.routeWeight[routeId] ?? 0,
      fromX: fromCenter[0],
      fromY: fromCenter[1],
      toX: toCenter[0],
      toY: toCenter[1],
    });
  }

  return routes;
};

const collectProvinces = (world: WorldGraphV1): readonly RenderProvince[] => {
  const provinces: RenderProvince[] = [];

  for (let provinceId = 1; provinceId <= world.provinceCount; provinceId += 1) {
    provinces.push({
      id: provinceId,
      state: world.provinceState[provinceId] ?? 0,
      centerCell: world.provinceCenterCell[provinceId] ?? 0,
      cells: world.provinceCells[provinceId] ?? 0,
    });
  }

  return provinces;
};

const collectReligions = (world: WorldGraphV1): readonly RenderReligion[] => {
  const religions: RenderReligion[] = [];

  for (let religionId = 1; religionId <= world.religionCount; religionId += 1) {
    religions.push({
      id: religionId,
      seedCell: world.religionSeedCell[religionId] ?? 0,
      type: world.religionType[religionId] ?? 0,
      size: world.religionSize[religionId] ?? 0,
    });
  }

  return religions;
};

const collectBurgs = (world: WorldGraphV1): readonly RenderBurg[] => {
  const burgs: RenderBurg[] = [];

  for (let burgId = 1; burgId <= world.burgCount; burgId += 1) {
    const cell = world.burgCell[burgId] ?? 0;
    burgs.push({
      id: burgId,
      cell,
      x: world.burgX[burgId] ?? world.cellsX[cell] ?? 0,
      y: world.burgY[burgId] ?? world.cellsY[cell] ?? 0,
      population: world.burgPopulation[burgId] ?? 0,
      culture: world.burgCulture[burgId] ?? 0,
      capital: world.burgCapital[burgId] ?? 0,
      port: world.burgPort[burgId] ?? 0,
    });
  }

  return burgs;
};

const collectMilitary = (world: WorldGraphV1): readonly RenderMilitary[] => {
  const military: RenderMilitary[] = [];

  for (let militaryId = 1; militaryId <= world.militaryCount; militaryId += 1) {
    const cell = world.militaryCell[militaryId] ?? 0;
    military.push({
      id: militaryId,
      cell,
      x: world.cellsX[cell] ?? 0,
      y: world.cellsY[cell] ?? 0,
      state: world.militaryState[militaryId] ?? 0,
      type: world.militaryType[militaryId] ?? 0,
      strength: world.militaryStrength[militaryId] ?? 0,
    });
  }

  return military;
};

const collectMarkers = (world: WorldGraphV1): readonly RenderMarker[] => {
  const markers: RenderMarker[] = [];

  for (let markerId = 1; markerId <= world.markerCount; markerId += 1) {
    const cell = world.markerCell[markerId] ?? 0;
    markers.push({
      id: markerId,
      cell,
      x: world.cellsX[cell] ?? 0,
      y: world.cellsY[cell] ?? 0,
      type: world.markerType[markerId] ?? 0,
      strength: world.markerStrength[markerId] ?? 0,
    });
  }

  return markers;
};

const collectZones = (world: WorldGraphV1): readonly RenderZone[] => {
  const zones: RenderZone[] = [];

  for (let zoneId = 1; zoneId <= world.zoneCount; zoneId += 1) {
    zones.push({
      id: zoneId,
      seedCell: world.zoneSeedCell[zoneId] ?? 0,
      type: world.zoneType[zoneId] ?? 0,
      cells: world.zoneCells[zoneId] ?? 0,
    });
  }

  return zones;
};

const calcFocusBounds = (
  cells: readonly RenderCell[],
  landCellIds: readonly number[],
  worldWidth: number,
  worldHeight: number,
): RenderableWorld["focusBounds"] => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const focusCellIds =
    landCellIds.length > 0 ? landCellIds : cells.map((cell) => cell.id);

  for (const cellId of focusCellIds) {
    const cell = cells[cellId];
    if (!cell) {
      continue;
    }

    minX = Math.min(minX, cell.bboxMinX);
    minY = Math.min(minY, cell.bboxMinY);
    maxX = Math.max(maxX, cell.bboxMaxX);
    maxY = Math.max(maxY, cell.bboxMaxY);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      minY: 0,
      maxX: worldWidth,
      maxY: worldHeight,
    };
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const padX = Math.max(20, spanX * 0.05);
  const padY = Math.max(20, spanY * 0.05);

  return {
    minX: Math.max(0, minX - padX),
    minY: Math.max(0, minY - padY),
    maxX: Math.min(worldWidth, maxX + padX),
    maxY: Math.min(worldHeight, maxY + padY),
  };
};

export const buildRenderableWorld = (world: WorldGraphV1): RenderableWorld => {
  const cells: RenderCell[] = [];
  const landCellIds: number[] = [];
  const waterCellIds: number[] = [];

  for (let cellId = 0; cellId < world.cellCount; cellId += 1) {
    const polygon = calcCellPolygon(world, cellId);
    const [minX, minY, maxX, maxY] = calcBounds(polygon);
    const [neighborStart, neighborEnd] = readRange(
      world.cellNeighborOffsets,
      world.cellNeighbors.length,
      cellId,
    );

    const neighbors = world.cellNeighbors.slice(neighborStart, neighborEnd);
    const feature = world.cellsFeature[cellId] ?? 0;

    if (feature === 1) {
      landCellIds.push(cellId);
    } else {
      waterCellIds.push(cellId);
    }

    cells.push({
      id: cellId,
      centerX: world.cellsX[cellId] ?? 0,
      centerY: world.cellsY[cellId] ?? 0,
      polygon,
      bboxMinX: minX,
      bboxMinY: minY,
      bboxMaxX: maxX,
      bboxMaxY: maxY,
      neighbors,
      feature,
      featureId: world.cellsFeatureId[cellId] ?? 0,
      biome: world.cellsBiome[cellId] ?? 0,
      river: world.cellsRiver[cellId] ?? 0,
      state: world.cellsState[cellId] ?? 0,
      province: world.cellsProvince[cellId] ?? 0,
      religion: world.cellsReligion[cellId] ?? 0,
      culture: world.cellsCulture[cellId] ?? 0,
      zone: world.cellsZone[cellId] ?? 0,
      burg: world.cellsBurg[cellId] ?? 0,
      military: world.cellsMilitary[cellId] ?? 0,
    });
  }

  const states = collectStates(world);
  const stateCenters = createStateCenterMap(states);

  return {
    source: world,
    width: world.width,
    height: world.height,
    focusBounds: calcFocusBounds(cells, landCellIds, world.width, world.height),
    cells,
    landCellIds: Uint32Array.from(landCellIds),
    waterCellIds: Uint32Array.from(waterCellIds),
    states,
    routes: collectRoutes(world, stateCenters),
    provinces: collectProvinces(world),
    religions: collectReligions(world),
    military: collectMilitary(world),
    markers: collectMarkers(world),
    zones: collectZones(world),
    burgs: collectBurgs(world),
    terrainFeatures: collectTerrainFeatures(world),
  };
};
