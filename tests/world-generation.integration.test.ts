import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  type GenerationConfig,
  deserializeWorld,
  generateWorld,
  serializeWorld,
} from "../src/index";

const baseConfig: GenerationConfig = {
  seed: "world-seed-alpha",
  width: 1200,
  height: 800,
  cells: 12000,
};

const countCells = (
  cellsH: Uint8Array,
  predicate: (value: number) => boolean,
): number => {
  let count = 0;

  for (const value of cellsH) {
    if (predicate(value)) {
      count += 1;
    }
  }

  return count;
};

const collectNeighbors = (
  world: ReturnType<typeof generateWorld>,
  cellId: number,
): number[] => {
  const from = world.cellNeighborOffsets[cellId];
  const to = world.cellNeighborOffsets[cellId + 1];

  if (from === undefined || to === undefined) {
    throw new Error("missing neighbor offset");
  }

  return Array.from(world.cellNeighbors.slice(from, to));
};

const collectPackNeighbors = (
  world: ReturnType<typeof generateWorld>,
  packId: number,
): number[] => {
  const from = world.packNeighborOffsets[packId];
  const to = world.packNeighborOffsets[packId + 1];

  if (from === undefined || to === undefined) {
    throw new Error("missing pack neighbor offset");
  }

  return Array.from(world.packNeighbors.slice(from, to));
};

const collectHydrologyStats = (
  world: ReturnType<typeof generateWorld>,
): Readonly<{
  riverCells: number;
  maxLandFlow: number;
  riverThreshold: number;
  biomeCount: number;
}> => {
  let riverCells = 0;
  let maxLandFlow = 0;
  const biomes = new Set<number>();
  const riverThreshold = Math.max(600, Math.floor(world.cellCount / 10));

  for (let index = 0; index < world.cellCount; index += 1) {
    const feature = world.cellsFeature[index] ?? 0;
    const river = world.cellsRiver[index] ?? 0;
    const flow = world.cellsFlow[index] ?? 0;
    const biome = world.cellsBiome[index] ?? 0;

    if (feature === 1) {
      biomes.add(biome);
      maxLandFlow = Math.max(maxLandFlow, flow);
    }

    if (river === 1) {
      riverCells += 1;
      expect(feature).toBe(1);
      expect(flow).toBeGreaterThanOrEqual(riverThreshold);
      expect(biome).not.toBe(0);
    }
  }

  if (riverCells === 0) {
    expect(maxLandFlow).toBeLessThan(riverThreshold);
  } else {
    expect(maxLandFlow).toBeGreaterThanOrEqual(riverThreshold);
  }

  return {
    riverCells,
    maxLandFlow,
    riverThreshold,
    biomeCount: biomes.size,
  };
};

const countUnassignedWaterReligionBridges = (
  world: ReturnType<typeof generateWorld>,
): number => {
  let bridges = 0;

  for (let cellId = 0; cellId < world.cellCount; cellId += 1) {
    if ((world.cellsFeature[cellId] ?? 0) !== 0) continue;
    if ((world.cellsReligion[cellId] ?? 0) !== 0) continue;

    const religionNeighborCounts = new Map<number, number>();
    const neighbors = collectNeighbors(world, cellId);
    for (const neighborId of neighbors) {
      if ((world.cellsFeature[neighborId] ?? 0) !== 1) continue;
      const religionId = world.cellsReligion[neighborId] ?? 0;
      if (religionId <= 0) continue;
      religionNeighborCounts.set(
        religionId,
        (religionNeighborCounts.get(religionId) ?? 0) + 1,
      );
    }

    for (const count of religionNeighborCounts.values()) {
      if (count >= 2) {
        bridges += 1;
        break;
      }
    }
  }

  return bridges;
};

