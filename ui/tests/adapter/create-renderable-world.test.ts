import { describe, expect, it } from "vitest";
import { buildRenderableWorld } from "../../adapter";
import { getFixtureWorld } from "../helpers/world-fixture";

describe("buildRenderableWorld", () => {
  it("derives render collections from the generated world", () => {
    const world = getFixtureWorld();
    const renderable = buildRenderableWorld(world);

    expect(renderable.width).toBe(world.width);
    expect(renderable.height).toBe(world.height);
    expect(renderable.focusBounds.minX).toBeGreaterThanOrEqual(0);
    expect(renderable.focusBounds.minY).toBeGreaterThanOrEqual(0);
    expect(renderable.focusBounds.maxX).toBeLessThanOrEqual(world.width);
    expect(renderable.focusBounds.maxY).toBeLessThanOrEqual(world.height);
    expect(renderable.cells).toHaveLength(world.cellCount);
    expect(renderable.landCellIds.length + renderable.waterCellIds.length).toBe(
      world.cellCount,
    );
    expect(renderable.states).toHaveLength(world.stateCount);
    expect(renderable.routes).toHaveLength(world.routeCount);
    expect(renderable.provinces).toHaveLength(world.provinceCount);
    expect(renderable.religions).toHaveLength(world.religionCount);
    expect(renderable.military).toHaveLength(world.militaryCount);
    expect(renderable.markers).toHaveLength(world.markerCount);
    expect(renderable.zones).toHaveLength(world.zoneCount);
    expect(renderable.burgs).toHaveLength(world.burgCount);
    expect(renderable.terrainFeatures).toHaveLength(
      Array.from(world.packFeatureType).filter(
        (featureType) => featureType === 2 || featureType === 3,
      ).length,
    );

    const firstCell = renderable.cells[0];
    expect(firstCell).toBeDefined();
    expect(firstCell?.polygon.length).toBeGreaterThanOrEqual(6);
    expect(firstCell?.bboxMinX).toBeLessThanOrEqual(firstCell?.bboxMaxX ?? 0);
    expect(firstCell?.bboxMinY).toBeLessThanOrEqual(firstCell?.bboxMaxY ?? 0);

    const firstTerrainFeature = renderable.terrainFeatures[0];
    expect(firstTerrainFeature).toBeDefined();
    expect(firstTerrainFeature?.rings.length).toBeGreaterThan(0);
    expect(firstTerrainFeature?.group).toBeGreaterThan(0);
    expect(firstTerrainFeature?.shorelinePackIds).toBeInstanceOf(Uint32Array);
    for (const ring of firstTerrainFeature?.rings ?? []) {
      expect(ring.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("tracks padded focus bounds around land instead of the full world", () => {
    const renderable = buildRenderableWorld(getFixtureWorld());

    let landMinX = Number.POSITIVE_INFINITY;
    let landMinY = Number.POSITIVE_INFINITY;
    let landMaxX = Number.NEGATIVE_INFINITY;
    let landMaxY = Number.NEGATIVE_INFINITY;

    for (const cellId of renderable.landCellIds) {
      const cell = renderable.cells[cellId];
      expect(cell).toBeDefined();
      landMinX = Math.min(landMinX, cell?.bboxMinX ?? 0);
      landMinY = Math.min(landMinY, cell?.bboxMinY ?? 0);
      landMaxX = Math.max(landMaxX, cell?.bboxMaxX ?? 0);
      landMaxY = Math.max(landMaxY, cell?.bboxMaxY ?? 0);
    }

    expect(renderable.focusBounds.minX).toBeLessThanOrEqual(
      Math.max(0, landMinX),
    );
    expect(renderable.focusBounds.minY).toBeLessThanOrEqual(
      Math.max(0, landMinY),
    );
    expect(renderable.focusBounds.maxX).toBeGreaterThanOrEqual(
      Math.min(renderable.width, landMaxX),
    );
    expect(renderable.focusBounds.maxY).toBeGreaterThanOrEqual(
      Math.min(renderable.height, landMaxY),
    );
    expect(
      renderable.focusBounds.maxX - renderable.focusBounds.minX,
    ).toBeLessThanOrEqual(renderable.width);
    expect(
      renderable.focusBounds.maxY - renderable.focusBounds.minY,
    ).toBeLessThanOrEqual(renderable.height);
  });

  it("falls back to province center cells when a state has no center burg", () => {
    const world = getFixtureWorld();
    expect(world.stateCount).toBeGreaterThan(0);

    const stateCenterBurg = world.stateCenterBurg.slice();
    const provinceCenterCell = new Uint32Array(
      Math.max(world.provinceCenterCell.length, 2),
    );
    provinceCenterCell.set(world.provinceCenterCell);
    stateCenterBurg[1] = 0;
    provinceCenterCell[1] = 2;

    const renderable = buildRenderableWorld({
      ...world,
      stateCenterBurg,
      provinceCenterCell,
    });

    const state = renderable.states[0];
    expect(state).toBeDefined();
    expect(state?.centerCell).toBe(2);
    expect(state?.centerX).toBe(world.cellsX[2]);
    expect(state?.centerY).toBe(world.cellsY[2]);
  });
});
