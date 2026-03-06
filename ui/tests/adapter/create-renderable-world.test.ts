import { describe, expect, it } from "vitest";
import { buildRenderableWorld } from "../../adapter";
import { getFixtureWorld } from "../helpers/world-fixture";

describe("buildRenderableWorld", () => {
  it("derives render collections from the generated world", () => {
    const world = getFixtureWorld();
    const renderable = buildRenderableWorld(world);

    expect(renderable.width).toBe(world.width);
    expect(renderable.height).toBe(world.height);
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

    const firstCell = renderable.cells[0];
    expect(firstCell).toBeDefined();
    expect(firstCell?.polygon.length).toBeGreaterThanOrEqual(6);
    expect(firstCell?.bboxMinX).toBeLessThanOrEqual(firstCell?.bboxMaxX ?? 0);
    expect(firstCell?.bboxMinY).toBeLessThanOrEqual(firstCell?.bboxMaxY ?? 0);
  });

  it("falls back to province center cells when a state has no center burg", () => {
    const world = getFixtureWorld();
    expect(world.stateCount).toBeGreaterThan(0);

    const stateCenterBurg = world.stateCenterBurg.slice();
    const provinceCenterCell = world.provinceCenterCell.slice();
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
