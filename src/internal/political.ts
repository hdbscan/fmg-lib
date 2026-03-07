import type { GenerationContext } from "../types";
import { createAlea } from "./random";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const rn = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const gauss = (
  random: () => number,
  mean = 0,
  deviation = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  rounds = 1,
): number => {
  let total = 0;
  for (let round = 0; round < rounds; round += 1) {
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = random();
    while (v <= Number.EPSILON) v = random();
    total += Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return clamp(mean + (total / rounds) * deviation, min, max);
};

const randInt = (random: () => number, min: number, max: number): number =>
  Math.floor(random() * (max - min + 1)) + min;

const forEachNeighbor = (
  cellId: number,
  offsets: Uint32Array,
  neighbors: Uint32Array,
  callback: (neighborId: number) => void,
): void => {
  const from = offsets[cellId] ?? 0;
  const to = offsets[cellId + 1] ?? from;
  for (let index = from; index < to; index += 1) {
    const neighborId = neighbors[index];
    if (neighborId !== undefined) callback(neighborId);
  }
};

type StateType =
  | "Generic"
  | "Naval"
  | "Lake"
  | "Highland"
  | "River"
  | "Nomadic"
  | "Hunting";

type ReligionExpansionMode = "culture" | "state" | "global";

const RELIGION_BIOME_PASSAGE_COST = [
  0, 20, 80, 70, 60, 40, 30, 20, 30,
] as const;

type QueueEntry = {
  cost: number;
  id: number;
  owner: number;
  extra: number;
};

const compareQueueEntries = (left: QueueEntry, right: QueueEntry): number => {
  if (left.cost !== right.cost) return left.cost - right.cost;
  if (left.owner !== right.owner) return left.owner - right.owner;
  return left.id - right.id;
};

const pushQueue = (heap: QueueEntry[], entry: QueueEntry): void => {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = heap[parentIndex];
    if (!parent || compareQueueEntries(parent, entry) <= 0) break;
    heap[index] = parent;
    index = parentIndex;
  }
  heap[index] = entry;
};

const popQueue = (heap: QueueEntry[]): QueueEntry | undefined => {
  const first = heap[0];
  const last = heap.pop();
  if (!first) return undefined;
  if (!last || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallest = index;
    const current = smallest === index ? last : (heap[smallest] ?? last);
    const left = heap[leftIndex];
    if (left && compareQueueEntries(left, current) < 0) smallest = leftIndex;
    const smallestValue = smallest === index ? last : (heap[smallest] ?? last);
    const right = heap[rightIndex];
    if (right && compareQueueEntries(right, smallestValue) < 0)
      smallest = rightIndex;
    if (smallest === index) break;
    heap[index] = heap[smallest] as QueueEntry;
    index = smallest;
  }
  heap[index] = last;
  return first;
};

export const computeSuitability = (
  context: GenerationContext,
): Float64Array => {
  const {
    packCellCount,
    packToGrid,
    packArea,
    packCoast,
    packHarbor,
    cellsFlow,
    cellsPrec,
    cellsTemp,
    cellsBiome,
    cellsH,
  } = context.world;
  const suitability = new Float64Array(packCellCount);
  let totalArea = 0;
  for (const area of packArea) totalArea += area;
  const averageArea = totalArea / Math.max(packCellCount, 1);

  for (let packId = 0; packId < packCellCount; packId += 1) {
    if (!isPoliticalPackCell(context, packId)) {
      suitability[packId] = 0;
      continue;
    }

    const cellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    const precipitation = cellsPrec[cellId] ?? 0;
    const temperature = cellsTemp[cellId] ?? 0;
    const height = cellsH[cellId] ?? 0;
    const area = packArea[packId] ?? 0;
    const coast = packCoast[packId] ?? 0;
    const harbor = packHarbor[packId] ?? 0;
    const biome = cellsBiome[cellId] ?? 0;

    const tempScore =
      temperature <= -10 ? 0 : temperature <= 0 ? 6 : 12 + temperature * 0.9;
    const moistureScore = precipitation / 5;
    const riverScore = Math.min(flow / 18, 65);
    const coastScore = coast > 0 ? 10 : 0;
    const harborScore = harbor > 0 ? 16 + harbor * 6 : 0;
    const areaScore =
      averageArea > 0 ? Math.min((area / averageArea) * 9, 16) : 0;
    const heightPenalty = height >= 67 ? 45 : height >= 44 ? 10 : 0;
    const biomePenalty = [1, 2, 3, 4].includes(biome)
      ? 8
      : biome >= 9 && biome <= 11
        ? 10
        : 0;

    suitability[packId] = Math.max(
      rn(
        tempScore +
          moistureScore +
          riverScore +
          coastScore +
          harborScore +
          areaScore -
          heightPenalty -
          biomePenalty,
        2,
      ),
      0,
    );
  }

  return suitability;
};

const normalize = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return value >= max ? 1 : 0;
  return clamp((value - min) / (max - min), 0, 1);
};

const biomeHabitability = [0, 4, 10, 22, 30, 100, 80, 10, 22] as const;