describe("world generation integration", () => {
  test("builds a coherent physical world graph", () => {
    const world = generateWorld(baseConfig);

    expect(world.schemaVersion).toBe(1);
    expect(world.seed).toBe(baseConfig.seed);
    expect(world.width).toBe(baseConfig.width);
    expect(world.height).toBe(baseConfig.height);
    expect(world.requestedCells).toBe(baseConfig.cells);

    expect(world.gridCellsX).toBeGreaterThan(0);
    expect(world.gridCellsY).toBeGreaterThan(0);
    expect(world.cellCount).toBe(world.gridCellsX * world.gridCellsY);
    expect(world.gridSpacing).toBeGreaterThan(0);

    expect(world.cellsX.length).toBe(world.cellCount);
    expect(world.cellsY.length).toBe(world.cellCount);
    expect(world.cellsBorder.length).toBe(world.cellCount);
    expect(world.cellsArea.length).toBe(world.cellCount);
    expect(world.cellsH.length).toBe(world.cellCount);
    expect(world.cellsCulture.length).toBe(world.cellCount);
    expect(world.cultureCount).toBe(0);
    expect(world.cultureSeedCell.length).toBe(1);
    expect(world.cultureSize.length).toBe(1);
    expect(world.cellsBurg.length).toBe(world.cellCount);
    expect(world.burgCount).toBe(0);
    expect(world.burgCell.length).toBe(1);
    expect(world.burgPopulation.length).toBe(1);
    expect(world.burgPort.length).toBe(1);
    expect(world.burgCulture.length).toBe(1);
    expect(world.cellsState.length).toBe(world.cellCount);
    expect(world.stateCount).toBe(0);
    expect(world.stateCenterBurg.length).toBe(1);
    expect(world.stateCulture.length).toBe(1);
    expect(world.stateForm.length).toBe(1);
    expect(world.stateCells.length).toBe(1);
    expect(world.routeCount).toBe(0);
    expect(world.routeFromState.length).toBe(1);
    expect(world.routeToState.length).toBe(1);
    expect(world.routeKind.length).toBe(1);
    expect(world.routeWeight.length).toBe(1);
    expect(world.cellsProvince.length).toBe(world.cellCount);
    expect(world.provinceCount).toBe(0);
    expect(world.provinceState.length).toBe(1);
    expect(world.provinceCenterCell.length).toBe(1);
    expect(world.provinceCells.length).toBe(1);
    expect(world.cellsReligion.length).toBe(world.cellCount);
    expect(world.religionCount).toBe(0);
    expect(world.religionSeedCell.length).toBe(1);
    expect(world.religionType.length).toBe(1);
    expect(world.religionSize.length).toBe(1);
    expect(world.cellsMilitary.length).toBe(world.cellCount);
    expect(world.militaryCount).toBe(0);
    expect(world.militaryCell.length).toBe(1);
    expect(world.militaryState.length).toBe(1);
    expect(world.militaryType.length).toBe(1);
    expect(world.militaryStrength.length).toBe(1);
    expect(world.markerCount).toBe(0);
    expect(world.markerCell.length).toBe(1);
    expect(world.markerType.length).toBe(1);
    expect(world.markerStrength.length).toBe(1);
    expect(world.cellsZone.length).toBe(world.cellCount);
    expect(world.zoneCount).toBe(0);
    expect(world.zoneSeedCell.length).toBe(1);
    expect(world.zoneType.length).toBe(1);
    expect(world.zoneCells.length).toBe(1);
    expect(world.cellsFeature.length).toBe(world.cellCount);
    expect(world.cellsFeatureId.length).toBe(world.cellCount);
    expect(world.cellsCoast.length).toBe(world.cellCount);
    expect(world.featureCount).toBe(world.landmassCount + world.waterbodyCount);
    expect(world.featureType.length).toBe(world.featureCount + 1);
    expect(world.featureLand.length).toBe(world.featureCount + 1);
    expect(world.featureBorder.length).toBe(world.featureCount + 1);
    expect(world.featureSize.length).toBe(world.featureCount + 1);
    expect(world.featureFirstCell.length).toBe(world.featureCount + 1);
    expect(world.cellsLandmass.length).toBe(world.cellCount);
    expect(world.landmassCount).toBeGreaterThan(0);
    expect(world.landmassKind.length).toBe(world.landmassCount + 1);
    expect(world.landmassSize.length).toBe(world.landmassCount + 1);
    expect(world.landmassBorder.length).toBe(world.landmassCount + 1);
    expect(world.cellsTemp.length).toBe(world.cellCount);
    expect(world.cellsPrec.length).toBe(world.cellCount);
    expect(world.cellsFlow.length).toBe(world.cellCount);
    expect(world.cellsRiver.length).toBe(world.cellCount);
    expect(world.cellsBiome.length).toBe(world.cellCount);
    expect(world.cellsWaterbody.length).toBe(world.cellCount);
    expect(world.gridToPack.length).toBe(world.cellCount);
    expect(world.packCellCount).toBeGreaterThan(0);
    expect(world.packToGrid.length).toBe(world.packCellCount);
    expect(world.packX.length).toBe(world.packCellCount);
    expect(world.packY.length).toBe(world.packCellCount);
    expect(world.packH.length).toBe(world.packCellCount);
    expect(world.packArea.length).toBe(world.packCellCount);
    expect(world.packNeighborOffsets.length).toBe(world.packCellCount + 1);
    expect(world.packCellsFeatureId.length).toBe(world.packCellCount);
    expect(world.packFeatureCount).toBeGreaterThan(0);
    expect(world.packFeatureType.length).toBe(world.packFeatureCount + 1);
    expect(world.packFeatureBorder.length).toBe(world.packFeatureCount + 1);
    expect(world.packFeatureSize.length).toBe(world.packFeatureCount + 1);
    expect(world.packFeatureFirstCell.length).toBe(world.packFeatureCount + 1);
    expect(world.packCoast.length).toBe(world.packCellCount);
    expect(world.packHaven.length).toBe(world.packCellCount);
    expect(world.packHarbor.length).toBe(world.packCellCount);
    expect(world.waterbodyCount).toBeGreaterThan(0);
    expect(world.waterbodyType.length).toBe(world.waterbodyCount + 1);
    expect(world.waterbodySize.length).toBe(world.waterbodyCount + 1);
    expect(world.vertexX.length).toBeGreaterThan(world.cellCount);
    expect(world.vertexX.length).toBe(world.vertexY.length);
    expect(world.cellVertexOffsets.length).toBe(world.cellCount + 1);
    expect(world.cellVertices.length).toBeGreaterThan(world.cellCount * 2);
    expect(world.cellNeighborOffsets.length).toBe(world.cellCount + 1);
    expect(world.cellNeighbors.length).toBeGreaterThan(world.cellCount);

    const seaLevel = baseConfig.seaLevel ?? 20;
    const waterCells = countCells(world.cellsH, (value) => value < seaLevel);
    const landCells = world.cellCount - waterCells;

    expect(waterCells).toBeGreaterThan(0);
    expect(landCells).toBeGreaterThan(0);

    for (let index = 0; index < world.cellCount; index += 1) {
      const x = world.cellsX[index];
      const y = world.cellsY[index];
      const border = world.cellsBorder[index];
      const area = world.cellsArea[index];
      const h = world.cellsH[index];
      const culture = world.cellsCulture[index];
      const burg = world.cellsBurg[index];
      const state = world.cellsState[index];
      const province = world.cellsProvince[index];
      const religion = world.cellsReligion[index];
      const military = world.cellsMilitary[index];
      const zone = world.cellsZone[index];
      const feature = world.cellsFeature[index];
      const featureId = world.cellsFeatureId[index];
      const coast = world.cellsCoast[index];
      const landmass = world.cellsLandmass[index];
      const t = world.cellsTemp[index];
      const p = world.cellsPrec[index];
      const flow = world.cellsFlow[index];
      const river = world.cellsRiver[index];
      const biome = world.cellsBiome[index];
      const waterbody = world.cellsWaterbody[index];
      const gridPackId = world.gridToPack[index];
      const vertexFrom = world.cellVertexOffsets[index];
      const vertexTo = world.cellVertexOffsets[index + 1];

      if (
        x === undefined ||
        y === undefined ||
        border === undefined ||
        area === undefined ||
        h === undefined ||
        culture === undefined ||
        burg === undefined ||
        state === undefined ||
        province === undefined ||
        religion === undefined ||
        military === undefined ||
        zone === undefined ||
        feature === undefined ||
        featureId === undefined ||
        coast === undefined ||
        landmass === undefined ||
        t === undefined ||
        p === undefined ||
        flow === undefined ||
        river === undefined ||
        biome === undefined ||
        waterbody === undefined ||
        gridPackId === undefined ||
        vertexFrom === undefined ||
        vertexTo === undefined
      ) {
        throw new Error("expected generated cell attributes to exist");
      }

      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(world.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(world.height);
      expect(border === 0 || border === 1).toBe(true);
      expect(area).toBeGreaterThan(0);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(100);
      expect(culture).toBe(0);
      expect(burg).toBe(0);
      expect(state).toBe(0);
      expect(province).toBe(0);
      expect(religion).toBe(0);
      expect(military).toBe(0);
      expect(zone).toBe(0);
      expect(feature === 0 || feature === 1).toBe(true);
      expect(featureId).toBeGreaterThan(0);
      expect(featureId).toBeLessThanOrEqual(world.featureCount);
      expect(coast).toBeGreaterThanOrEqual(-10);
      expect(coast).toBeLessThanOrEqual(10);

      if (feature === 1) {
        expect(h).toBeGreaterThanOrEqual(seaLevel);
      } else {
        expect(h).toBeLessThan(seaLevel);
      }

      expect(t).toBeGreaterThanOrEqual(-128);
      expect(t).toBeLessThanOrEqual(127);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(255);
      expect(flow).toBeGreaterThanOrEqual(0);
      expect(river === 0 || river === 1).toBe(true);
      expect(biome).toBeGreaterThanOrEqual(0);
      expect(biome).toBeLessThanOrEqual(8);

      if (feature === 0) {
        expect(river).toBe(0);
        expect(biome).toBe(0);
        if (gridPackId >= 0) {
          expect(gridPackId).toBeLessThan(world.packCellCount);
          expect(coast).toBeLessThan(0);
        }
        expect(landmass).toBe(0);
        expect(waterbody).toBeGreaterThan(0);
        const bodyType = world.waterbodyType[waterbody];
        expect(bodyType === 1 || bodyType === 2).toBe(true);
        expect(featureId).toBe(waterbody);
      } else {
        expect(gridPackId).toBeGreaterThanOrEqual(0);
        expect(gridPackId).toBeLessThan(world.packCellCount);
        expect(landmass).toBeGreaterThan(0);
        const massKind = world.landmassKind[landmass];
        expect(massKind === 1 || massKind === 2 || massKind === 3).toBe(true);
        expect(waterbody).toBe(0);
        expect(featureId).toBe(world.waterbodyCount + landmass);
      }

      expect(vertexTo).toBeGreaterThan(vertexFrom);
      expect(vertexTo - vertexFrom).toBeGreaterThanOrEqual(3);

      for (let i = vertexFrom; i < vertexTo; i += 1) {
        const vertexId = world.cellVertices[i];
        if (vertexId === undefined) {
          throw new Error("missing cell vertex id");
        }

        expect(vertexId).toBeGreaterThanOrEqual(0);
        expect(vertexId).toBeLessThan(world.vertexX.length);
      }

      const neighbors = collectNeighbors(world, index);
      expect(neighbors.length).toBeGreaterThanOrEqual(border === 1 ? 2 : 3);
      expect(neighbors.length).toBeLessThanOrEqual(24);

      for (const neighbor of neighbors) {
        expect(neighbor).toBeGreaterThanOrEqual(0);
        expect(neighbor).toBeLessThan(world.cellCount);
      }
    }

    const areaSum = Array.from(world.cellsArea).reduce(
      (sum, value) => sum + value,
      0,
    );
    const targetArea = world.width * world.height;
    expect(areaSum).toBeGreaterThan(targetArea * 0.9);
    expect(areaSum).toBeLessThan(targetArea * 1.1);

    for (let cellId = 0; cellId < world.cellCount; cellId += 1) {
      const neighbors = collectNeighbors(world, cellId);

      for (const neighborId of neighbors) {
        const reverse = collectNeighbors(world, neighborId);
        expect(reverse.includes(cellId)).toBe(true);
      }
    }

    let accountedWaterCells = 0;
    let oceanBodies = 0;
    let accountedLandCells = 0;
    let continents = 0;
    let majorLandmasses = 0;

    for (
      let waterbodyId = 1;
      waterbodyId <= world.waterbodyCount;
      waterbodyId += 1
    ) {
      const size = world.waterbodySize[waterbodyId] ?? 0;
      const kind = world.waterbodyType[waterbodyId] ?? 0;

      expect(size).toBeGreaterThan(0);
      expect(kind === 1 || kind === 2).toBe(true);

      if (kind === 1) {
        oceanBodies += 1;
      }

      accountedWaterCells += size;
    }

    expect(oceanBodies).toBeGreaterThan(0);
    expect(accountedWaterCells).toBe(waterCells);

    for (
      let landmassId = 1;
      landmassId <= world.landmassCount;
      landmassId += 1
    ) {
      const size = world.landmassSize[landmassId] ?? 0;
      const kind = world.landmassKind[landmassId] ?? 0;
      const border = world.landmassBorder[landmassId] ?? 0;

      expect(size).toBeGreaterThan(0);
      expect(kind === 1 || kind === 2 || kind === 3).toBe(true);
      expect(border === 0 || border === 1).toBe(true);

      if (kind === 1) {
        continents += 1;
      }
      if (kind === 1 || kind === 2) {
        majorLandmasses += 1;
      }

      accountedLandCells += size;
    }

    expect(majorLandmasses).toBeGreaterThan(0);
    expect(accountedLandCells).toBe(landCells);

    let accountedFeatureCells = 0;
    for (let featureId = 1; featureId <= world.featureCount; featureId += 1) {
      const type = world.featureType[featureId] ?? 0;
      const land = world.featureLand[featureId] ?? 0;
      const border = world.featureBorder[featureId] ?? 0;
      const size = world.featureSize[featureId] ?? 0;
      const firstCell = world.featureFirstCell[featureId] ?? 0;

      expect(type === 1 || type === 2 || type === 3).toBe(true);
      expect(land === 0 || land === 1).toBe(true);
      expect(border === 0 || border === 1).toBe(true);
      expect(size).toBeGreaterThan(0);
      expect(firstCell).toBeGreaterThanOrEqual(0);
      expect(firstCell).toBeLessThan(world.cellCount);
      expect(world.cellsFeatureId[firstCell]).toBe(featureId);

      if (land === 1) {
        expect(type).toBe(3);
      } else {
        expect(type === 1 || type === 2).toBe(true);
      }

      accountedFeatureCells += size;
    }

    expect(accountedFeatureCells).toBe(world.cellCount);

    let summedPackArea = 0;
    let summedPrimaryLandPackArea = 0;

    for (let packId = 0; packId < world.packCellCount; packId += 1) {
      const gridCellId = world.packToGrid[packId];
      const x = world.packX[packId];
      const y = world.packY[packId];
      const h = world.packH[packId];
      const area = world.packArea[packId];
      const packFeatureId = world.packCellsFeatureId[packId];
      const packCoast = world.packCoast[packId];
      const packHaven = world.packHaven[packId];
      const packHarbor = world.packHarbor[packId];

      if (
        gridCellId === undefined ||
        x === undefined ||
        y === undefined ||
        h === undefined ||
        area === undefined ||
        packFeatureId === undefined ||
        packCoast === undefined ||
        packHaven === undefined ||
        packHarbor === undefined
      ) {
        throw new Error("expected packed cell attributes to exist");
      }

      expect(gridCellId).toBeGreaterThanOrEqual(0);
      expect(gridCellId).toBeLessThan(world.cellCount);
      expect(packFeatureId).toBeGreaterThan(0);
      expect(packFeatureId).toBeLessThanOrEqual(world.packFeatureCount);
      expect(packCoast).toBeGreaterThanOrEqual(-10);
      expect(packCoast).toBeLessThanOrEqual(10);

      if ((world.cellsCoast[gridCellId] ?? 0) <= 1) {
        if (packHarbor > 0) {
          expect(packHaven).toBeGreaterThanOrEqual(0);
          expect(packHaven).toBeLessThan(world.cellCount);
          expect(world.cellsFeature[packHaven]).toBe(0);
        }
      }

      const gridX = world.cellsX[gridCellId];
      const gridY = world.cellsY[gridCellId];
      const gridH = world.cellsH[gridCellId];

      if (gridX === undefined || gridY === undefined || gridH === undefined) {
        throw new Error("expected referenced grid attributes to exist");
      }

      const isPrimaryPackCell = x === gridX && y === gridY;
      if (isPrimaryPackCell) {
        expect(world.gridToPack[gridCellId]).toBe(packId);
      }
      expect(h).toBe(gridH);
      expect(area).toBeGreaterThan(0);

      summedPackArea += area;
      if (isPrimaryPackCell && (world.cellsFeature[gridCellId] ?? 0) === 1) {
        summedPrimaryLandPackArea += area;
      }

      const packNeighbors = collectPackNeighbors(world, packId);
      for (const neighborId of packNeighbors) {
        expect(neighborId).toBeGreaterThanOrEqual(0);
        expect(neighborId).toBeLessThan(world.packCellCount);
        const reverse = collectPackNeighbors(world, neighborId);
        expect(reverse.includes(packId)).toBe(true);
      }
    }

    const landArea = Array.from(world.cellsArea).reduce((sum, value, index) => {
      if ((world.cellsFeature[index] ?? 0) === 1) {
        return sum + value;
      }
      return sum;
    }, 0);
    expect(summedPrimaryLandPackArea).toBeCloseTo(landArea, 5);
    expect(summedPackArea).toBeGreaterThanOrEqual(summedPrimaryLandPackArea);

    let accountedPackFeatureCells = 0;
    let packLandFeatures = 0;
    let packWaterFeatures = 0;
    for (
      let packFeatureId = 1;
      packFeatureId <= world.packFeatureCount;
      packFeatureId += 1
    ) {
      const type = world.packFeatureType[packFeatureId] ?? 0;
      const border = world.packFeatureBorder[packFeatureId] ?? 0;
      const size = world.packFeatureSize[packFeatureId] ?? 0;
      const firstPackCell = world.packFeatureFirstCell[packFeatureId] ?? 0;

      expect(type === 1 || type === 2 || type === 3).toBe(true);
      expect(border === 0 || border === 1).toBe(true);
      expect(size).toBeGreaterThan(0);
      expect(firstPackCell).toBeGreaterThanOrEqual(0);
      expect(firstPackCell).toBeLessThan(world.packCellCount);
      expect(world.packCellsFeatureId[firstPackCell]).toBe(packFeatureId);

      const firstGridCell = world.packToGrid[firstPackCell] ?? 0;
      if (type === 3) {
        expect(world.cellsFeature[firstGridCell]).toBe(1);
        packLandFeatures += 1;
      } else {
        expect(world.cellsFeature[firstGridCell]).toBe(0);
        packWaterFeatures += 1;
      }

      accountedPackFeatureCells += size;
    }

    expect(accountedPackFeatureCells).toBe(world.packCellCount);
    expect(packLandFeatures).toBeGreaterThan(0);
    expect(packWaterFeatures).toBeGreaterThan(0);
  });

  test("is deterministic for same seed and config", () => {
    const worldA = generateWorld(baseConfig);
    const worldB = generateWorld(baseConfig);

    expect(worldA.cellCount).toBe(worldB.cellCount);
    expect(worldA.gridCellsX).toBe(worldB.gridCellsX);
    expect(worldA.gridCellsY).toBe(worldB.gridCellsY);
    expect(worldA.gridSpacing).toBe(worldB.gridSpacing);

    expect(Array.from(worldA.cellsX)).toEqual(Array.from(worldB.cellsX));
    expect(Array.from(worldA.cellsY)).toEqual(Array.from(worldB.cellsY));
    expect(Array.from(worldA.cellsBorder)).toEqual(
      Array.from(worldB.cellsBorder),
    );
    expect(Array.from(worldA.cellsArea)).toEqual(Array.from(worldB.cellsArea));
    expect(Array.from(worldA.cellsH)).toEqual(Array.from(worldB.cellsH));
    expect(Array.from(worldA.cellsCulture)).toEqual(
      Array.from(worldB.cellsCulture),
    );
    expect(worldA.cultureCount).toBe(worldB.cultureCount);
    expect(Array.from(worldA.cultureSeedCell)).toEqual(
      Array.from(worldB.cultureSeedCell),
    );
    expect(Array.from(worldA.cultureSize)).toEqual(
      Array.from(worldB.cultureSize),
    );
    expect(Array.from(worldA.cellsBurg)).toEqual(Array.from(worldB.cellsBurg));
    expect(worldA.burgCount).toBe(worldB.burgCount);
    expect(Array.from(worldA.burgCell)).toEqual(Array.from(worldB.burgCell));
    expect(Array.from(worldA.burgPopulation)).toEqual(
      Array.from(worldB.burgPopulation),
    );
    expect(Array.from(worldA.burgPort)).toEqual(Array.from(worldB.burgPort));
    expect(Array.from(worldA.burgCulture)).toEqual(
      Array.from(worldB.burgCulture),
    );
    expect(Array.from(worldA.cellsState)).toEqual(
      Array.from(worldB.cellsState),
    );
    expect(worldA.stateCount).toBe(worldB.stateCount);
    expect(Array.from(worldA.stateCenterBurg)).toEqual(
      Array.from(worldB.stateCenterBurg),
    );
    expect(Array.from(worldA.stateCulture)).toEqual(
      Array.from(worldB.stateCulture),
    );
    expect(Array.from(worldA.stateForm)).toEqual(Array.from(worldB.stateForm));
    expect(Array.from(worldA.stateCells)).toEqual(
      Array.from(worldB.stateCells),
    );
    expect(worldA.routeCount).toBe(worldB.routeCount);
    expect(Array.from(worldA.routeFromState)).toEqual(
      Array.from(worldB.routeFromState),
    );
    expect(Array.from(worldA.routeToState)).toEqual(
      Array.from(worldB.routeToState),
    );
    expect(Array.from(worldA.routeKind)).toEqual(Array.from(worldB.routeKind));
    expect(Array.from(worldA.routeWeight)).toEqual(
      Array.from(worldB.routeWeight),
    );
    expect(Array.from(worldA.cellsProvince)).toEqual(
      Array.from(worldB.cellsProvince),
    );
    expect(worldA.provinceCount).toBe(worldB.provinceCount);
    expect(Array.from(worldA.provinceState)).toEqual(
      Array.from(worldB.provinceState),
    );
    expect(Array.from(worldA.provinceCenterCell)).toEqual(
      Array.from(worldB.provinceCenterCell),
    );
    expect(Array.from(worldA.provinceCells)).toEqual(
      Array.from(worldB.provinceCells),
    );
    expect(Array.from(worldA.cellsReligion)).toEqual(
      Array.from(worldB.cellsReligion),
    );
    expect(worldA.religionCount).toBe(worldB.religionCount);
    expect(Array.from(worldA.religionSeedCell)).toEqual(
      Array.from(worldB.religionSeedCell),
    );
    expect(Array.from(worldA.religionType)).toEqual(
      Array.from(worldB.religionType),
    );
    expect(Array.from(worldA.religionSize)).toEqual(
      Array.from(worldB.religionSize),
    );
    expect(Array.from(worldA.cellsMilitary)).toEqual(
      Array.from(worldB.cellsMilitary),
    );
    expect(worldA.militaryCount).toBe(worldB.militaryCount);
    expect(Array.from(worldA.militaryCell)).toEqual(
      Array.from(worldB.militaryCell),
    );
    expect(Array.from(worldA.militaryState)).toEqual(
      Array.from(worldB.militaryState),
    );
    expect(Array.from(worldA.militaryType)).toEqual(
      Array.from(worldB.militaryType),
    );
    expect(Array.from(worldA.militaryStrength)).toEqual(
      Array.from(worldB.militaryStrength),
    );
    expect(worldA.markerCount).toBe(worldB.markerCount);
    expect(Array.from(worldA.markerCell)).toEqual(
      Array.from(worldB.markerCell),
    );
    expect(Array.from(worldA.markerType)).toEqual(
      Array.from(worldB.markerType),
    );
    expect(Array.from(worldA.markerStrength)).toEqual(
      Array.from(worldB.markerStrength),
    );
    expect(Array.from(worldA.cellsZone)).toEqual(Array.from(worldB.cellsZone));
    expect(worldA.zoneCount).toBe(worldB.zoneCount);
    expect(Array.from(worldA.zoneSeedCell)).toEqual(
      Array.from(worldB.zoneSeedCell),
    );
    expect(Array.from(worldA.zoneType)).toEqual(Array.from(worldB.zoneType));
    expect(Array.from(worldA.zoneCells)).toEqual(Array.from(worldB.zoneCells));
    expect(Array.from(worldA.cellsFeature)).toEqual(
      Array.from(worldB.cellsFeature),
    );
    expect(Array.from(worldA.cellsFeatureId)).toEqual(
      Array.from(worldB.cellsFeatureId),
    );
    expect(worldA.featureCount).toBe(worldB.featureCount);
    expect(Array.from(worldA.featureType)).toEqual(
      Array.from(worldB.featureType),
    );
    expect(Array.from(worldA.featureLand)).toEqual(
      Array.from(worldB.featureLand),
    );
    expect(Array.from(worldA.featureBorder)).toEqual(
      Array.from(worldB.featureBorder),
    );
    expect(Array.from(worldA.featureSize)).toEqual(
      Array.from(worldB.featureSize),
    );
    expect(Array.from(worldA.featureFirstCell)).toEqual(
      Array.from(worldB.featureFirstCell),
    );
    expect(Array.from(worldA.cellsCoast)).toEqual(
      Array.from(worldB.cellsCoast),
    );
    expect(Array.from(worldA.cellsLandmass)).toEqual(
      Array.from(worldB.cellsLandmass),
    );
    expect(worldA.landmassCount).toBe(worldB.landmassCount);
    expect(Array.from(worldA.landmassKind)).toEqual(
      Array.from(worldB.landmassKind),
    );
    expect(Array.from(worldA.landmassSize)).toEqual(
      Array.from(worldB.landmassSize),
    );
    expect(Array.from(worldA.landmassBorder)).toEqual(
      Array.from(worldB.landmassBorder),
    );
    expect(Array.from(worldA.cellsTemp)).toEqual(Array.from(worldB.cellsTemp));
    expect(Array.from(worldA.cellsPrec)).toEqual(Array.from(worldB.cellsPrec));
    expect(Array.from(worldA.cellsFlow)).toEqual(Array.from(worldB.cellsFlow));
    expect(Array.from(worldA.cellsRiver)).toEqual(
      Array.from(worldB.cellsRiver),
    );
    expect(Array.from(worldA.cellsBiome)).toEqual(
      Array.from(worldB.cellsBiome),
    );
    expect(Array.from(worldA.cellsWaterbody)).toEqual(
      Array.from(worldB.cellsWaterbody),
    );
    expect(worldA.waterbodyCount).toBe(worldB.waterbodyCount);
    expect(Array.from(worldA.waterbodyType)).toEqual(
      Array.from(worldB.waterbodyType),
    );
    expect(Array.from(worldA.waterbodySize)).toEqual(
      Array.from(worldB.waterbodySize),
    );
    expect(worldA.packCellCount).toBe(worldB.packCellCount);
    expect(Array.from(worldA.gridToPack)).toEqual(
      Array.from(worldB.gridToPack),
    );
    expect(Array.from(worldA.packToGrid)).toEqual(
      Array.from(worldB.packToGrid),
    );
    expect(Array.from(worldA.packX)).toEqual(Array.from(worldB.packX));
    expect(Array.from(worldA.packY)).toEqual(Array.from(worldB.packY));
    expect(Array.from(worldA.packH)).toEqual(Array.from(worldB.packH));
    expect(Array.from(worldA.packArea)).toEqual(Array.from(worldB.packArea));
    expect(Array.from(worldA.packNeighborOffsets)).toEqual(
      Array.from(worldB.packNeighborOffsets),
    );
    expect(Array.from(worldA.packNeighbors)).toEqual(
      Array.from(worldB.packNeighbors),
    );
    expect(Array.from(worldA.packCellsFeatureId)).toEqual(
      Array.from(worldB.packCellsFeatureId),
    );
    expect(worldA.packFeatureCount).toBe(worldB.packFeatureCount);
    expect(Array.from(worldA.packFeatureType)).toEqual(
      Array.from(worldB.packFeatureType),
    );
    expect(Array.from(worldA.packFeatureBorder)).toEqual(
      Array.from(worldB.packFeatureBorder),
    );
    expect(Array.from(worldA.packFeatureSize)).toEqual(
      Array.from(worldB.packFeatureSize),
    );
    expect(Array.from(worldA.packFeatureFirstCell)).toEqual(
      Array.from(worldB.packFeatureFirstCell),
    );
    expect(Array.from(worldA.packCoast)).toEqual(Array.from(worldB.packCoast));
    expect(Array.from(worldA.packHaven)).toEqual(Array.from(worldB.packHaven));
    expect(Array.from(worldA.packHarbor)).toEqual(
      Array.from(worldB.packHarbor),
    );
    expect(Array.from(worldA.vertexX)).toEqual(Array.from(worldB.vertexX));
    expect(Array.from(worldA.vertexY)).toEqual(Array.from(worldB.vertexY));
    expect(Array.from(worldA.cellVertexOffsets)).toEqual(
      Array.from(worldB.cellVertexOffsets),
    );
    expect(Array.from(worldA.cellVertices)).toEqual(
      Array.from(worldB.cellVertices),
    );
    expect(Array.from(worldA.cellNeighborOffsets)).toEqual(
      Array.from(worldB.cellNeighborOffsets),
    );
    expect(Array.from(worldA.cellNeighbors)).toEqual(
      Array.from(worldB.cellNeighbors),
    );
  });

  test("responds to high-level generation knobs", () => {
    const lowNoise = generateWorld({ ...baseConfig, heightNoise: 0.05 });
    const highNoise = generateWorld({ ...baseConfig, heightNoise: 0.9 });
    const noJitter = generateWorld({ ...baseConfig, jitter: 0 });
    const maxJitter = generateWorld({ ...baseConfig, jitter: 1 });
    const archipelago = generateWorld({
      ...baseConfig,
      heightTemplate: "archipelago",
    });
    const inlandSea = generateWorld({
      ...baseConfig,
      heightTemplate: "inland-sea",
    });

    expect(Array.from(lowNoise.cellsH)).not.toEqual(
      Array.from(highNoise.cellsH),
    );
    expect(Array.from(noJitter.cellsX)).not.toEqual(
      Array.from(maxJitter.cellsX),
    );
    expect(Array.from(noJitter.cellsY)).not.toEqual(
      Array.from(maxJitter.cellsY),
    );
    expect(Array.from(lowNoise.cellsFeature)).not.toEqual(
      Array.from(highNoise.cellsFeature),
    );
    expect(Array.from(lowNoise.cellsTemp)).not.toEqual(
      Array.from(highNoise.cellsTemp),
    );
    expect(Array.from(archipelago.cellsH)).not.toEqual(
      Array.from(inlandSea.cellsH),
    );
  });

  test("keeps oracle-query terrain placement stable", () => {
    const world = generateWorld({
      seed: "42424242",
      width: 1280,
      height: 900,
      cells: 9996,
      culturesCount: 9,
      statesCount: 23,
      townsCount: 1000,
      climate: {
        lakeElevationLimit: 20,
        precipitation: 94,
        mapSize: 100,
        latitude: 50,
        longitude: 50,
      },
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    const terrainHash = createHash("sha256").update(world.cellsH).digest("hex");

    expect(terrainHash).toBe(
      "3748d749be0d6c1ac1bc8e23cb4656ca330e25707d16fb5e13313fcdf3373a17",
    );
    expect(world.landmassCount).toBe(8);
    expect(world.waterbodyCount).toBe(2);
  });

  test("generates deterministic cultures when culture layer is enabled", () => {
    const withCulturesA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
      },
      culturesCount: 10,
    });

    const withCulturesB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
      },
      culturesCount: 10,
    });

    expect(withCulturesA.cultureCount).toBeGreaterThan(0);
    expect(withCulturesA.cultureCount).toBeLessThanOrEqual(10);
    expect(withCulturesA.cultureSeedCell.length).toBe(
      withCulturesA.cultureCount + 1,
    );
    expect(withCulturesA.cultureSize.length).toBe(
      withCulturesA.cultureCount + 1,
    );

    let landCells = 0;
    let assignedLand = 0;
    let waterAssigned = 0;

    for (let cellId = 0; cellId < withCulturesA.cellCount; cellId += 1) {
      const isLand = (withCulturesA.cellsFeature[cellId] ?? 0) === 1;
      const culture = withCulturesA.cellsCulture[cellId] ?? 0;

      if (isLand) {
        landCells += 1;
        if (culture > 0) {
          assignedLand += 1;
        }
      } else if (culture > 0) {
        waterAssigned += 1;
      }
    }

    expect(assignedLand).toBe(landCells);
    expect(waterAssigned).toBe(0);

    const sumCultureSize = Array.from(withCulturesA.cultureSize).reduce(
      (sum, value, index) => {
        if (index === 0) {
          return sum;
        }
        return sum + value;
      },
      0,
    );
    expect(sumCultureSize).toBe(landCells);

    for (
      let cultureId = 1;
      cultureId <= withCulturesA.cultureCount;
      cultureId += 1
    ) {
      const seedCell = withCulturesA.cultureSeedCell[cultureId] ?? 0;
      expect(seedCell).toBeGreaterThanOrEqual(0);
      expect(seedCell).toBeLessThan(withCulturesA.cellCount);
      expect(withCulturesA.cellsFeature[seedCell]).toBe(1);
      expect(withCulturesA.cellsCulture[seedCell]).toBe(cultureId);
      expect((withCulturesA.cultureSize[cultureId] ?? 0) > 0).toBe(true);
    }

    expect(Array.from(withCulturesA.cellsCulture)).toEqual(
      Array.from(withCulturesB.cellsCulture),
    );
    expect(Array.from(withCulturesA.cultureSeedCell)).toEqual(
      Array.from(withCulturesB.cultureSeedCell),
    );
    expect(Array.from(withCulturesA.cultureSize)).toEqual(
      Array.from(withCulturesB.cultureSize),
    );
  });

  test("keeps oracle-query culture placement stable", () => {
    const world = generateWorld({
      seed: "42424242",
      width: 1280,
      height: 900,
      cells: 9996,
      culturesCount: 9,
      statesCount: 23,
      townsCount: 1000,
      hiddenControls: {
        sizeVariety: 7.5,
        growthRate: 1.6,
        religionsNumber: 7,
      },
      climate: {
        lakeElevationLimit: 20,
        precipitation: 94,
        mapSize: 100,
        latitude: 50,
        longitude: 50,
      },
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(world.cultureCount).toBe(9);
    expect(createHash("sha256").update(world.cellsCulture).digest("hex")).toBe(
      "1c6dd7f235179a8ffd6269eb451d6f75f272843979f0c7eff6f724193a21ada6",
    );
    expect(
      createHash("sha256").update(world.cultureSeedCell).digest("hex"),
    ).toBe("872f979d9aa4e462f1b811e69e149729cef4861419eebb23dde3cf8eca0afa83");
    expect(createHash("sha256").update(world.cultureSize).digest("hex")).toBe(
      "ae7fc34309a0371c191c323ac502afb83325c6098e5ca09838bbbee2b2327fb4",
    );
  });

  test("generates deterministic burgs when settlements layer is enabled", () => {
    const withSettlementsA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
      },
    });

    const withSettlementsB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
      },
    });

    expect(withSettlementsA.burgCount).toBeGreaterThan(0);
    expect(withSettlementsA.burgCell.length).toBe(
      withSettlementsA.burgCount + 1,
    );
    expect(withSettlementsA.burgPopulation.length).toBe(
      withSettlementsA.burgCount + 1,
    );
    expect(withSettlementsA.burgX.length).toBe(withSettlementsA.burgCount + 1);
    expect(withSettlementsA.burgY.length).toBe(withSettlementsA.burgCount + 1);
    expect(withSettlementsA.burgCapital.length).toBe(
      withSettlementsA.burgCount + 1,
    );
    expect(withSettlementsA.burgPort.length).toBe(
      withSettlementsA.burgCount + 1,
    );
    expect(withSettlementsA.burgCulture.length).toBe(
      withSettlementsA.burgCount + 1,
    );

    let assignedBurgCells = 0;
    let portCount = 0;

    for (let cellId = 0; cellId < withSettlementsA.cellCount; cellId += 1) {
      const burgId = withSettlementsA.cellsBurg[cellId] ?? 0;
      if (burgId === 0) {
        continue;
      }

      assignedBurgCells += 1;
      expect(burgId).toBeGreaterThan(0);
      expect(burgId).toBeLessThanOrEqual(withSettlementsA.burgCount);
      expect(withSettlementsA.cellsFeature[cellId]).toBe(1);
      expect(withSettlementsA.burgCell[burgId]).toBe(cellId);
      expect((withSettlementsA.burgPopulation[burgId] ?? 0) > 0).toBe(true);
      expect(
        Number.isFinite(withSettlementsA.burgX[burgId] ?? Number.NaN),
      ).toBe(true);
      expect(
        Number.isFinite(withSettlementsA.burgY[burgId] ?? Number.NaN),
      ).toBe(true);

      const isPort = (withSettlementsA.burgPort[burgId] ?? 0) === 1;
      if (isPort) {
        portCount += 1;
      }
    }

    expect(assignedBurgCells).toBe(withSettlementsA.burgCount);
    expect(portCount).toBeGreaterThan(0);

    expect(Array.from(withSettlementsA.cellsBurg)).toEqual(
      Array.from(withSettlementsB.cellsBurg),
    );
    expect(withSettlementsA.burgCount).toBe(withSettlementsB.burgCount);
    expect(Array.from(withSettlementsA.burgCell)).toEqual(
      Array.from(withSettlementsB.burgCell),
    );
    expect(Array.from(withSettlementsA.burgPopulation)).toEqual(
      Array.from(withSettlementsB.burgPopulation),
    );
    expect(Array.from(withSettlementsA.burgX)).toEqual(
      Array.from(withSettlementsB.burgX),
    );
    expect(Array.from(withSettlementsA.burgY)).toEqual(
      Array.from(withSettlementsB.burgY),
    );
    expect(Array.from(withSettlementsA.burgCapital)).toEqual(
      Array.from(withSettlementsB.burgCapital),
    );
    expect(Array.from(withSettlementsA.burgPort)).toEqual(
      Array.from(withSettlementsB.burgPort),
    );
    expect(Array.from(withSettlementsA.burgCulture)).toEqual(
      Array.from(withSettlementsB.burgCulture),
    );
  });

  test("treats townsCount 1000 as upstream auto mode", () => {
    const autoSettlements = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
      },
    });

    const sentinelSettlements = generateWorld({
      ...baseConfig,
      townsCount: 1000,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
      },
    });

    expect(sentinelSettlements.burgCount).toBe(autoSettlements.burgCount);
    expect(Array.from(sentinelSettlements.cellsBurg)).toEqual(
      Array.from(autoSettlements.cellsBurg),
    );
    expect(Array.from(sentinelSettlements.burgCell)).toEqual(
      Array.from(autoSettlements.burgCell),
    );
    expect(Array.from(sentinelSettlements.burgX)).toEqual(
      Array.from(autoSettlements.burgX),
    );
    expect(Array.from(sentinelSettlements.burgY)).toEqual(
      Array.from(autoSettlements.burgY),
    );
  });

  test("generates deterministic states when politics layer is enabled", () => {
    const withPoliticsA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        politics: true,
      },
      culturesCount: 10,
    });

    const withPoliticsB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        politics: true,
      },
      culturesCount: 10,
    });

    expect(withPoliticsA.burgCount).toBeGreaterThan(0);
    expect(withPoliticsA.stateCount).toBeGreaterThan(0);
    expect(withPoliticsA.stateCount).toBeLessThanOrEqual(
      withPoliticsA.burgCount,
    );
    expect(withPoliticsA.stateCenterBurg.length).toBe(
      withPoliticsA.stateCount + 1,
    );
    expect(withPoliticsA.stateCulture.length).toBe(
      withPoliticsA.stateCount + 1,
    );
    expect(withPoliticsA.stateForm.length).toBe(withPoliticsA.stateCount + 1);
    expect(withPoliticsA.stateCells.length).toBe(withPoliticsA.stateCount + 1);
    expect(withPoliticsA.routeCount).toBeGreaterThan(0);
    expect(withPoliticsA.routeFromState.length).toBe(
      withPoliticsA.routeCount + 1,
    );
    expect(withPoliticsA.routeToState.length).toBe(
      withPoliticsA.routeCount + 1,
    );
    expect(withPoliticsA.routeKind.length).toBe(withPoliticsA.routeCount + 1);
    expect(withPoliticsA.routeWeight.length).toBe(withPoliticsA.routeCount + 1);
    expect(withPoliticsA.provinceCount).toBeGreaterThanOrEqual(
      withPoliticsA.stateCount,
    );
    expect(withPoliticsA.provinceState.length).toBe(
      withPoliticsA.provinceCount + 1,
    );
    expect(withPoliticsA.provinceCenterCell.length).toBe(
      withPoliticsA.provinceCount + 1,
    );
    expect(withPoliticsA.provinceCells.length).toBe(
      withPoliticsA.provinceCount + 1,
    );

    let landCells = 0;
    let assignedLand = 0;
    let assignedProvinceLand = 0;
    let assignedWater = 0;
    let stateCellSum = 0;
    const stateAssignedLand = new Uint32Array(withPoliticsA.stateCount + 1);
    const stateProvincialLand = new Uint32Array(withPoliticsA.stateCount + 1);
    const stateProvinceCount = new Uint16Array(withPoliticsA.stateCount + 1);

    for (let cellId = 0; cellId < withPoliticsA.cellCount; cellId += 1) {
      const isLand = (withPoliticsA.cellsFeature[cellId] ?? 0) === 1;
      const stateId = withPoliticsA.cellsState[cellId] ?? 0;

      if (isLand) {
        landCells += 1;
        if (stateId > 0) {
          assignedLand += 1;
          stateAssignedLand[stateId] = (stateAssignedLand[stateId] ?? 0) + 1;
          expect(stateId).toBeLessThanOrEqual(withPoliticsA.stateCount);
        }
      } else {
        if (stateId > 0) {
          assignedWater += 1;
        }
      }

      const provinceId = withPoliticsA.cellsProvince[cellId] ?? 0;
      if (provinceId > 0) {
        expect(isLand).toBe(true);
        expect(stateId).toBeGreaterThan(0);
        expect(provinceId).toBeLessThanOrEqual(withPoliticsA.provinceCount);
        expect(withPoliticsA.provinceState[provinceId]).toBe(stateId);
        assignedProvinceLand += 1;
        stateProvincialLand[stateId] = (stateProvincialLand[stateId] ?? 0) + 1;
      }
    }

    expect(assignedWater).toBe(0);
    expect(assignedLand).toBeGreaterThan(0);

    for (let stateId = 1; stateId <= withPoliticsA.stateCount; stateId += 1) {
      const centerBurgId = withPoliticsA.stateCenterBurg[stateId] ?? 0;
      const cultureId = withPoliticsA.stateCulture[stateId] ?? 0;
      const form = withPoliticsA.stateForm[stateId] ?? 0;
      const size = withPoliticsA.stateCells[stateId] ?? 0;

      expect(centerBurgId).toBeGreaterThan(0);
      expect(centerBurgId).toBeLessThanOrEqual(withPoliticsA.burgCount);
      expect(form === 1 || form === 2 || form === 3).toBe(true);
      expect(size).toBeGreaterThan(0);
      expect(cultureId).toBeGreaterThanOrEqual(0);
      expect(cultureId).toBeLessThanOrEqual(withPoliticsA.cultureCount);

      const capitalCell = withPoliticsA.burgCell[centerBurgId] ?? 0;
      expect(capitalCell).toBeGreaterThanOrEqual(0);
      expect(capitalCell).toBeLessThan(withPoliticsA.cellCount);
      expect(withPoliticsA.cellsState[capitalCell]).toBe(stateId);

      stateCellSum += size;
    }

    expect(stateCellSum).toBe(assignedLand);

    for (let routeId = 1; routeId <= withPoliticsA.routeCount; routeId += 1) {
      const from = withPoliticsA.routeFromState[routeId] ?? 0;
      const to = withPoliticsA.routeToState[routeId] ?? 0;
      const kind = withPoliticsA.routeKind[routeId] ?? 0;
      const weight = withPoliticsA.routeWeight[routeId] ?? 0;

      expect(from).toBeGreaterThan(0);
      expect(from).toBeLessThanOrEqual(withPoliticsA.stateCount);
      expect(to).toBeGreaterThan(0);
      expect(to).toBeLessThanOrEqual(withPoliticsA.stateCount);
      expect(from).not.toBe(to);
      expect(kind).toBe(1);
      expect(weight).toBeGreaterThan(0);
    }

    let provinceCellSum = 0;
    for (
      let provinceId = 1;
      provinceId <= withPoliticsA.provinceCount;
      provinceId += 1
    ) {
      const stateId = withPoliticsA.provinceState[provinceId] ?? 0;
      const centerCell = withPoliticsA.provinceCenterCell[provinceId] ?? 0;
      const size = withPoliticsA.provinceCells[provinceId] ?? 0;

      expect(stateId).toBeGreaterThan(0);
      expect(stateId).toBeLessThanOrEqual(withPoliticsA.stateCount);
      expect(centerCell).toBeGreaterThanOrEqual(0);
      expect(centerCell).toBeLessThan(withPoliticsA.cellCount);
      expect(size).toBeGreaterThan(0);
      expect(withPoliticsA.cellsState[centerCell]).toBe(stateId);

      stateProvinceCount[stateId] = (stateProvinceCount[stateId] ?? 0) + 1;
      provinceCellSum += size;
    }

    expect(provinceCellSum).toBe(assignedProvinceLand);

    for (let stateId = 1; stateId <= withPoliticsA.stateCount; stateId += 1) {
      if ((stateProvinceCount[stateId] ?? 0) > 0) {
        expect(stateProvincialLand[stateId]).toBe(stateAssignedLand[stateId]);
      } else {
        expect(stateProvincialLand[stateId]).toBe(0);
      }
    }

    expect(Array.from(withPoliticsA.cellsState)).toEqual(
      Array.from(withPoliticsB.cellsState),
    );
    expect(withPoliticsA.stateCount).toBe(withPoliticsB.stateCount);
    expect(Array.from(withPoliticsA.stateCenterBurg)).toEqual(
      Array.from(withPoliticsB.stateCenterBurg),
    );
    expect(Array.from(withPoliticsA.stateCulture)).toEqual(
      Array.from(withPoliticsB.stateCulture),
    );
    expect(Array.from(withPoliticsA.stateForm)).toEqual(
      Array.from(withPoliticsB.stateForm),
    );
    expect(Array.from(withPoliticsA.stateCells)).toEqual(
      Array.from(withPoliticsB.stateCells),
    );
    expect(withPoliticsA.routeCount).toBe(withPoliticsB.routeCount);
    expect(Array.from(withPoliticsA.routeFromState)).toEqual(
      Array.from(withPoliticsB.routeFromState),
    );
    expect(Array.from(withPoliticsA.routeToState)).toEqual(
      Array.from(withPoliticsB.routeToState),
    );
    expect(Array.from(withPoliticsA.routeKind)).toEqual(
      Array.from(withPoliticsB.routeKind),
    );
    expect(Array.from(withPoliticsA.routeWeight)).toEqual(
      Array.from(withPoliticsB.routeWeight),
    );
    expect(Array.from(withPoliticsA.cellsProvince)).toEqual(
      Array.from(withPoliticsB.cellsProvince),
    );
    expect(withPoliticsA.provinceCount).toBe(withPoliticsB.provinceCount);
    expect(Array.from(withPoliticsA.provinceState)).toEqual(
      Array.from(withPoliticsB.provinceState),
    );
    expect(Array.from(withPoliticsA.provinceCenterCell)).toEqual(
      Array.from(withPoliticsB.provinceCenterCell),
    );
    expect(Array.from(withPoliticsA.provinceCells)).toEqual(
      Array.from(withPoliticsB.provinceCells),
    );
  });

  test("keeps oracle-query settlement and politics placement stable", () => {
    const world = generateWorld({
      seed: "42424242",
      width: 1280,
      height: 900,
      cells: 9996,
      culturesCount: 9,
      statesCount: 23,
      townsCount: 1000,
      hiddenControls: {
        sizeVariety: 7.5,
        growthRate: 1.6,
        religionsNumber: 7,
      },
      climate: {
        lakeElevationLimit: 20,
        precipitation: 94,
        mapSize: 100,
        latitude: 50,
        longitude: 50,
      },
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(world.burgCount).toBe(656);
    expect(createHash("sha256").update(world.cellsBurg).digest("hex")).toBe(
      "aa1898def23338556c4bacab2b39997ffee28f280677f7da4288a0c5f769aeb5",
    );
    expect(createHash("sha256").update(world.burgCell).digest("hex")).toBe(
      "5e161e38125095adb6f80ecdad5e3bb22e52cd6147ea3d6b7fc3739d431dbda2",
    );
    expect(createHash("sha256").update(world.burgX).digest("hex")).toBe(
      "1a3a5ee43d94a8694bd25fc7cbdbcfdceec27ac8e320a835ee1acdf572bb930b",
    );
    expect(createHash("sha256").update(world.burgY).digest("hex")).toBe(
      "985695cf6b31e93f61110e69498dc844cc63f87c442389053bd9b04611727cf4",
    );
    expect(createHash("sha256").update(world.burgCapital).digest("hex")).toBe(
      "a8f2b334cc0ef579f9380640139852c6ffcfef895fe0a396b1a68d361d313ce4",
    );
    expect(createHash("sha256").update(world.burgPort).digest("hex")).toBe(
      "4f65b8ab30d1379cda99f02bdebc3b63046e4075f79e511cfdec10de4c2aec3e",
    );
    expect(createHash("sha256").update(world.cellsState).digest("hex")).toBe(
      "2a42b874f4d947fa3eb90f847280cdfbaee05abec56c0a4ebca1935691465079",
    );
    expect(
      createHash("sha256").update(world.stateCenterBurg).digest("hex"),
    ).toBe("e88624bf274aff4f35798f4bc27027683e9c1d78f132211a3cc4ae5b3decd4e3");
    expect(createHash("sha256").update(world.stateCells).digest("hex")).toBe(
      "337d27ca86ccc3f37e2de0b3321c5297f993585db0dceeac930f2b687ee357af",
    );
  });

  test("generates deterministic religions when religions layer is enabled", () => {
    const withReligionsA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
      culturesCount: 10,
    });

    const withReligionsB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
      culturesCount: 10,
    });

    expect(withReligionsA.religionCount).toBeGreaterThan(0);
    expect(withReligionsA.religionSeedCell.length).toBe(
      withReligionsA.religionCount + 1,
    );
    expect(withReligionsA.religionType.length).toBe(
      withReligionsA.religionCount + 1,
    );
    expect(withReligionsA.religionSize.length).toBe(
      withReligionsA.religionCount + 1,
    );

    let assignedLand = 0;
    let assignedWater = 0;
    let sizeSum = 0;

    for (let cellId = 0; cellId < withReligionsA.cellCount; cellId += 1) {
      const isLand = (withReligionsA.cellsFeature[cellId] ?? 0) === 1;
      const religionId = withReligionsA.cellsReligion[cellId] ?? 0;

      if (isLand) {
        assignedLand += 1;
        expect(religionId).toBeGreaterThan(0);
        expect(religionId).toBeLessThanOrEqual(withReligionsA.religionCount);
      } else if (religionId > 0) {
        assignedWater += 1;
      }
    }

    expect(assignedWater).toBe(0);
    expect(countUnassignedWaterReligionBridges(withReligionsA)).toBeGreaterThan(
      0,
    );

    for (
      let religionId = 1;
      religionId <= withReligionsA.religionCount;
      religionId += 1
    ) {
      const seedCell = withReligionsA.religionSeedCell[religionId] ?? 0;
      const type = withReligionsA.religionType[religionId] ?? 0;
      const size = withReligionsA.religionSize[religionId] ?? 0;

      expect(seedCell).toBeGreaterThanOrEqual(0);
      expect(seedCell).toBeLessThan(withReligionsA.cellCount);
      expect(withReligionsA.cellsFeature[seedCell]).toBe(1);
      expect(type === 1 || type === 2 || type === 3 || type === 4).toBe(true);
      expect(size).toBeGreaterThanOrEqual(0);
      if (size > 0) {
        expect(withReligionsA.cellsReligion[seedCell]).toBe(religionId);
      }

      sizeSum += size;
    }

    expect(sizeSum).toBe(assignedLand);

    expect(Array.from(withReligionsA.cellsReligion)).toEqual(
      Array.from(withReligionsB.cellsReligion),
    );
    expect(withReligionsA.religionCount).toBe(withReligionsB.religionCount);
    expect(Array.from(withReligionsA.religionSeedCell)).toEqual(
      Array.from(withReligionsB.religionSeedCell),
    );
    expect(Array.from(withReligionsA.religionType)).toEqual(
      Array.from(withReligionsB.religionType),
    );
    expect(Array.from(withReligionsA.religionSize)).toEqual(
      Array.from(withReligionsB.religionSize),
    );
  });

  test("keeps oracle-query religion placement stable", () => {
    const world = generateWorld({
      seed: "42424242",
      width: 1280,
      height: 900,
      cells: 9996,
      culturesCount: 9,
      statesCount: 23,
      townsCount: 1000,
      hiddenControls: {
        sizeVariety: 7.5,
        growthRate: 1.6,
        religionsNumber: 7,
      },
      climate: {
        lakeElevationLimit: 20,
        precipitation: 94,
        mapSize: 100,
        latitude: 50,
        longitude: 50,
      },
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(world.religionCount).toBe(16);
    expect(createHash("sha256").update(world.cellsReligion).digest("hex")).toBe(
      "6e9de2cf21edd492c79714c0f31c4efdf39e672614203bf1bf998483d48be4fd",
    );
    expect(
      createHash("sha256").update(world.religionSeedCell).digest("hex"),
    ).toBe("f17f507dacb7e1e6901ad8a3ba3757200e26f5ec6e2eb99afc421b88eb4c1963");
    expect(createHash("sha256").update(world.religionType).digest("hex")).toBe(
      "321918b12ad8caa005eefc87c5566ca7885bcce909cb33ac59ce35c26b70e9fd",
    );
    expect(createHash("sha256").update(world.religionSize).digest("hex")).toBe(
      "2730866cc8247e95f08b345920556cb92be00537c899d5466ea25f7c060f4c36",
    );
  });

  test("assigns state forms after religions are available", () => {
    const sharedConfig = {
      ...baseConfig,
      seed: "beta",
      culturesCount: 10,
    };
    const withPoliticsOnly = generateWorld({
      ...sharedConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
      },
    });
    const withReligions = generateWorld({
      ...sharedConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });

    expect(Array.from(withPoliticsOnly.cellsState)).toEqual(
      Array.from(withReligions.cellsState),
    );
    expect(Array.from(withPoliticsOnly.stateCells)).toEqual(
      Array.from(withReligions.stateCells),
    );
    expect(Array.from(withPoliticsOnly.routeFromState)).toEqual(
      Array.from(withReligions.routeFromState),
    );
    expect(Array.from(withPoliticsOnly.routeToState)).toEqual(
      Array.from(withReligions.routeToState),
    );
    for (let stateId = 1; stateId <= withReligions.stateCount; stateId += 1) {
      const capitalBurgId = withReligions.stateCenterBurg[stateId] ?? 0;
      const capitalCell = withReligions.burgCell[capitalBurgId] ?? 0;
      const religionId = withReligions.cellsReligion[capitalCell] ?? 0;
      const form = withReligions.stateForm[stateId] ?? 0;

      expect(religionId).toBeGreaterThan(0);
      expect(form === 1 || form === 2 || form === 3).toBe(true);
    }
  });

  test("keeps burg outputs stable while later layers are added", () => {
    const sharedConfig = {
      ...baseConfig,
      seed: "burg-order",
      culturesCount: 10,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
      },
    };
    const withPoliticsOnly = generateWorld(sharedConfig);
    const withReligions = generateWorld({
      ...sharedConfig,
      layers: {
        ...sharedConfig.layers,
        religions: true,
      },
    });

    expect(Array.from(withPoliticsOnly.cellsBurg)).toEqual(
      Array.from(withReligions.cellsBurg),
    );
    expect(withPoliticsOnly.burgCount).toBe(withReligions.burgCount);
    expect(Array.from(withPoliticsOnly.burgCell)).toEqual(
      Array.from(withReligions.burgCell),
    );
    expect(Array.from(withPoliticsOnly.burgX)).toEqual(
      Array.from(withReligions.burgX),
    );
    expect(Array.from(withPoliticsOnly.burgY)).toEqual(
      Array.from(withReligions.burgY),
    );
    expect(Array.from(withPoliticsOnly.burgCapital)).toEqual(
      Array.from(withReligions.burgCapital),
    );
    expect(Array.from(withPoliticsOnly.burgPort)).toEqual(
      Array.from(withReligions.burgPort),
    );
    expect(Array.from(withPoliticsOnly.burgCulture)).toEqual(
      Array.from(withReligions.burgCulture),
    );
    expect(Array.from(withPoliticsOnly.burgPopulation)).toEqual(
      Array.from(withReligions.burgPopulation),
    );
  });

  test("generates deterministic military layer outputs", () => {
    const withMilitaryA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        politics: true,
        military: true,
      },
      culturesCount: 10,
    });

    const withMilitaryB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        politics: true,
        military: true,
      },
      culturesCount: 10,
    });

    expect(withMilitaryA.militaryCount).toBeGreaterThan(0);
    expect(withMilitaryA.militaryCell.length).toBe(
      withMilitaryA.militaryCount + 1,
    );
    expect(withMilitaryA.militaryState.length).toBe(
      withMilitaryA.militaryCount + 1,
    );
    expect(withMilitaryA.militaryType.length).toBe(
      withMilitaryA.militaryCount + 1,
    );
    expect(withMilitaryA.militaryStrength.length).toBe(
      withMilitaryA.militaryCount + 1,
    );

    let assignedCells = 0;

    for (let cellId = 0; cellId < withMilitaryA.cellCount; cellId += 1) {
      const militaryId = withMilitaryA.cellsMilitary[cellId] ?? 0;
      if (militaryId === 0) {
        continue;
      }

      assignedCells += 1;
      expect(militaryId).toBeGreaterThan(0);
      expect(militaryId).toBeLessThanOrEqual(withMilitaryA.militaryCount);
      expect(withMilitaryA.militaryCell[militaryId]).toBe(cellId);

      const stateId = withMilitaryA.militaryState[militaryId] ?? 0;
      expect(stateId).toBeGreaterThanOrEqual(0);
      expect(stateId).toBeLessThanOrEqual(withMilitaryA.stateCount);
      if (stateId > 0) {
        expect(withMilitaryA.cellsState[cellId]).toBe(stateId);
      }

      const type = withMilitaryA.militaryType[militaryId] ?? 0;
      expect(type === 1 || type === 2 || type === 3).toBe(true);

      const strength = withMilitaryA.militaryStrength[militaryId] ?? 0;
      expect(strength).toBeGreaterThanOrEqual(20);
    }

    expect(assignedCells).toBe(withMilitaryA.militaryCount);

    expect(Array.from(withMilitaryA.cellsMilitary)).toEqual(
      Array.from(withMilitaryB.cellsMilitary),
    );
    expect(withMilitaryA.militaryCount).toBe(withMilitaryB.militaryCount);
    expect(Array.from(withMilitaryA.militaryCell)).toEqual(
      Array.from(withMilitaryB.militaryCell),
    );
    expect(Array.from(withMilitaryA.militaryState)).toEqual(
      Array.from(withMilitaryB.militaryState),
    );
    expect(Array.from(withMilitaryA.militaryType)).toEqual(
      Array.from(withMilitaryB.militaryType),
    );
    expect(Array.from(withMilitaryA.militaryStrength)).toEqual(
      Array.from(withMilitaryB.militaryStrength),
    );
  });

  test("generates deterministic markers and zones outputs", () => {
    const withMarkersZonesA = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        settlements: true,
        markers: true,
        zones: true,
      },
    });

    const withMarkersZonesB = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        settlements: true,
        markers: true,
        zones: true,
      },
    });

    expect(withMarkersZonesA.markerCount).toBeGreaterThan(0);
    expect(withMarkersZonesA.markerCell.length).toBe(
      withMarkersZonesA.markerCount + 1,
    );
    expect(withMarkersZonesA.markerType.length).toBe(
      withMarkersZonesA.markerCount + 1,
    );
    expect(withMarkersZonesA.markerStrength.length).toBe(
      withMarkersZonesA.markerCount + 1,
    );

    for (
      let markerId = 1;
      markerId <= withMarkersZonesA.markerCount;
      markerId += 1
    ) {
      const cellId = withMarkersZonesA.markerCell[markerId] ?? 0;
      const type = withMarkersZonesA.markerType[markerId] ?? 0;
      const strength = withMarkersZonesA.markerStrength[markerId] ?? 0;

      expect(cellId).toBeGreaterThanOrEqual(0);
      expect(cellId).toBeLessThan(withMarkersZonesA.cellCount);
      expect(withMarkersZonesA.cellsFeature[cellId]).toBe(1);
      expect(type >= 1 && type <= 5).toBe(true);
      expect(strength).toBeGreaterThan(0);
    }

    expect(withMarkersZonesA.zoneCount).toBeGreaterThan(0);
    expect(withMarkersZonesA.zoneSeedCell.length).toBe(
      withMarkersZonesA.zoneCount + 1,
    );
    expect(withMarkersZonesA.zoneType.length).toBe(
      withMarkersZonesA.zoneCount + 1,
    );
    expect(withMarkersZonesA.zoneCells.length).toBe(
      withMarkersZonesA.zoneCount + 1,
    );

    let assignedZoneLand = 0;
    for (let cellId = 0; cellId < withMarkersZonesA.cellCount; cellId += 1) {
      const zoneId = withMarkersZonesA.cellsZone[cellId] ?? 0;
      if ((withMarkersZonesA.cellsFeature[cellId] ?? 0) === 1) {
        assignedZoneLand += 1;
        expect(zoneId).toBeGreaterThan(0);
        expect(zoneId).toBeLessThanOrEqual(withMarkersZonesA.zoneCount);
      } else {
        expect(zoneId).toBe(0);
      }
    }

    let zoneCellSum = 0;
    for (let zoneId = 1; zoneId <= withMarkersZonesA.zoneCount; zoneId += 1) {
      const seedCell = withMarkersZonesA.zoneSeedCell[zoneId] ?? 0;
      const type = withMarkersZonesA.zoneType[zoneId] ?? 0;
      const size = withMarkersZonesA.zoneCells[zoneId] ?? 0;

      expect(seedCell).toBeGreaterThanOrEqual(0);
      expect(seedCell).toBeLessThan(withMarkersZonesA.cellCount);
      expect(withMarkersZonesA.cellsFeature[seedCell]).toBe(1);
      expect(type === 1 || type === 2 || type === 3 || type === 4).toBe(true);
      expect(size).toBeGreaterThan(0);

      zoneCellSum += size;
    }

    expect(zoneCellSum).toBe(assignedZoneLand);

    expect(withMarkersZonesA.markerCount).toBe(withMarkersZonesB.markerCount);
    expect(Array.from(withMarkersZonesA.markerCell)).toEqual(
      Array.from(withMarkersZonesB.markerCell),
    );
    expect(Array.from(withMarkersZonesA.markerType)).toEqual(
      Array.from(withMarkersZonesB.markerType),
    );
    expect(Array.from(withMarkersZonesA.markerStrength)).toEqual(
      Array.from(withMarkersZonesB.markerStrength),
    );
    expect(Array.from(withMarkersZonesA.cellsZone)).toEqual(
      Array.from(withMarkersZonesB.cellsZone),
    );
    expect(withMarkersZonesA.zoneCount).toBe(withMarkersZonesB.zoneCount);
    expect(Array.from(withMarkersZonesA.zoneSeedCell)).toEqual(
      Array.from(withMarkersZonesB.zoneSeedCell),
    );
    expect(Array.from(withMarkersZonesA.zoneType)).toEqual(
      Array.from(withMarkersZonesB.zoneType),
    );
    expect(Array.from(withMarkersZonesA.zoneCells)).toEqual(
      Array.from(withMarkersZonesB.zoneCells),
    );
  });

  test("keeps physical layers stable when cultures are toggled", () => {
    const withoutCultures = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: false,
      },
    });

    const withCultures = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
      },
      culturesCount: 10,
    });

    expect(withoutCultures.cultureCount).toBe(0);
    expect(withoutCultures.cultureSeedCell.length).toBe(1);
    expect(withoutCultures.cultureSize.length).toBe(1);
    expect(Array.from(withoutCultures.cellsCulture)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.burgCount).toBe(0);
    expect(withoutCultures.burgCell.length).toBe(1);
    expect(withoutCultures.burgPopulation.length).toBe(1);
    expect(withoutCultures.burgPort.length).toBe(1);
    expect(withoutCultures.burgCulture.length).toBe(1);
    expect(Array.from(withoutCultures.cellsBurg)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.stateCount).toBe(0);
    expect(withoutCultures.stateCenterBurg.length).toBe(1);
    expect(withoutCultures.stateCulture.length).toBe(1);
    expect(withoutCultures.stateForm.length).toBe(1);
    expect(withoutCultures.stateCells.length).toBe(1);
    expect(Array.from(withoutCultures.cellsState)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.routeCount).toBe(0);
    expect(withoutCultures.routeFromState.length).toBe(1);
    expect(withoutCultures.routeToState.length).toBe(1);
    expect(withoutCultures.routeKind.length).toBe(1);
    expect(withoutCultures.routeWeight.length).toBe(1);
    expect(withoutCultures.provinceCount).toBe(0);
    expect(withoutCultures.provinceState.length).toBe(1);
    expect(withoutCultures.provinceCenterCell.length).toBe(1);
    expect(withoutCultures.provinceCells.length).toBe(1);
    expect(Array.from(withoutCultures.cellsProvince)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.religionCount).toBe(0);
    expect(withoutCultures.religionSeedCell.length).toBe(1);
    expect(withoutCultures.religionType.length).toBe(1);
    expect(withoutCultures.religionSize.length).toBe(1);
    expect(Array.from(withoutCultures.cellsReligion)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.militaryCount).toBe(0);
    expect(withoutCultures.militaryCell.length).toBe(1);
    expect(withoutCultures.militaryState.length).toBe(1);
    expect(withoutCultures.militaryType.length).toBe(1);
    expect(withoutCultures.militaryStrength.length).toBe(1);
    expect(Array.from(withoutCultures.cellsMilitary)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );
    expect(withoutCultures.markerCount).toBe(0);
    expect(withoutCultures.markerCell.length).toBe(1);
    expect(withoutCultures.markerType.length).toBe(1);
    expect(withoutCultures.markerStrength.length).toBe(1);
    expect(withoutCultures.zoneCount).toBe(0);
    expect(withoutCultures.zoneSeedCell.length).toBe(1);
    expect(withoutCultures.zoneType.length).toBe(1);
    expect(withoutCultures.zoneCells.length).toBe(1);
    expect(Array.from(withoutCultures.cellsZone)).toEqual(
      Array.from(new Uint16Array(withoutCultures.cellCount)),
    );

    expect(withCultures.cultureCount).toBeGreaterThan(0);
    expect(Array.from(withoutCultures.cellsH)).toEqual(
      Array.from(withCultures.cellsH),
    );
    expect(Array.from(withoutCultures.cellsFeature)).toEqual(
      Array.from(withCultures.cellsFeature),
    );
    expect(Array.from(withoutCultures.cellsFeatureId)).toEqual(
      Array.from(withCultures.cellsFeatureId),
    );
    expect(withoutCultures.featureCount).toBe(withCultures.featureCount);
    expect(Array.from(withoutCultures.featureType)).toEqual(
      Array.from(withCultures.featureType),
    );
    expect(Array.from(withoutCultures.featureLand)).toEqual(
      Array.from(withCultures.featureLand),
    );
    expect(Array.from(withoutCultures.featureBorder)).toEqual(
      Array.from(withCultures.featureBorder),
    );
    expect(Array.from(withoutCultures.featureSize)).toEqual(
      Array.from(withCultures.featureSize),
    );
    expect(Array.from(withoutCultures.featureFirstCell)).toEqual(
      Array.from(withCultures.featureFirstCell),
    );
    expect(Array.from(withoutCultures.cellsCoast)).toEqual(
      Array.from(withCultures.cellsCoast),
    );
    expect(Array.from(withoutCultures.cellsLandmass)).toEqual(
      Array.from(withCultures.cellsLandmass),
    );
    expect(Array.from(withoutCultures.cellsWaterbody)).toEqual(
      Array.from(withCultures.cellsWaterbody),
    );
    expect(Array.from(withoutCultures.cellsTemp)).toEqual(
      Array.from(withCultures.cellsTemp),
    );
    expect(Array.from(withoutCultures.cellsPrec)).toEqual(
      Array.from(withCultures.cellsPrec),
    );
    expect(Array.from(withoutCultures.cellsFlow)).toEqual(
      Array.from(withCultures.cellsFlow),
    );
    expect(Array.from(withoutCultures.cellsRiver)).toEqual(
      Array.from(withCultures.cellsRiver),
    );
    expect(Array.from(withoutCultures.cellsBiome)).toEqual(
      Array.from(withCultures.cellsBiome),
    );
    expect(Array.from(withoutCultures.gridToPack)).toEqual(
      Array.from(withCultures.gridToPack),
    );
    expect(Array.from(withoutCultures.packToGrid)).toEqual(
      Array.from(withCultures.packToGrid),
    );
    expect(Array.from(withoutCultures.packNeighborOffsets)).toEqual(
      Array.from(withCultures.packNeighborOffsets),
    );
    expect(Array.from(withoutCultures.packNeighbors)).toEqual(
      Array.from(withCultures.packNeighbors),
    );
    expect(Array.from(withoutCultures.packCellsFeatureId)).toEqual(
      Array.from(withCultures.packCellsFeatureId),
    );
    expect(withoutCultures.packFeatureCount).toBe(
      withCultures.packFeatureCount,
    );
    expect(Array.from(withoutCultures.packFeatureType)).toEqual(
      Array.from(withCultures.packFeatureType),
    );
    expect(Array.from(withoutCultures.packFeatureBorder)).toEqual(
      Array.from(withCultures.packFeatureBorder),
    );
    expect(Array.from(withoutCultures.packFeatureSize)).toEqual(
      Array.from(withCultures.packFeatureSize),
    );
    expect(Array.from(withoutCultures.packFeatureFirstCell)).toEqual(
      Array.from(withCultures.packFeatureFirstCell),
    );
    expect(Array.from(withoutCultures.packCoast)).toEqual(
      Array.from(withCultures.packCoast),
    );
    expect(Array.from(withoutCultures.packHaven)).toEqual(
      Array.from(withCultures.packHaven),
    );
    expect(Array.from(withoutCultures.packHarbor)).toEqual(
      Array.from(withCultures.packHarbor),
    );
    expect(Array.from(withoutCultures.cellsBurg)).toEqual(
      Array.from(withCultures.cellsBurg),
    );
    expect(withoutCultures.burgCount).toBe(withCultures.burgCount);
    expect(Array.from(withoutCultures.burgCell)).toEqual(
      Array.from(withCultures.burgCell),
    );
    expect(Array.from(withoutCultures.burgPopulation)).toEqual(
      Array.from(withCultures.burgPopulation),
    );
    expect(Array.from(withoutCultures.burgPort)).toEqual(
      Array.from(withCultures.burgPort),
    );
    expect(Array.from(withoutCultures.burgCulture)).toEqual(
      Array.from(withCultures.burgCulture),
    );
    expect(Array.from(withoutCultures.cellsState)).toEqual(
      Array.from(withCultures.cellsState),
    );
    expect(withoutCultures.stateCount).toBe(withCultures.stateCount);
    expect(Array.from(withoutCultures.stateCenterBurg)).toEqual(
      Array.from(withCultures.stateCenterBurg),
    );
    expect(Array.from(withoutCultures.stateCulture)).toEqual(
      Array.from(withCultures.stateCulture),
    );
    expect(Array.from(withoutCultures.stateForm)).toEqual(
      Array.from(withCultures.stateForm),
    );
    expect(Array.from(withoutCultures.stateCells)).toEqual(
      Array.from(withCultures.stateCells),
    );
    expect(withoutCultures.routeCount).toBe(withCultures.routeCount);
    expect(Array.from(withoutCultures.routeFromState)).toEqual(
      Array.from(withCultures.routeFromState),
    );
    expect(Array.from(withoutCultures.routeToState)).toEqual(
      Array.from(withCultures.routeToState),
    );
    expect(Array.from(withoutCultures.routeKind)).toEqual(
      Array.from(withCultures.routeKind),
    );
    expect(Array.from(withoutCultures.routeWeight)).toEqual(
      Array.from(withCultures.routeWeight),
    );
    expect(Array.from(withoutCultures.cellsProvince)).toEqual(
      Array.from(withCultures.cellsProvince),
    );
    expect(withoutCultures.provinceCount).toBe(withCultures.provinceCount);
    expect(Array.from(withoutCultures.provinceState)).toEqual(
      Array.from(withCultures.provinceState),
    );
    expect(Array.from(withoutCultures.provinceCenterCell)).toEqual(
      Array.from(withCultures.provinceCenterCell),
    );
    expect(Array.from(withoutCultures.provinceCells)).toEqual(
      Array.from(withCultures.provinceCells),
    );
    expect(Array.from(withoutCultures.cellsReligion)).toEqual(
      Array.from(withCultures.cellsReligion),
    );
    expect(withoutCultures.religionCount).toBe(withCultures.religionCount);
    expect(Array.from(withoutCultures.religionSeedCell)).toEqual(
      Array.from(withCultures.religionSeedCell),
    );
    expect(Array.from(withoutCultures.religionType)).toEqual(
      Array.from(withCultures.religionType),
    );
    expect(Array.from(withoutCultures.religionSize)).toEqual(
      Array.from(withCultures.religionSize),
    );
    expect(Array.from(withoutCultures.cellsMilitary)).toEqual(
      Array.from(withCultures.cellsMilitary),
    );
    expect(withoutCultures.militaryCount).toBe(withCultures.militaryCount);
    expect(Array.from(withoutCultures.militaryCell)).toEqual(
      Array.from(withCultures.militaryCell),
    );
    expect(Array.from(withoutCultures.militaryState)).toEqual(
      Array.from(withCultures.militaryState),
    );
    expect(Array.from(withoutCultures.militaryType)).toEqual(
      Array.from(withCultures.militaryType),
    );
    expect(Array.from(withoutCultures.militaryStrength)).toEqual(
      Array.from(withCultures.militaryStrength),
    );
    expect(withoutCultures.markerCount).toBe(withCultures.markerCount);
    expect(Array.from(withoutCultures.markerCell)).toEqual(
      Array.from(withCultures.markerCell),
    );
    expect(Array.from(withoutCultures.markerType)).toEqual(
      Array.from(withCultures.markerType),
    );
    expect(Array.from(withoutCultures.markerStrength)).toEqual(
      Array.from(withCultures.markerStrength),
    );
    expect(Array.from(withoutCultures.cellsZone)).toEqual(
      Array.from(withCultures.cellsZone),
    );
    expect(withoutCultures.zoneCount).toBe(withCultures.zoneCount);
    expect(Array.from(withoutCultures.zoneSeedCell)).toEqual(
      Array.from(withCultures.zoneSeedCell),
    );
    expect(Array.from(withoutCultures.zoneType)).toEqual(
      Array.from(withCultures.zoneType),
    );
    expect(Array.from(withoutCultures.zoneCells)).toEqual(
      Array.from(withCultures.zoneCells),
    );
  });

  test("keeps river and biome outputs structurally consistent", () => {
    const zeroRiverWorld = generateWorld(baseConfig);
    const zeroRiverStats = collectHydrologyStats(zeroRiverWorld);

    expect(zeroRiverStats.riverCells).toBe(0);
    expect(zeroRiverStats.biomeCount).toBeGreaterThan(2);

    const riverWorld = generateWorld({ ...baseConfig, seed: "38" });
    const riverStats = collectHydrologyStats(riverWorld);

    expect(riverStats.riverCells).toBeGreaterThan(0);
    expect(riverStats.maxLandFlow).toBeGreaterThanOrEqual(
      riverStats.riverThreshold,
    );
    expect(riverStats.biomeCount).toBeGreaterThan(2);
  });

  test("supports full world serialization round-trip", () => {
    const original = generateWorld(baseConfig);
    const encoded = serializeWorld(original);
    const decoded = deserializeWorld(encoded);

    expect(decoded.schemaVersion).toBe(original.schemaVersion);
    expect(decoded.seed).toBe(original.seed);
    expect(decoded.width).toBe(original.width);
    expect(decoded.height).toBe(original.height);
    expect(decoded.requestedCells).toBe(original.requestedCells);
    expect(decoded.cellCount).toBe(original.cellCount);
    expect(decoded.gridSpacing).toBe(original.gridSpacing);
    expect(decoded.gridCellsX).toBe(original.gridCellsX);
    expect(decoded.gridCellsY).toBe(original.gridCellsY);

    expect(Array.from(decoded.cellsX)).toEqual(Array.from(original.cellsX));
    expect(Array.from(decoded.cellsY)).toEqual(Array.from(original.cellsY));
    expect(Array.from(decoded.cellsBorder)).toEqual(
      Array.from(original.cellsBorder),
    );
    expect(Array.from(decoded.cellsArea)).toEqual(
      Array.from(original.cellsArea),
    );
    expect(Array.from(decoded.cellsH)).toEqual(Array.from(original.cellsH));
    expect(Array.from(decoded.cellsCulture)).toEqual(
      Array.from(original.cellsCulture),
    );
    expect(decoded.cultureCount).toBe(original.cultureCount);
    expect(Array.from(decoded.cultureSeedCell)).toEqual(
      Array.from(original.cultureSeedCell),
    );
    expect(Array.from(decoded.cultureSize)).toEqual(
      Array.from(original.cultureSize),
    );
    expect(Array.from(decoded.cellsBurg)).toEqual(
      Array.from(original.cellsBurg),
    );
    expect(decoded.burgCount).toBe(original.burgCount);
    expect(Array.from(decoded.burgCell)).toEqual(Array.from(original.burgCell));
    expect(Array.from(decoded.burgPopulation)).toEqual(
      Array.from(original.burgPopulation),
    );
    expect(Array.from(decoded.burgPort)).toEqual(Array.from(original.burgPort));
    expect(Array.from(decoded.burgCulture)).toEqual(
      Array.from(original.burgCulture),
    );
    expect(Array.from(decoded.cellsState)).toEqual(
      Array.from(original.cellsState),
    );
    expect(decoded.stateCount).toBe(original.stateCount);
    expect(Array.from(decoded.stateCenterBurg)).toEqual(
      Array.from(original.stateCenterBurg),
    );
    expect(Array.from(decoded.stateCulture)).toEqual(
      Array.from(original.stateCulture),
    );
    expect(Array.from(decoded.stateForm)).toEqual(
      Array.from(original.stateForm),
    );
    expect(Array.from(decoded.stateCells)).toEqual(
      Array.from(original.stateCells),
    );
    expect(decoded.routeCount).toBe(original.routeCount);
    expect(Array.from(decoded.routeFromState)).toEqual(
      Array.from(original.routeFromState),
    );
    expect(Array.from(decoded.routeToState)).toEqual(
      Array.from(original.routeToState),
    );
    expect(Array.from(decoded.routeKind)).toEqual(
      Array.from(original.routeKind),
    );
    expect(Array.from(decoded.routeWeight)).toEqual(
      Array.from(original.routeWeight),
    );
    expect(Array.from(decoded.cellsProvince)).toEqual(
      Array.from(original.cellsProvince),
    );
    expect(decoded.provinceCount).toBe(original.provinceCount);
    expect(Array.from(decoded.provinceState)).toEqual(
      Array.from(original.provinceState),
    );
    expect(Array.from(decoded.provinceCenterCell)).toEqual(
      Array.from(original.provinceCenterCell),
    );
    expect(Array.from(decoded.provinceCells)).toEqual(
      Array.from(original.provinceCells),
    );
    expect(Array.from(decoded.cellsReligion)).toEqual(
      Array.from(original.cellsReligion),
    );
    expect(decoded.religionCount).toBe(original.religionCount);
    expect(Array.from(decoded.religionSeedCell)).toEqual(
      Array.from(original.religionSeedCell),
    );
    expect(Array.from(decoded.religionType)).toEqual(
      Array.from(original.religionType),
    );
    expect(Array.from(decoded.religionSize)).toEqual(
      Array.from(original.religionSize),
    );
    expect(Array.from(decoded.cellsMilitary)).toEqual(
      Array.from(original.cellsMilitary),
    );
    expect(decoded.militaryCount).toBe(original.militaryCount);
    expect(Array.from(decoded.militaryCell)).toEqual(
      Array.from(original.militaryCell),
    );
    expect(Array.from(decoded.militaryState)).toEqual(
      Array.from(original.militaryState),
    );
    expect(Array.from(decoded.militaryType)).toEqual(
      Array.from(original.militaryType),
    );
    expect(Array.from(decoded.militaryStrength)).toEqual(
      Array.from(original.militaryStrength),
    );
    expect(decoded.markerCount).toBe(original.markerCount);
    expect(Array.from(decoded.markerCell)).toEqual(
      Array.from(original.markerCell),
    );
    expect(Array.from(decoded.markerType)).toEqual(
      Array.from(original.markerType),
    );
    expect(Array.from(decoded.markerStrength)).toEqual(
      Array.from(original.markerStrength),
    );
    expect(Array.from(decoded.cellsZone)).toEqual(
      Array.from(original.cellsZone),
    );
    expect(decoded.zoneCount).toBe(original.zoneCount);
    expect(Array.from(decoded.zoneSeedCell)).toEqual(
      Array.from(original.zoneSeedCell),
    );
    expect(Array.from(decoded.zoneType)).toEqual(Array.from(original.zoneType));
    expect(Array.from(decoded.zoneCells)).toEqual(
      Array.from(original.zoneCells),
    );
    expect(Array.from(decoded.cellsFeature)).toEqual(
      Array.from(original.cellsFeature),
    );
    expect(Array.from(decoded.cellsFeatureId)).toEqual(
      Array.from(original.cellsFeatureId),
    );
    expect(decoded.featureCount).toBe(original.featureCount);
    expect(Array.from(decoded.featureType)).toEqual(
      Array.from(original.featureType),
    );
    expect(Array.from(decoded.featureLand)).toEqual(
      Array.from(original.featureLand),
    );
    expect(Array.from(decoded.featureBorder)).toEqual(
      Array.from(original.featureBorder),
    );
    expect(Array.from(decoded.featureSize)).toEqual(
      Array.from(original.featureSize),
    );
    expect(Array.from(decoded.featureFirstCell)).toEqual(
      Array.from(original.featureFirstCell),
    );
    expect(Array.from(decoded.cellsCoast)).toEqual(
      Array.from(original.cellsCoast),
    );
    expect(Array.from(decoded.cellsLandmass)).toEqual(
      Array.from(original.cellsLandmass),
    );
    expect(decoded.landmassCount).toBe(original.landmassCount);
    expect(Array.from(decoded.landmassKind)).toEqual(
      Array.from(original.landmassKind),
    );
    expect(Array.from(decoded.landmassSize)).toEqual(
      Array.from(original.landmassSize),
    );
    expect(Array.from(decoded.landmassBorder)).toEqual(
      Array.from(original.landmassBorder),
    );
    expect(Array.from(decoded.cellsTemp)).toEqual(
      Array.from(original.cellsTemp),
    );
    expect(Array.from(decoded.cellsPrec)).toEqual(
      Array.from(original.cellsPrec),
    );
    expect(Array.from(decoded.cellsFlow)).toEqual(
      Array.from(original.cellsFlow),
    );
    expect(Array.from(decoded.cellsRiver)).toEqual(
      Array.from(original.cellsRiver),
    );
    expect(Array.from(decoded.cellsBiome)).toEqual(
      Array.from(original.cellsBiome),
    );
    expect(Array.from(decoded.cellsWaterbody)).toEqual(
      Array.from(original.cellsWaterbody),
    );
    expect(decoded.waterbodyCount).toBe(original.waterbodyCount);
    expect(Array.from(decoded.waterbodyType)).toEqual(
      Array.from(original.waterbodyType),
    );
    expect(Array.from(decoded.waterbodySize)).toEqual(
      Array.from(original.waterbodySize),
    );
    expect(decoded.packCellCount).toBe(original.packCellCount);
    expect(Array.from(decoded.gridToPack)).toEqual(
      Array.from(original.gridToPack),
    );
    expect(Array.from(decoded.packToGrid)).toEqual(
      Array.from(original.packToGrid),
    );
    expect(Array.from(decoded.packX)).toEqual(Array.from(original.packX));
    expect(Array.from(decoded.packY)).toEqual(Array.from(original.packY));
    expect(Array.from(decoded.packH)).toEqual(Array.from(original.packH));
    expect(Array.from(decoded.packArea)).toEqual(Array.from(original.packArea));
    expect(Array.from(decoded.packNeighborOffsets)).toEqual(
      Array.from(original.packNeighborOffsets),
    );
    expect(Array.from(decoded.packNeighbors)).toEqual(
      Array.from(original.packNeighbors),
    );
    expect(Array.from(decoded.packCellsFeatureId)).toEqual(
      Array.from(original.packCellsFeatureId),
    );
    expect(decoded.packFeatureCount).toBe(original.packFeatureCount);
    expect(Array.from(decoded.packFeatureType)).toEqual(
      Array.from(original.packFeatureType),
    );
    expect(Array.from(decoded.packFeatureBorder)).toEqual(
      Array.from(original.packFeatureBorder),
    );
    expect(Array.from(decoded.packFeatureSize)).toEqual(
      Array.from(original.packFeatureSize),
    );
    expect(Array.from(decoded.packFeatureFirstCell)).toEqual(
      Array.from(original.packFeatureFirstCell),
    );
    expect(Array.from(decoded.packCoast)).toEqual(
      Array.from(original.packCoast),
    );
    expect(Array.from(decoded.packHaven)).toEqual(
      Array.from(original.packHaven),
    );
    expect(Array.from(decoded.packHarbor)).toEqual(
      Array.from(original.packHarbor),
    );
    expect(Array.from(decoded.vertexX)).toEqual(Array.from(original.vertexX));
    expect(Array.from(decoded.vertexY)).toEqual(Array.from(original.vertexY));
    expect(Array.from(decoded.cellVertexOffsets)).toEqual(
      Array.from(original.cellVertexOffsets),
    );
    expect(Array.from(decoded.cellVertices)).toEqual(
      Array.from(original.cellVertices),
    );
    expect(Array.from(decoded.cellNeighborOffsets)).toEqual(
      Array.from(original.cellNeighborOffsets),
    );
    expect(Array.from(decoded.cellNeighbors)).toEqual(
      Array.from(original.cellNeighbors),
    );
  });

  test("rejects invalid top-level config", () => {
    expect(() => generateWorld({ ...baseConfig, seed: "" })).toThrow(
      "seed must be a non-empty string",
    );
    expect(() => generateWorld({ ...baseConfig, width: 0 })).toThrow(
      "width must be a positive integer",
    );
    expect(() => generateWorld({ ...baseConfig, height: 0 })).toThrow(
      "height must be a positive integer",
    );
    expect(() => generateWorld({ ...baseConfig, cells: 0 })).toThrow(
      "cells must be a positive integer",
    );
    expect(() => generateWorld({ ...baseConfig, jitter: 2 })).toThrow(
      "jitter must be within [0, 1]",
    );
    expect(() => generateWorld({ ...baseConfig, culturesCount: 0 })).toThrow(
      "culturesCount must be an integer within [1, 512]",
    );
    expect(() =>
      generateWorld({
        ...baseConfig,
        // @ts-expect-error testing runtime validation path
        heightTemplate: "volcanic",
      }),
    ).toThrow(
      "heightTemplate must be one of: continents, archipelago, inland-sea",
    );
    const withSettlements = generateWorld({
      ...baseConfig,
      layers: {
        cultures: true,
        settlements: true,
      },
    });
    expect(withSettlements.burgCount).toBeGreaterThan(0);
    const withPolitics = generateWorld({
      ...baseConfig,
      layers: {
        cultures: true,
        politics: true,
      },
    });
    expect(withPolitics.stateCount).toBeGreaterThan(0);
    expect(withPolitics.routeCount).toBeGreaterThan(0);
    expect(withPolitics.provinceCount).toBeGreaterThan(0);
    const withReligions = generateWorld({
      ...baseConfig,
      layers: {
        cultures: true,
        religions: true,
      },
    });
    expect(withReligions.religionCount).toBeGreaterThan(0);
    expect(() =>
      generateWorld({
        ...baseConfig,
        layers: {
          physical: false,
        },
      }),
    ).toThrow("layers.physical=false is not supported yet");
    expect(() =>
      generateWorld({
        ...baseConfig,
        hiddenControls: {
          sizeVariety: 11,
        },
      }),
    ).toThrow("hiddenControls.sizeVariety must be within [0, 10]");
    expect(() =>
      generateWorld({
        ...baseConfig,
        hiddenControls: {
          growthRate: 0,
        },
      }),
    ).toThrow("hiddenControls.growthRate must be within [0.1, 2]");
    expect(() =>
      generateWorld({
        ...baseConfig,
        hiddenControls: {
          religionsNumber: 51,
        },
      }),
    ).toThrow(
      "hiddenControls.religionsNumber must be an integer within [0, 50]",
    );
  });

  test("applies reconstructed hidden controls to politics and religion growth", () => {
    const lowGrowth = generateWorld({
      ...baseConfig,
      layers: {
        cultures: true,
        politics: true,
        religions: true,
      },
      hiddenControls: {
        growthRate: 0.2,
        sizeVariety: 0,
        religionsNumber: 0,
      },
    });
    const highGrowth = generateWorld({
      ...baseConfig,
      layers: {
        cultures: true,
        politics: true,
        religions: true,
      },
      hiddenControls: {
        growthRate: 2,
        sizeVariety: 8,
        religionsNumber: 50,
      },
    });

    const lowStateCells = Array.from(lowGrowth.stateCells).reduce(
      (sum, value) => sum + value,
      0,
    );
    const highStateCells = Array.from(highGrowth.stateCells).reduce(
      (sum, value) => sum + value,
      0,
    );

    expect(highStateCells).toBeGreaterThan(lowStateCells);
    expect(Array.from(highGrowth.stateCells)).not.toEqual(
      Array.from(lowGrowth.stateCells),
    );
    expect(highGrowth.religionCount).toBeGreaterThan(lowGrowth.religionCount);
  });

  test("enforces current layer-combination support matrix", () => {
    const supported = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: false,
        politics: false,
      },
    });
    expect(supported.cellCount).toBeGreaterThan(0);

    const combos = [
      { cultures: false, settlements: false, politics: false },
      { cultures: true, settlements: false, politics: false },
      { cultures: false, settlements: true, politics: false },
      { cultures: true, settlements: true, politics: false },
      { cultures: false, settlements: false, politics: true },
      { cultures: true, settlements: false, politics: true },
      { cultures: false, settlements: true, politics: true },
      { cultures: true, settlements: true, politics: true },
    ] as const;

    for (const layers of combos) {
      const world = generateWorld({
        ...baseConfig,
        layers: {
          physical: true,
          ...layers,
        },
      });

      expect(world.cellCount).toBeGreaterThan(0);
      if (layers.cultures && (layers.settlements || layers.politics)) {
        expect(world.burgCount).toBeGreaterThan(0);
      } else {
        expect(world.burgCount).toBe(0);
      }

      if (layers.cultures && layers.politics) {
        expect(world.stateCount).toBeGreaterThan(0);
        expect(world.routeCount).toBeGreaterThan(0);
        expect(world.provinceCount).toBeGreaterThan(0);
      } else {
        expect(world.stateCount).toBe(0);
        expect(world.routeCount).toBe(0);
        expect(world.provinceCount).toBe(0);
      }

      expect(world.religionCount).toBe(0);
    }

    const withReligionsOnly = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        religions: true,
      },
    });
    expect(withReligionsOnly.religionCount).toBe(0);

    const withReligionsAndPolitics = generateWorld({
      ...baseConfig,
      layers: {
        physical: true,
        cultures: true,
        settlements: true,
        politics: true,
        religions: true,
      },
    });
    expect(withReligionsAndPolitics.religionCount).toBeGreaterThan(0);
  });

  test("rejects unsupported serialized schemas", () => {
    const original = generateWorld(baseConfig);
    const parsed = JSON.parse(serializeWorld(original)) as {
      schemaVersion: number;
    };

    parsed.schemaVersion = 99;
    const tampered = JSON.stringify(parsed);

    expect(() => deserializeWorld(tampered)).toThrow(
      "unsupported schemaVersion",
    );

    const missingSchema = JSON.stringify({ seed: "x" });
    expect(() => deserializeWorld(missingSchema)).toThrow(
      "serialized world is missing schemaVersion",
    );

    const missingWaterbodyCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      waterbodyCount: undefined,
    });
    expect(() => deserializeWorld(missingWaterbodyCount)).toThrow(
      "serialized world is missing waterbodyCount",
    );

    const missingLandmassCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      landmassCount: undefined,
    });
    expect(() => deserializeWorld(missingLandmassCount)).toThrow(
      "serialized world is missing landmassCount",
    );

    const missingPackCellCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      packCellCount: undefined,
    });
    expect(() => deserializeWorld(missingPackCellCount)).toThrow(
      "serialized world is missing packCellCount",
    );

    const missingFeatureCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      featureCount: undefined,
    });
    expect(() => deserializeWorld(missingFeatureCount)).toThrow(
      "serialized world is missing featureCount",
    );

    const missingPackFeatureCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      packFeatureCount: undefined,
    });
    expect(() => deserializeWorld(missingPackFeatureCount)).toThrow(
      "serialized world is missing packFeatureCount",
    );

    const missingCultureCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      cultureCount: undefined,
    });
    expect(() => deserializeWorld(missingCultureCount)).toThrow(
      "serialized world is missing cultureCount",
    );

    const missingBurgCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      burgCount: undefined,
    });
    expect(() => deserializeWorld(missingBurgCount)).toThrow(
      "serialized world is missing burgCount",
    );

    const missingStateCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      stateCount: undefined,
    });
    expect(() => deserializeWorld(missingStateCount)).toThrow(
      "serialized world is missing stateCount",
    );

    const missingRouteCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      routeCount: undefined,
    });
    expect(() => deserializeWorld(missingRouteCount)).toThrow(
      "serialized world is missing routeCount",
    );

    const missingProvinceCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      provinceCount: undefined,
    });
    expect(() => deserializeWorld(missingProvinceCount)).toThrow(
      "serialized world is missing provinceCount",
    );

    const missingReligionCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      religionCount: undefined,
    });
    expect(() => deserializeWorld(missingReligionCount)).toThrow(
      "serialized world is missing religionCount",
    );

    const missingMilitaryCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      militaryCount: undefined,
    });
    expect(() => deserializeWorld(missingMilitaryCount)).toThrow(
      "serialized world is missing militaryCount",
    );

    const missingMarkerCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      markerCount: undefined,
    });
    expect(() => deserializeWorld(missingMarkerCount)).toThrow(
      "serialized world is missing markerCount",
    );

    const missingZoneCount = JSON.stringify({
      ...JSON.parse(serializeWorld(original)),
      zoneCount: undefined,
    });
    expect(() => deserializeWorld(missingZoneCount)).toThrow(
      "serialized world is missing zoneCount",
    );
  });
});
