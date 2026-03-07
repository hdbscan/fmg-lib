import type { GenerationContext } from "../types";

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

const computeSuitability = (context: GenerationContext): Float64Array => {
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

const isPoliticalPackCell = (
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

export const runSettlementsStage = (context: GenerationContext): void => {
  const {
    cellsBurg,
    cellsCulture,
    cellsFeature,
    packCellCount,
    packToGrid,
    packX,
    packY,
    gridToPack,
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
    context.world.burgCount = 0;
    context.world.burgCell = new Uint32Array(1);
    context.world.burgX = new Float32Array(1);
    context.world.burgY = new Float32Array(1);
    context.world.burgPopulation = new Uint16Array(1);
    context.world.burgCapital = new Uint8Array(1);
    context.world.burgPort = new Uint8Array(1);
    context.world.burgCulture = new Uint16Array(1);
    return;
  }

  const suitability = computeSuitability(context);
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
    context.world.burgCount = 0;
    context.world.burgCell = new Uint32Array(1);
    context.world.burgX = new Float32Array(1);
    context.world.burgY = new Float32Array(1);
    context.world.burgPopulation = new Uint16Array(1);
    context.world.burgCapital = new Uint8Array(1);
    context.world.burgPort = new Uint8Array(1);
    context.world.burgCulture = new Uint16Array(1);
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
  const burgPopulation = new Uint16Array(burgCount + 1);
  const burgCapital = new Uint8Array(burgCount + 1);
  const burgPort = new Uint8Array(burgCount + 1);
  const burgCulture = new Uint16Array(burgCount + 1);

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
    const port =
      waterbodyId > 0 &&
      (waterbodyType[waterbodyId] ?? 0) > 0 &&
      isMulticell &&
      isHarbor &&
      !isFrozen
        ? waterbodyId
        : 0;
    const basePopulation = (suitability[packId] ?? 0) / 5;
    let population = basePopulation * (capital ? 1.5 : 1);
    if (port > 0) population *= 1.2;
    if ((cellsRiver[cellId] ?? 0) > 0) population *= 1.1;
    population *= gauss(context.random, 1, 1, 0.25, 4, 5);
    population += (burgId % 100) / 1000;

    cellsBurg[cellId] = burgId;
    burgCell[burgId] = cellId;
    burgX[burgId] = rn(packX[packId] ?? 0, 2);
    burgY[burgId] = rn(packY[packId] ?? 0, 2);
    burgPopulation[burgId] = clamp(
      Math.round(Math.max(population, 1) * 10),
      1,
      65535,
    );
    burgCapital[burgId] = capital;
    burgPort[burgId] = port > 0 ? 1 : 0;
    burgCulture[burgId] = cellsCulture[cellId] ?? 0;

    if (port > 0 && haven >= 0) {
      const edgePoint = getSharedEdgePoint(context, cellId, haven);
      if (edgePoint) {
        burgX[burgId] = edgePoint[0];
        burgY[burgId] = edgePoint[1];
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

  context.world.burgCount = burgCount;
  context.world.burgCell = burgCell;
  context.world.burgX = burgX;
  context.world.burgY = burgY;
  context.world.burgPopulation = burgPopulation;
  context.world.burgCapital = burgCapital;
  context.world.burgPort = burgPort;
  context.world.burgCulture = burgCulture;
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

  const suitability = computeSuitability(context);
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
  const growthRate = (Math.max(activePackCount, 1) / 2) * 1 * 1;

  for (let index = 0; index < capitalBurgIds.length; index += 1) {
    const stateId = index + 1;
    const burgId = capitalBurgIds[index] ?? 0;
    const centerCell = burgCell[burgId] ?? 0;
    const centerPack = gridToPack[centerCell] ?? -1;
    const cultureId = burgCulture[burgId] ?? 0;
    const cultureCenter = cultureSeedCell[cultureId] ?? centerCell;
    stateCenterBurg[stateId] = burgId;
    stateCulture[stateId] = cultureId;
    stateExpansionism[stateId] = rn(context.random() * 2 + 1, 1);
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
    let buddies = 0;
    const adversaries = new Map<number, number>();
    forEachNeighbor(
      cellId,
      context.world.cellNeighborOffsets,
      context.world.cellNeighbors,
      (neighborId) => {
        if ((cellsH[neighborId] ?? 0) < 20) return;
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
    if (adversaries.size < 2 || buddies > 2) continue;
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

  const averageStateCells =
    Math.max(activePackCount, 1) / Math.max(stateCount, 1);
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

  context.world.stateCount = stateCount;
  context.world.stateCenterBurg = stateCenterBurg;
  context.world.stateCulture = stateCulture;
  context.world.stateForm = stateForm;
  context.world.stateCells = stateCells;
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
    cellsReligion,
    cellsCulture,
    cellsState,
    cellsFeature,
    cellsBiome,
    burgCount,
    burgCell,
    burgPopulation,
    cultureCount,
    cultureSeedCell,
    packCellCount,
    packToGrid,
    gridToPack,
    packNeighborOffsets,
    packNeighbors,
    cellsH,
  } = context.world;
  cellsReligion.fill(0);
  if (packCellCount <= 0) {
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
  const religionMode: ("culture" | "state" | "global")[] = ["global"];

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
    Math.round(Math.sqrt(Math.max(activePackCount, 1)) / 2),
    1,
    32,
  );
  const candidateBurgs = Array.from(
    { length: burgCount },
    (_, index) => index + 1,
  )
    .sort(
      (left, right) =>
        (burgPopulation[right] ?? 0) - (burgPopulation[left] ?? 0) ||
        left - right,
    )
    .map((burgId) => burgCell[burgId] ?? 0)
    .filter(
      (cellId, index, list) =>
        (cellsFeature[cellId] ?? 0) === 1 && list.indexOf(cellId) === index,
    );
  const desiredNew = Math.max(
    desiredReligionNumber - (religionSeedCellList.length - 1),
    0,
  );
  const selectedSeeds: number[] = [];
  const spacing =
    (context.config.width + context.config.height) /
    2 /
    Math.max(desiredReligionNumber, 1);

  for (const cellId of candidateBurgs) {
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
    if (selectedSeeds.length >= desiredNew) break;
  }

  const organizedCount = Math.max(
    0,
    selectedSeeds.length - Math.floor(selectedSeeds.length * 0.2),
  );
  for (let index = 0; index < selectedSeeds.length; index += 1) {
    const cellId = selectedSeeds[index] ?? 0;
    religionSeedCellList.push(cellId);
    religionCultureList.push(cellsCulture[cellId] ?? 0);
    if (index < organizedCount) {
      religionTypeList.push(2);
      religionExpansionism.push(rn(gauss(context.random, 5, 3, 0.5, 10, 1), 2));
      religionMode.push(
        (cellsState[cellId] ?? 0) > 0 && context.random() < 0.45
          ? "state"
          : context.random() < 0.35
            ? "culture"
            : "global",
      );
    } else {
      religionTypeList.push(3);
      religionExpansionism.push(
        rn(gauss(context.random, 0.8, 0.6, 0.1, 5, 1), 2),
      );
      religionMode.push(context.random() < 0.5 ? "culture" : "global");
    }
  }

  const religionCount = religionSeedCellList.length - 1;
  const religionSeedCell = Uint32Array.from(religionSeedCellList);
  const religionType = Uint8Array.from(religionTypeList);
  const religionSize = new Uint32Array(religionCount + 1);

  for (let cellId = 0; cellId < cellsReligion.length; cellId += 1) {
    if ((cellsFeature[cellId] ?? 0) !== 1) continue;
    const cultureId = cellsCulture[cellId] ?? 0;
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

  const maxExpansionCost = (Math.max(activePackCount, 1) / 20) * 1;
  const queue: QueueEntry[] = [];
  const cost = new Float64Array(packCellCount);
  cost.fill(Number.POSITIVE_INFINITY);

  for (let religionId = 1; religionId <= religionCount; religionId += 1) {
    if ((religionType[religionId] ?? 0) === 1) continue;
    const seedCell = religionSeedCell[religionId] ?? 0;
    const seedPack = gridToPack[seedCell] ?? -1;
    if (seedPack < 0) continue;
    cellsReligion[seedCell] = religionId;
    cost[seedPack] = 1;
    pushQueue(queue, {
      id: seedPack,
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
    const currentCell = packToGrid[next.id] ?? 0;
    forEachNeighbor(
      next.id,
      packNeighborOffsets,
      packNeighbors,
      (neighborPackId) => {
        if (!isPoliticalPackCell(context, neighborPackId)) return;
        const nextCell = packToGrid[neighborPackId] ?? 0;
        if ((cellsH[nextCell] ?? 0) < 20) return;
        if (mode === "culture" && (cellsCulture[nextCell] ?? 0) !== cultureId)
          return;
        if (mode === "state" && (cellsState[nextCell] ?? 0) !== stateId) return;
        const cultureCost =
          (cellsCulture[nextCell] ?? 0) !== cultureId ? 10 : 0;
        const stateCost = stateId !== (cellsState[nextCell] ?? 0) ? 10 : 0;
        const routeCost =
          (context.world.cellsRiver[nextCell] ?? 0) > 0
            ? 1
            : (cellsBiome[nextCell] ?? 0) + 5;
        const totalCost =
          next.cost +
          10 +
          (cultureCost + stateCost + routeCost) / Math.max(expansionism, 0.1);
        if (totalCost > maxExpansionCost) return;
        if (totalCost >= (cost[neighborPackId] ?? Number.POSITIVE_INFINITY))
          return;
        cost[neighborPackId] = totalCost;
        cellsReligion[nextCell] = religionId;
        pushQueue(queue, {
          id: neighborPackId,
          owner: religionId,
          extra: stateId,
          cost: totalCost,
        });
      },
    );
    cellsReligion[currentCell] = religionId;
  }

  for (let cellId = 0; cellId < cellsReligion.length; cellId += 1) {
    const religionId = cellsReligion[cellId] ?? 0;
    if (religionId > 0 && (cellsFeature[cellId] ?? 0) === 1) {
      religionSize[religionId] = (religionSize[religionId] ?? 0) + 1;
    }
  }

  context.world.religionCount = religionCount;
  context.world.religionSeedCell = religionSeedCell;
  context.world.religionType = religionType;
  context.world.religionSize = religionSize;
};