export const computePoliticalSuitability = (
  context: GenerationContext,
): Int16Array => {
  const legacySuitability = computeSuitability(context);
  const {
    packCellCount,
    packToGrid,
    packArea,
    packCoast,
    packHarbor,
    cellsFlow,
    cellsPrec,
    cellsTemp,
    cellsBiome,
    cellsH,
    cellsRiver,
    cellsWaterbody,
    waterbodyType,
  } = context.world;
  const suitability = new Int16Array(packCellCount);
  const positiveFlows: number[] = [];
  for (let packId = 0; packId < packCellCount; packId += 1) {
    if (!isPoliticalPackCell(context, packId)) continue;
    const cellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    if (flow > 0) positiveFlows.push(flow);
  }

  positiveFlows.sort((left, right) => left - right);
  const flowMidpoint = Math.floor(positiveFlows.length / 2);
  const meanFlow =
    positiveFlows.length === 0
      ? 0
      : positiveFlows.length % 2 === 0
        ? ((positiveFlows[flowMidpoint - 1] ?? 0) +
            (positiveFlows[flowMidpoint] ?? 0)) /
          2
        : (positiveFlows[flowMidpoint] ?? 0);
  let maxFlow = 0;
  for (const flow of positiveFlows) {
    if (flow > maxFlow) maxFlow = flow;
  }
  for (let packId = 0; packId < packCellCount; packId += 1) {
    if (!isPoliticalPackCell(context, packId)) {
      suitability[packId] = 0;
      continue;
    }

    const cellId = packToGrid[packId] ?? 0;
    const flow = cellsFlow[cellId] ?? 0;
    const precipitation = cellsPrec[cellId] ?? 0;
    const temperature = cellsTemp[cellId] ?? 0;
    const height = cellsH[cellId] ?? 0;
    const coast = packCoast[packId] ?? 0;
    const harbor = packHarbor[packId] ?? 0;
    const haven = context.world.packHaven[packId] ?? -1;
    const biome = cellsBiome[cellId] ?? 0;
    const waterbodyId = haven >= 0 ? (cellsWaterbody[haven] ?? 0) : 0;
    const adjacentWaterType = waterbodyType[waterbodyId] ?? 0;

    let score = biomeHabitability[biome] ?? 0;
    if (score <= 0) {
      suitability[packId] = 0;
      continue;
    }

    if (meanFlow > 0 && maxFlow > meanFlow) {
      score += normalize(flow, meanFlow, maxFlow) * 250;
    }

    score -= (height - 50) / 5;

    if (coast === 1 && haven >= 0) {
      if ((cellsRiver[cellId] ?? 0) > 0) score += 15;
      if (adjacentWaterType === 2) {
        score += (cellsTemp[haven] ?? temperature) <= 0 ? 1 : 30;
      } else if (adjacentWaterType === 1) {
        score += 5;
        if (harbor === 1) score += 20;
      }
    }

    const aridityPenalty = precipitation < 20 ? 2 : 0;
    const coldPenalty = temperature <= -10 ? 2 : 0;

    const rankedScore = Math.max(
      Math.trunc((score - aridityPenalty - coldPenalty) / 5),
      0,
    );
    suitability[packId] = Math.max(
      Math.trunc((legacySuitability[packId] ?? 0) * 0.75 + rankedScore * 0.25),
      0,
    );
  }

  return suitability;
};

const getTargetStates = (
  context: GenerationContext,
  populatedCount: number,
): number => {
  if (context.config.statesCount !== null) {
    let number = context.config.statesCount;
    if (populatedCount < number * 10) number = Math.floor(populatedCount / 10);
    return clamp(number, 1, 64);
  }

  let number = Math.round(
    Math.max(
      context.config.culturesCount * 1.6,
      Math.sqrt(populatedCount) / 3.5,
      6,
    ),
  );
  if (populatedCount < number * 10) number = Math.floor(populatedCount / 10);
  return clamp(number, 1, 64);
};

const getTargetTowns = (
  context: GenerationContext,
  populatedCount: number,
): number => {
  if (context.config.townsCount !== null) {
    if (context.config.townsCount === 1000) {
      const raw = rn(
        populatedCount / 5 / (context.world.cellCount / 10000) ** 0.8,
      );
      return clamp(raw, 0, populatedCount);
    }
    return clamp(context.config.townsCount, 0, populatedCount);
  }

  const raw = rn(populatedCount / 5 / (context.world.cellCount / 10000) ** 0.8);
  return clamp(raw, 0, populatedCount);
};

const hasBurgNear = (
  context: GenerationContext,
  selectedPackIds: readonly number[],
  packId: number,
  spacing: number,
): boolean => {
  const x = context.world.packX[packId] ?? 0;
  const y = context.world.packY[packId] ?? 0;
  const spacingSq = spacing * spacing;
  for (const selectedPackId of selectedPackIds) {
    const dx = (context.world.packX[selectedPackId] ?? 0) - x;
    const dy = (context.world.packY[selectedPackId] ?? 0) - y;
    if (dx * dx + dy * dy <= spacingSq) return true;
  }
  return false;
};

const sortPackIdsByScore = (
  packIds: readonly number[],
  getScore: (packId: number) => number,
): number[] =>
  packIds
    .map((packId) => ({ packId, score: getScore(packId) }))
    .sort(
      (left, right) => right.score - left.score || left.packId - right.packId,
    )
    .map(({ packId }) => packId);

const isPrimaryPackCell = (
  context: GenerationContext,
  packId: number,
): boolean => {
  const gridCellId = context.world.packToGrid[packId] ?? 0;
  return (
    Math.abs(
      (context.world.packX[packId] ?? 0) -
        (context.world.cellsX[gridCellId] ?? 0),
    ) < 1e-6 &&
    Math.abs(
      (context.world.packY[packId] ?? 0) -
        (context.world.cellsY[gridCellId] ?? 0),
    ) < 1e-6
  );
};

export const isPoliticalPackCell = (
  context: GenerationContext,
  packId: number,
): boolean => {
  const gridCellId = context.world.packToGrid[packId] ?? 0;
  return (
    (context.world.cellsFeature[gridCellId] ?? 0) === 1 &&
    isPrimaryPackCell(context, packId)
  );
};

const getSharedEdgePoint = (
  context: GenerationContext,
  landCellId: number,
  waterCellId: number,
): readonly [number, number] | null => {
  const { cellVertexOffsets, cellVertices, vertexX, vertexY, cellsX, cellsY } =
    context.world;
  const landFrom = cellVertexOffsets[landCellId] ?? 0;
  const landTo = cellVertexOffsets[landCellId + 1] ?? landFrom;
  const waterFrom = cellVertexOffsets[waterCellId] ?? 0;
  const waterTo = cellVertexOffsets[waterCellId + 1] ?? waterFrom;
  const waterVertices = new Set<number>();
  for (let index = waterFrom; index < waterTo; index += 1) {
    waterVertices.add(cellVertices[index] ?? 0);
  }
  const shared: number[] = [];
  for (let index = landFrom; index < landTo; index += 1) {
    const vertexId = cellVertices[index] ?? 0;
    if (waterVertices.has(vertexId)) shared.push(vertexId);
  }
  if (shared.length < 2) return null;
  const firstShared = shared[0] ?? 0;
  const secondShared = shared[1] ?? 0;
  const xEdge =
    ((vertexX[firstShared] ?? 0) + (vertexX[secondShared] ?? 0)) / 2;
  const yEdge =
    ((vertexY[firstShared] ?? 0) + (vertexY[secondShared] ?? 0)) / 2;
  const x0 = cellsX[landCellId] ?? 0;
  const y0 = cellsY[landCellId] ?? 0;
  return [rn(x0 + 0.95 * (xEdge - x0), 2), rn(y0 + 0.95 * (yEdge - y0), 2)];
};

const getBurgType = (
  context: GenerationContext,
  cellId: number,
  port: number,
): StateType => {
  const {
    packToGrid,
    gridToPack,
    packHaven,
    cellsWaterbody,
    waterbodyType,
    waterbodySize,
    cellsH,
    cellsRiver,
    cellsFlow,
    cellsBiome,
  } = context.world;
  if (port) return "Naval";
  const packId = gridToPack[cellId] ?? -1;
  const havenCell = packId >= 0 ? (packHaven[packId] ?? -1) : -1;
  if (havenCell >= 0) {
    const waterbodyId = cellsWaterbody[havenCell] ?? 0;
    if (
      (waterbodyType[waterbodyId] ?? 0) === 2 &&
      (waterbodySize[waterbodyId] ?? 0) > 0
    ) {
      return "Lake";
    }
  }
  if ((cellsH[cellId] ?? 0) > 60) return "Highland";
  if ((cellsRiver[cellId] ?? 0) > 0 && (cellsFlow[cellId] ?? 0) >= 100)
    return "River";
  const biome = cellsBiome[cellId] ?? 0;
  if ([1, 2, 3, 4].includes(biome)) return "Nomadic";
  if (biome > 4 && biome < 10) return "Hunting";
  return "Generic";
};

const resetBurgs = (context: GenerationContext): void => {
  context.world.burgCount = 0;
  context.world.burgCell = new Uint32Array(1);
  context.world.burgX = new Float32Array(1);
  context.world.burgY = new Float32Array(1);
  context.world.burgPopulation = new Uint16Array(1);
  context.world.burgCapital = new Uint8Array(1);
  context.world.burgPort = new Uint8Array(1);
  context.world.burgCulture = new Uint16Array(1);
};

export const runBurgGenerationStage = (context: GenerationContext): void => {
  const {
    cellsBurg,
    cellsCulture,
    packCellCount,
    packToGrid,
    gridToPack,
    packX,
    packY,
    packHaven,
    packHarbor,
    cellsWaterbody,
    waterbodySize,
    waterbodyType,
    cellsTemp,
    cellsRiver,
    cellsFlow,
  } = context.world;
  cellsBurg.fill(0);
  if (packCellCount <= 0) {
    resetBurgs(context);
    return;
  }

  const suitability = computePoliticalSuitability(context);
  const populatedPackIds = Array.from(
    { length: packCellCount },
    (_, packId) => packId,
  ).filter(
    (packId) =>
      isPoliticalPackCell(context, packId) &&
      (suitability[packId] ?? 0) > 0 &&
      (cellsCulture[packToGrid[packId] ?? 0] ?? 0) > 0,
  );
  if (populatedPackIds.length === 0) {
    resetBurgs(context);
    return;
  }

  const capitalsNumber = getTargetStates(context, populatedPackIds.length);
  let capitals: number[] = [];
  let spacing =
    (context.config.width + context.config.height) / 2 / capitalsNumber;
  const capitalOrder = sortPackIdsByScore(
    populatedPackIds,
    (packId) => (suitability[packId] ?? 0) * (0.5 + context.random() * 0.5),
  );

  while (capitals.length < capitalsNumber && spacing > 1) {
    capitals = [];
    for (const packId of capitalOrder) {
      if (!hasBurgNear(context, capitals, packId, spacing))
        capitals.push(packId);
      if (capitals.length >= capitalsNumber) break;
    }
    if (capitals.length < capitalsNumber) spacing /= 1.2;
  }

  const townsNumber = getTargetTowns(context, populatedPackIds.length);
  const townOrder = sortPackIdsByScore(
    populatedPackIds,
    (packId) =>
      (suitability[packId] ?? 0) * gauss(context.random, 1, 3, 0, 20, 3),
  );

  const burgPackIds = capitals.slice();
  let townSpacing =
    (context.config.width + context.config.height) /
    150 /
    (Math.max(townsNumber, 1) ** 0.7 / 66);
  while (
    burgPackIds.length - capitals.length < townsNumber &&
    townSpacing > 1
  ) {
    for (const packId of townOrder) {
      if (burgPackIds.length - capitals.length >= townsNumber) break;
      const cellId = packToGrid[packId] ?? 0;
      if ((cellsBurg[cellId] ?? 0) > 0) continue;
      const minSpacing = townSpacing * gauss(context.random, 1, 0.3, 0.2, 2, 2);
      if (hasBurgNear(context, burgPackIds, packId, minSpacing)) continue;
      burgPackIds.push(packId);
      cellsBurg[cellId] = burgPackIds.length;
    }
    townSpacing *= 0.5;
  }

  const burgCount = burgPackIds.length;
  const burgCell = new Uint32Array(burgCount + 1);
  const burgX = new Float32Array(burgCount + 1);
  const burgY = new Float32Array(burgCount + 1);
  const burgCapital = new Uint8Array(burgCount + 1);
  const burgPort = new Uint8Array(burgCount + 1);
  const burgCulture = new Uint16Array(burgCount + 1);
  const portCandidates = new Map<number, number[]>();

  cellsBurg.fill(0);
  for (let index = 0; index < burgCount; index += 1) {
    const burgId = index + 1;
    const packId = burgPackIds[index] ?? 0;
    const cellId = packToGrid[packId] ?? 0;
    const capital = index < capitals.length ? 1 : 0;
    const harbor = packHarbor[packId] ?? 0;
    const haven = packHaven[packId] ?? -1;
    const waterbodyId = haven >= 0 ? (cellsWaterbody[haven] ?? 0) : 0;
    const isFrozen = haven >= 0 ? (cellsTemp[haven] ?? 0) <= 0 : false;
    const isMulticell = (waterbodySize[waterbodyId] ?? 0) > 1;
    const isHarbor = (harbor > 0 && capital === 1) || harbor === 1;
    const isPortCandidate =
      waterbodyId > 0 &&
      (waterbodyType[waterbodyId] ?? 0) > 0 &&
      isMulticell &&
      isHarbor &&
      !isFrozen;

    cellsBurg[cellId] = burgId;
    burgCell[burgId] = cellId;
    burgX[burgId] = rn(packX[packId] ?? 0, 2);
    burgY[burgId] = rn(packY[packId] ?? 0, 2);
    burgCapital[burgId] = capital;
    burgPort[burgId] = 0;
    burgCulture[burgId] = cellsCulture[cellId] ?? 0;

    if (isPortCandidate) {
      const candidates = portCandidates.get(waterbodyId);
      if (candidates) {
        candidates.push(burgId);
      } else {
        portCandidates.set(waterbodyId, [burgId]);
      }
    } else if ((cellsRiver[cellId] ?? 0) > 0) {
      const shift = Math.min((cellsFlow[cellId] ?? 0) / 150, 1);
      burgX[burgId] = rn(burgX[burgId] + (cellId % 2 ? shift : -shift), 2);
      burgY[burgId] = rn(
        burgY[burgId] + ((cellsRiver[cellId] ?? 0) % 2 ? shift : -shift),
        2,
      );
    }
  }

  for (const burgIds of portCandidates.values()) {
    if (burgIds.length < 2) continue;

    for (const burgId of burgIds) {
      const cellId = burgCell[burgId] ?? 0;
      const packId = gridToPack[cellId] ?? -1;
      const haven = packId >= 0 ? (packHaven[packId] ?? -1) : -1;
      if (haven < 0) continue;

      burgPort[burgId] = 1;
      const edgePoint = getSharedEdgePoint(context, cellId, haven);
      if (!edgePoint) continue;
      burgX[burgId] = edgePoint[0];
      burgY[burgId] = edgePoint[1];
    }
  }

  context.world.burgCount = burgCount;
  context.world.burgCell = burgCell;
  context.world.burgX = burgX;
  context.world.burgY = burgY;
  context.world.burgPopulation = new Uint16Array(burgCount + 1);
  context.world.burgCapital = burgCapital;
  context.world.burgPort = burgPort;
  context.world.burgCulture = burgCulture;
};

export const runBurgSpecificationStage = (context: GenerationContext): void => {
  const { burgCount, burgCell, burgCapital, burgPort, cellsRiver, gridToPack } =
    context.world;

  if (burgCount <= 0) {
    context.world.burgPopulation = new Uint16Array(1);
    return;
  }

  const suitability = computePoliticalSuitability(context);
  const burgPopulation = new Uint16Array(burgCount + 1);

  for (let burgId = 1; burgId <= burgCount; burgId += 1) {
    const cellId = burgCell[burgId] ?? 0;
    const packId = gridToPack[cellId] ?? -1;
    const suitabilityScore = packId >= 0 ? (suitability[packId] ?? 0) : 0;
    const capital = burgCapital[burgId] ?? 0;
    const port = burgPort[burgId] ?? 0;
    const basePopulation = suitabilityScore / 5;
    let population = basePopulation * (capital ? 1.5 : 1);
    if (port > 0) population *= 1.2;
    if ((cellsRiver[cellId] ?? 0) > 0) population *= 1.1;
    population *= gauss(context.random, 1, 1, 0.25, 4, 5);
    population += (burgId % 100) / 1000;

    burgPopulation[burgId] = clamp(
      Math.round(Math.max(population, 1) * 10),
      1,
      65535,
    );
  }

  context.world.burgPopulation = burgPopulation;
};

const getBiomeCost = (
  nativeBiome: number,
  biome: number,
  type: StateType,
): number => {
  if (nativeBiome === biome) return 10;
  if (type === "Hunting")
    return (
      ([0, 20, 80, 70, 60, 40, 30, 20, 30, 60, 80, 100, 50][biome] ?? 50) * 2
    );
  if (type === "Nomadic" && biome > 4 && biome < 10)
    return (
      ([0, 20, 80, 70, 60, 40, 30, 20, 30, 60, 80, 100, 50][biome] ?? 50) * 3
    );
  return [0, 20, 80, 70, 60, 40, 30, 20, 30, 60, 80, 100, 50][biome] ?? 50;
};

const getHeightCost = (
  waterbodyType: number,
  height: number,
  type: StateType,
): number => {
  if (type === "Lake" && waterbodyType === 2) return 10;
  if (type === "Naval" && height < 20) return 300;
  if (type === "Nomadic" && height < 20) return 10000;
  if (height < 20) return 1000;
  if (type === "Highland" && height < 62) return 1100;
  if (type === "Highland") return 0;
  if (height >= 67) return 2200;
  if (height >= 44) return 300;
  return 0;
};

const getRiverCost = (river: number, flux: number, type: StateType): number => {
  if (type === "River") return river ? 0 : 100;
  if (!river) return 0;
  return clamp(flux / 10, 20, 100);
};

const getTypeCost = (coast: number, type: StateType): number => {
  if (coast === 1)
    return type === "Naval" || type === "Lake"
      ? 0
      : type === "Nomadic"
        ? 60
        : 20;
  if (coast === 2) return type === "Naval" || type === "Nomadic" ? 30 : 0;
  if (coast > 2) return type === "Naval" || type === "Lake" ? 100 : 0;
  return 0;
};

const getReligionRouteKey = (stateA: number, stateB: number): number => {
  const from = Math.min(stateA, stateB);
  const to = Math.max(stateA, stateB);
  return from * 65536 + to;
};

const buildReligionRouteStateSet = (
  context: GenerationContext,
): ReadonlySet<number> => {
  const routeKeys = new Set<number>();
  const { routeCount, routeFromState, routeToState } = context.world;
  for (let routeId = 1; routeId <= routeCount; routeId += 1) {
    const from = routeFromState[routeId] ?? 0;
    const to = routeToState[routeId] ?? 0;
    if (from <= 0 || to <= 0 || from === to) continue;
    routeKeys.add(getReligionRouteKey(from, to));
  }
  return routeKeys;
};

const getReligionPassageCost = (
  context: GenerationContext,
  routeStateKeys: ReadonlySet<number>,
  currentCellId: number,
  nextCellId: number,
): number => {
  const { cellsFeature, cellsBiome, cellsBurg, cellsState } = context.world;

  const currentIsWater = (cellsFeature[currentCellId] ?? 0) !== 1;
  if (currentIsWater) {
    return 500;
  }

  const biomePassageCost =
    RELIGION_BIOME_PASSAGE_COST[cellsBiome[nextCellId] ?? 0] ?? 30;
  const currentState = cellsState[currentCellId] ?? 0;
  const nextState = cellsState[nextCellId] ?? 0;
  const hasRouteProxy =
    (cellsBurg[currentCellId] ?? 0) > 0 ||
    (cellsBurg[nextCellId] ?? 0) > 0 ||
    (currentState > 0 &&
      nextState > 0 &&
      routeStateKeys.has(getReligionRouteKey(currentState, nextState)));

  if (!hasRouteProxy) return biomePassageCost;
  return Math.max(1, biomePassageCost / 3);
};

export const runStatesStage = (context: GenerationContext): void => {
  const {
    cellsState,
    cellsCulture,
    cellsH,
    cellsBiome,
    cellsRiver,
    cellsFlow,
    cellsCoast,
    cellsWaterbody,
    waterbodyType,
    cultureSeedCell,
    burgCount,
    burgCell,
    burgCapital,
    burgCulture,
    burgPort,
    packCellCount,
    packToGrid,
    gridToPack,
    packNeighborOffsets,
    packNeighbors,
  } = context.world;
  cellsState.fill(0);
  const capitalBurgIds = Array.from(
    { length: burgCount },
    (_, index) => index + 1,
  ).filter((burgId) => (burgCapital[burgId] ?? 0) === 1);
  if (capitalBurgIds.length === 0) {
    context.world.stateCount = 0;
    context.world.stateCenterBurg = new Uint16Array(1);
    context.world.stateCulture = new Uint16Array(1);
    context.world.stateForm = new Uint8Array(1);
    context.world.stateCells = new Uint32Array(1);
    return;
  }

  const suitability = computePoliticalSuitability(context);
  const activePackCount = suitability.reduce(
    (sum, value) => sum + (value > 0 ? 1 : 0),
    0,
  );
  const stateCount = capitalBurgIds.length;
  const stateCenterBurg = new Uint16Array(stateCount + 1);
  const stateCulture = new Uint16Array(stateCount + 1);
  const stateForm = new Uint8Array(stateCount + 1);
  const stateCells = new Uint32Array(stateCount + 1);
  const stateExpansionism = new Float64Array(stateCount + 1);
  const stateType: StateType[] = ["Generic"];
  const stateNativeBiome = new Uint8Array(stateCount + 1);
  const packState = new Uint16Array(packCellCount);
  const cost = new Float64Array(packCellCount);
  cost.fill(Number.POSITIVE_INFINITY);
  const queue: QueueEntry[] = [];
  const growthRate =
    (Math.max(activePackCount, 1) / 2) *
    context.config.hiddenControls.growthRate;

  for (let index = 0; index < capitalBurgIds.length; index += 1) {
    const stateId = index + 1;
    const burgId = capitalBurgIds[index] ?? 0;
    const centerCell = burgCell[burgId] ?? 0;
    const centerPack = gridToPack[centerCell] ?? -1;
    const cultureId = burgCulture[burgId] ?? 0;
    const cultureCenter = cultureSeedCell[cultureId] ?? centerCell;
    stateCenterBurg[stateId] = burgId;
    stateCulture[stateId] = cultureId;
    stateExpansionism[stateId] = rn(
      context.random() * context.config.hiddenControls.sizeVariety + 1,
      1,
    );
    stateType[stateId] = getBurgType(
      context,
      centerCell,
      burgPort[burgId] ?? 0,
    );
    stateNativeBiome[stateId] = cellsBiome[cultureCenter] ?? 0;
    if (centerPack >= 0) {
      packState[centerPack] = stateId;
      cost[centerPack] = 1;
      cellsState[centerCell] = stateId;
      pushQueue(queue, {
        id: centerPack,
        owner: stateId,
        extra: stateNativeBiome[stateId] ?? 0,
        cost: 0,
      });
    }
  }

  while (queue.length > 0) {
    const next = popQueue(queue);
    if (!next) break;
    const {
      id: packId,
      owner: stateId,
      extra: nativeBiome,
      cost: pathCost,
    } = next;
    const type = stateType[stateId] ?? "Generic";
    const cultureId = stateCulture[stateId] ?? 0;

    forEachNeighbor(
      packId,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if (!isPoliticalPackCell(context, neighborPackId)) return;
        const neighborCell = packToGrid[neighborPackId] ?? 0;
        const existing = packState[neighborPackId] ?? 0;
        const neighborHeight = cellsH[neighborCell] ?? 0;
        const cultureCost =
          cultureId === (cellsCulture[neighborCell] ?? 0) ? -9 : 100;
        const populationCost =
          neighborHeight < 20
            ? 0
            : (suitability[neighborPackId] ?? 0) > 0
              ? Math.max(20 - (suitability[neighborPackId] ?? 0), 0)
              : 5000;
        const biomeCost = getBiomeCost(
          nativeBiome,
          cellsBiome[neighborCell] ?? 0,
          type,
        );
        const waterbodyId = cellsWaterbody[neighborCell] ?? 0;
        const heightCost = getHeightCost(
          waterbodyType[waterbodyId] ?? 0,
          neighborHeight,
          type,
        );
        const riverCost = getRiverCost(
          cellsRiver[neighborCell] ?? 0,
          cellsFlow[neighborCell] ?? 0,
          type,
        );
        const typeCost = getTypeCost(cellsCoast[neighborCell] ?? 0, type);
        const cellCost = Math.max(
          cultureCost +
            populationCost +
            biomeCost +
            heightCost +
            riverCost +
            typeCost,
          0,
        );
        const totalCost =
          pathCost + 10 + cellCost / (stateExpansionism[stateId] ?? 1);
        if (totalCost > growthRate) return;
        if (
          existing !== 0 &&
          totalCost >= (cost[neighborPackId] ?? Number.POSITIVE_INFINITY)
        )
          return;
        if (neighborHeight >= 20) {
          packState[neighborPackId] = stateId;
          cellsState[neighborCell] = stateId;
        }
        cost[neighborPackId] = totalCost;
        pushQueue(queue, {
          id: neighborPackId,
          owner: stateId,
          extra: nativeBiome,
          cost: totalCost,
        });
      },
    );
  }

  for (let cellId = 0; cellId < cellsState.length; cellId += 1) {
    if (
      (cellsH[cellId] ?? 0) < 20 ||
      (context.world.cellsBurg[cellId] ?? 0) > 0
    )
      continue;
    const currentState = cellsState[cellId] ?? 0;
    if (currentState <= 0) continue;
    let touchesCapital = false;
    let buddies = 0;
    const adversaries = new Map<number, number>();
    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        if ((cellsH[neighborId] ?? 0) < 20) return;
        const neighborBurgId = context.world.cellsBurg[neighborId] ?? 0;
        if (
          neighborBurgId > 0 &&
          (context.world.burgCapital[neighborBurgId] ?? 0) === 1
        ) {
          touchesCapital = true;
          return;
        }
        const neighborState = cellsState[neighborId] ?? 0;
        if (neighborState === currentState) {
          buddies += 1;
          return;
        }
        if (neighborState > 0)
          adversaries.set(
            neighborState,
            (adversaries.get(neighborState) ?? 0) + 1,
          );
      },
    );
    if (touchesCapital || adversaries.size < 2 || buddies > 2) continue;
    let bestState = 0;
    let bestCount = 0;
    for (const [stateId, countValue] of adversaries) {
      if (countValue > bestCount) {
        bestState = stateId;
        bestCount = countValue;
      }
    }
    if (bestCount > buddies) cellsState[cellId] = bestState;
  }

  for (let cellId = 0; cellId < cellsState.length; cellId += 1) {
    const stateId = cellsState[cellId] ?? 0;
    if (stateId > 0 && (cellsH[cellId] ?? 0) >= 20)
      stateCells[stateId] = (stateCells[stateId] ?? 0) + 1;
  }

  context.world.stateCount = stateCount;
  context.world.stateCenterBurg = stateCenterBurg;
  context.world.stateCulture = stateCulture;
  context.world.stateForm = stateForm;
  context.world.stateCells = stateCells;
};

export const runStateFormsStage = (context: GenerationContext): void => {
  const { stateCount, stateCenterBurg, burgCell, burgPort, stateCells } =
    context.world;

  if (stateCount <= 0) {
    context.world.stateForm = new Uint8Array(1);
    return;
  }

  const stateForm = new Uint8Array(stateCount + 1);
  let totalStateCells = 0;
  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    totalStateCells += stateCells[stateId] ?? 0;
  }

  const averageStateCells = totalStateCells / Math.max(stateCount, 1);
  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    const capital = stateCenterBurg[stateId] ?? 0;
    const capitalCell = burgCell[capital] ?? 0;
    const religion = context.world.cellsReligion[capitalCell] ?? 0;
    if (
      (burgPort[capital] ?? 0) === 1 &&
      (stateCells[stateId] ?? 0) < averageStateCells * 1.25
    ) {
      stateForm[stateId] = 2;
    } else if (religion > 0 && context.random() < 0.08) {
      stateForm[stateId] = 3;
    } else {
      stateForm[stateId] = 1;
    }
  }

  context.world.stateForm = stateForm;
};

export const runProvincesStage = (context: GenerationContext): void => {
  const {
    cellsProvince,
    cellsState,
    cellsH,
    stateCount,
    burgCount,
    burgCell,
    burgPopulation,
    burgCapital,
    packCellCount,
    packToGrid,
    gridToPack,
    packNeighborOffsets,
    packNeighbors,
  } = context.world;
  cellsProvince.fill(0);
  if (stateCount <= 0 || burgCount <= 0) {
    context.world.provinceCount = 0;
    context.world.provinceState = new Uint16Array(1);
    context.world.provinceCenterCell = new Uint32Array(1);
    context.world.provinceCells = new Uint32Array(1);
    return;
  }

  const provinceStateList: number[] = [0];
  const provinceCenterCellList: number[] = [0];
  const provincesByState: number[][] = Array.from(
    { length: stateCount + 1 },
    () => [],
  );
  const ratio = 40;

  for (let stateId = 1; stateId <= stateCount; stateId += 1) {
    const stateBurgs = Array.from(
      { length: burgCount },
      (_, index) => index + 1,
    )
      .filter((burgId) => {
        const cellId = burgCell[burgId] ?? 0;
        return (cellsState[cellId] ?? 0) === stateId;
      })
      .sort((left, right) => {
        const populationDiff =
          (burgPopulation[right] ?? 0) - (burgPopulation[left] ?? 0);
        if (populationDiff !== 0) return populationDiff;
        return (
          (burgCapital[right] ?? 0) - (burgCapital[left] ?? 0) || left - right
        );
      });
    if (stateBurgs.length < 2) continue;
    const provinceNumber = Math.max(
      Math.ceil((stateBurgs.length * ratio) / 100),
      2,
    );
    for (
      let index = 0;
      index < Math.min(provinceNumber, stateBurgs.length);
      index += 1
    ) {
      const provinceId = provinceStateList.length;
      const centerCell = burgCell[stateBurgs[index] ?? 0] ?? 0;
      provinceStateList.push(stateId);
      provinceCenterCellList.push(centerCell);
      provincesByState[stateId]?.push(provinceId);
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
  const packProvince = new Uint16Array(packCellCount);
  const cost = new Float64Array(packCellCount);
  cost.fill(Number.POSITIVE_INFINITY);
  const queue: QueueEntry[] = [];
  const maxGrowth = 20 * ratio ** 0.5;

  for (let provinceId = 1; provinceId <= provinceCount; provinceId += 1) {
    const centerCell = provinceCenterCell[provinceId] ?? 0;
    const centerPack = gridToPack[centerCell] ?? -1;
    if (centerPack < 0) continue;
    packProvince[centerPack] = provinceId;
    cost[centerPack] = 1;
    pushQueue(queue, {
      id: centerPack,
      owner: provinceId,
      extra: provinceState[provinceId] ?? 0,
      cost: 0,
    });
  }

  while (queue.length > 0) {
    const next = popQueue(queue);
    if (!next) break;
    const provinceId = next.owner;
    const stateId = next.extra;
    forEachNeighbor(
      next.id,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if (!isPoliticalPackCell(context, neighborPackId)) return;
        const cellId = packToGrid[neighborPackId] ?? 0;
        if ((cellsH[cellId] ?? 0) < 20) return;
        if ((cellsState[cellId] ?? 0) !== stateId) return;
        const elevation =
          (cellsH[cellId] ?? 0) >= 70
            ? 100
            : (cellsH[cellId] ?? 0) >= 50
              ? 30
              : 10;
        const totalCost = next.cost + elevation;
        if (totalCost > maxGrowth) return;
        if (
          (packProvince[neighborPackId] ?? 0) !== 0 &&
          totalCost >= (cost[neighborPackId] ?? Number.POSITIVE_INFINITY)
        )
          return;
        packProvince[neighborPackId] = provinceId;
        cost[neighborPackId] = totalCost;
        pushQueue(queue, {
          id: neighborPackId,
          owner: provinceId,
          extra: stateId,
          cost: totalCost,
        });
      },
    );
  }

  for (let packId = 0; packId < packCellCount; packId += 1) {
    if (!isPoliticalPackCell(context, packId)) continue;
    const cellId = packToGrid[packId] ?? 0;
    const stateId = cellsState[cellId] ?? 0;
    if (stateId <= 0 || (cellsH[cellId] ?? 0) < 20) continue;
    if ((packProvince[packId] ?? 0) === 0) {
      const candidates = provincesByState[stateId] ?? [];
      let bestProvinceId = candidates[0] ?? 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const provinceId of candidates) {
        const centerCell = provinceCenterCell[provinceId] ?? 0;
        const dx =
          (context.world.cellsX[cellId] ?? 0) -
          (context.world.cellsX[centerCell] ?? 0);
        const dy =
          (context.world.cellsY[cellId] ?? 0) -
          (context.world.cellsY[centerCell] ?? 0);
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestProvinceId = provinceId;
        }
      }
      packProvince[packId] = bestProvinceId;
    }
    cellsProvince[cellId] = packProvince[packId] ?? 0;
  }

  for (let cellId = 0; cellId < cellsProvince.length; cellId += 1) {
    if (
      (cellsH[cellId] ?? 0) < 20 ||
      (context.world.cellsBurg[cellId] ?? 0) > 0
    )
      continue;
    const currentProvince = cellsProvince[cellId] ?? 0;
    const stateId = cellsState[cellId] ?? 0;
    if (currentProvince <= 0 || stateId <= 0) continue;
    let buddies = 0;
    const competitors = new Map<number, number>();
    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        if ((cellsH[neighborId] ?? 0) < 20) return;
        if ((cellsState[neighborId] ?? 0) !== stateId) return;
        const provinceId = cellsProvince[neighborId] ?? 0;
        if (provinceId === currentProvince) buddies += 1;
        else if (provinceId > 0)
          competitors.set(provinceId, (competitors.get(provinceId) ?? 0) + 1);
      },
    );
    if (buddies > 2 || competitors.size < 2) continue;
    let bestProvince = currentProvince;
    let bestCount = buddies;
    for (const [provinceId, countValue] of competitors) {
      if (countValue > bestCount) {
        bestProvince = provinceId;
        bestCount = countValue;
      }
    }
    cellsProvince[cellId] = bestProvince;
  }

  for (let cellId = 0; cellId < cellsProvince.length; cellId += 1) {
    const provinceId = cellsProvince[cellId] ?? 0;
    if (provinceId > 0 && (cellsH[cellId] ?? 0) >= 20)
      provinceCells[provinceId] = (provinceCells[provinceId] ?? 0) + 1;
  }

  context.world.provinceCount = provinceCount;
  context.world.provinceState = provinceState;
  context.world.provinceCenterCell = provinceCenterCell;
  context.world.provinceCells = provinceCells;
};

export const runReligionsStage = (context: GenerationContext): void => {
  const {
    cellCount,
    cellsReligion,
    cellsCulture,
    cellsState,
    cellsFeature,
    burgCount,
    burgCell,
    burgPopulation,
    cultureCount,
    cultureSeedCell,
    packCellCount,
    packToGrid,
    gridToPack,
    cellNeighborOffsets,
    cellNeighbors,
  } = context.world;
  cellsReligion.fill(0);
  if (packCellCount <= 0 || cultureCount <= 0) {
    context.world.religionCount = 0;
    context.world.religionSeedCell = new Uint32Array(1);
    context.world.religionType = new Uint8Array(1);
    context.world.religionSize = new Uint32Array(1);
    return;
  }

  const religionSeedCellList: number[] = [0];
  const religionTypeList: number[] = [0];
  const religionCultureList: number[] = [0];
  const religionExpansionism: number[] = [0];
  const religionMode: ReligionExpansionMode[] = ["global"];
  const religionRandom = createAlea(`${context.config.seed}:religions`);

  for (let cultureId = 1; cultureId <= cultureCount; cultureId += 1) {
    const centerCell = cultureSeedCell[cultureId] ?? 0;
    if ((cellsFeature[centerCell] ?? 0) !== 1) continue;
    religionSeedCellList.push(centerCell);
    religionTypeList.push(1);
    religionCultureList.push(cultureId);
    religionExpansionism.push(0);
    religionMode.push("culture");
  }

  const activePackCount = Array.from(
    { length: packCellCount },
    (_, packId) => packId,
  ).filter((packId) => isPoliticalPackCell(context, packId)).length;
  const desiredReligionNumber = clamp(
    context.config.hiddenControls.religionsNumber ??
      Math.round(Math.sqrt(Math.max(activePackCount, 1)) / 2),
    0,
    50,
  );
  const suitability = computePoliticalSuitability(context);
  const candidateBurgs = Array.from(
    { length: burgCount },
    (_, index) => index + 1,
  )
    .filter((burgId) => (cellsFeature[burgCell[burgId] ?? 0] ?? 0) === 1)
    .sort(
      (left, right) =>
        (burgPopulation[right] ?? 0) - (burgPopulation[left] ?? 0) ||
        left - right,
    )
    .map((burgId) => burgCell[burgId] ?? 0)
    .filter((cellId, index, list) => list.indexOf(cellId) === index);
  const candidateCells =
    desiredReligionNumber <= 0
      ? []
      : candidateBurgs.length >= desiredReligionNumber
        ? candidateBurgs
        : Array.from({ length: packCellCount }, (_, packId) => packId)
            .filter(
              (packId) =>
                isPoliticalPackCell(context, packId) &&
                (suitability[packId] ?? 0) > 2,
            )
            .sort(
              (left, right) =>
                (suitability[right] ?? 0) - (suitability[left] ?? 0) ||
                left - right,
            )
            .map((packId) => packToGrid[packId] ?? 0);
  const selectedSeeds: number[] = [];
  const spacing =
    (context.config.width + context.config.height) /
    2 /
    Math.max(desiredReligionNumber, 1);

  for (const cellId of candidateCells) {
    const x = context.world.cellsX[cellId] ?? 0;
    const y = context.world.cellsY[cellId] ?? 0;
    let tooClose = false;
    for (const selectedCell of selectedSeeds) {
      const dx = (context.world.cellsX[selectedCell] ?? 0) - x;
      const dy = (context.world.cellsY[selectedCell] ?? 0) - y;
      if (dx * dx + dy * dy <= spacing * spacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    selectedSeeds.push(cellId);
    if (selectedSeeds.length >= desiredReligionNumber) break;
  }

  const cultsCount =
    selectedSeeds.length > 0
      ? Math.floor((randInt(religionRandom, 1, 4) / 10) * selectedSeeds.length)
      : 0;
  const heresiesCount =
    selectedSeeds.length > 0
      ? Math.floor((randInt(religionRandom, 0, 3) / 10) * selectedSeeds.length)
      : 0;
  const organizedCount = Math.max(
    selectedSeeds.length - cultsCount - heresiesCount,
    0,
  );

  const getReligionMode = (
    type: number,
    stateId: number,
  ): ReligionExpansionMode => {
    if (type !== 2) return "global";
    const roll = randInt(religionRandom, 1, 27);
    if (roll <= 14) return "global";
    if (roll <= 20) return "culture";
    if (stateId > 0) return "state";
    return "global";
  };

  for (let index = 0; index < selectedSeeds.length; index += 1) {
    const cellId = selectedSeeds[index] ?? 0;
    const type =
      index < organizedCount ? 2 : index < organizedCount + cultsCount ? 3 : 4;
    const stateId = cellsState[cellId] ?? 0;
    religionSeedCellList.push(cellId);
    religionCultureList.push(cellsCulture[cellId] ?? 0);
    religionTypeList.push(type);
    religionExpansionism.push(
      type === 2
        ? rn(gauss(religionRandom, 5, 3, 0, 10, 1), 2)
        : type === 3
          ? rn(gauss(religionRandom, 0.5, 0.5, 0, 5, 1), 2)
          : rn(gauss(religionRandom, 1, 0.5, 0, 5, 1), 2),
    );
    religionMode.push(getReligionMode(type, stateId));
  }

  const religionCount = religionSeedCellList.length - 1;
  const religionSeedCell = Uint32Array.from(religionSeedCellList);
  const religionType = Uint8Array.from(religionTypeList);
  const religionSize = new Uint32Array(religionCount + 1);

  for (let cellId = 0; cellId < cellsReligion.length; cellId += 1) {
    const cultureId = cellsCulture[cellId] ?? 0;
    if (cultureId <= 0) continue;
    let assigned = 0;
    for (let religionId = 1; religionId <= religionCount; religionId += 1) {
      if ((religionType[religionId] ?? 0) !== 1) continue;
      if (religionCultureList[religionId] === cultureId) {
        assigned = religionId;
        break;
      }
    }
    cellsReligion[cellId] = assigned;
  }

  const maxExpansionCost =
    (Math.max(cellCount, 1) / 20) * context.config.hiddenControls.growthRate;
  const queue: QueueEntry[] = [];
  const cost = new Float64Array(cellCount);
  cost.fill(Number.POSITIVE_INFINITY);
  const routeStateKeys = buildReligionRouteStateSet(context);

  for (let religionId = 1; religionId <= religionCount; religionId += 1) {
    if ((religionType[religionId] ?? 0) === 1) continue;
    const seedCell = religionSeedCell[religionId] ?? 0;
    cellsReligion[seedCell] = religionId;
    cost[seedCell] = 1;
    pushQueue(queue, {
      id: seedCell,
      owner: religionId,
      extra: cellsState[seedCell] ?? 0,
      cost: 0,
    });
  }

  while (queue.length > 0) {
    const next = popQueue(queue);
    if (!next) break;
    const religionId = next.owner;
    const cultureId = religionCultureList[religionId] ?? 0;
    const mode = religionMode[religionId] ?? "global";
    const stateId = next.extra;
    const expansionism = religionExpansionism[religionId] ?? 1;
    forEachNeighbor(next.id, cellNeighborOffsets, cellNeighbors, (nextCell) => {
      if (mode === "culture" && (cellsCulture[nextCell] ?? 0) !== cultureId)
        return;
      if (mode === "state" && (cellsState[nextCell] ?? 0) !== stateId) return;
      const cultureCost = (cellsCulture[nextCell] ?? 0) !== cultureId ? 10 : 0;
      const stateCost = stateId !== (cellsState[nextCell] ?? 0) ? 10 : 0;
      const passageCost = getReligionPassageCost(
        context,
        routeStateKeys,
        next.id,
        nextCell,
      );
      const totalCost =
        next.cost +
        10 +
        (cultureCost + stateCost + passageCost) / Math.max(expansionism, 0.1);
      if (totalCost > maxExpansionCost) return;
      if (totalCost >= (cost[nextCell] ?? Number.POSITIVE_INFINITY)) return;
      cost[nextCell] = totalCost;
      if ((cellsCulture[nextCell] ?? 0) > 0) {
        cellsReligion[nextCell] = religionId;
      }
      pushQueue(queue, {
        id: nextCell,
        owner: religionId,
        extra: stateId,
        cost: totalCost,
      });
    });
  }

  for (let cellId = 0; cellId < cellsReligion.length; cellId += 1) {
    const religionId = cellsReligion[cellId] ?? 0;
    if (religionId > 0 && (cellsFeature[cellId] ?? 0) === 1) {
      religionSize[religionId] = (religionSize[religionId] ?? 0) + 1;
    }
  }

  for (let religionId = 1; religionId <= religionCount; religionId += 1) {
    const currentSeed = religionSeedCell[religionId] ?? 0;
    if ((cellsReligion[currentSeed] ?? 0) === religionId) continue;

    let firstOwnedCell = -1;
    for (let cellId = 0; cellId < cellsReligion.length; cellId += 1) {
      if ((cellsReligion[cellId] ?? 0) !== religionId) continue;
      firstOwnedCell = cellId;
      break;
    }

    if (firstOwnedCell >= 0) {
      religionSeedCell[religionId] = firstOwnedCell;
      continue;
    }

    if ((religionType[religionId] ?? 0) === 1) {
      const cultureId = religionCultureList[religionId] ?? 0;
      religionSeedCell[religionId] = cultureSeedCell[cultureId] ?? currentSeed;
    }
  }

  context.world.religionCount = religionCount;
  context.world.religionSeedCell = religionSeedCell;
  context.world.religionType = religionType;
  context.world.religionSize = religionSize;
};
