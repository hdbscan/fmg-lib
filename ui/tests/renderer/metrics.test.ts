import { describe, expect, it } from "vitest";
import { DEFAULT_VISIBILITY } from "../../adapter";
import { estimateRenderWorkload } from "../../renderer";
import { getFixtureRenderableWorld } from "../helpers/world-fixture";

describe("estimateRenderWorkload", () => {
  it("accounts for visible polygon, edge, route, point, and label work", () => {
    const renderable = getFixtureRenderableWorld();
    const metrics = estimateRenderWorkload(renderable, DEFAULT_VISIBILITY);

    expect(metrics.polygonDraws).toBe(renderable.landCellIds.length);
    expect(metrics.edgeChecks).toBeGreaterThan(0);
    expect(metrics.routeDraws).toBe(renderable.routes.length);
    expect(metrics.pointDraws).toBe(renderable.burgs.length);
    expect(metrics.labelDraws).toBe(
      renderable.states.length + Math.min(renderable.burgs.length, 180),
    );
  });

  it("adds full-cell polygon passes for culture, religion, and zone overlays", () => {
    const renderable = getFixtureRenderableWorld();
    const metrics = estimateRenderWorkload(renderable, {
      ...DEFAULT_VISIBILITY,
      physical: false,
      biomes: false,
      rivers: false,
      cultures: true,
      religions: true,
      zones: true,
      settlements: false,
      states: false,
      routes: false,
      labels: false,
    });

    expect(metrics.polygonDraws).toBe(renderable.cells.length);
    expect(metrics.edgeChecks).toBe(0);
    expect(metrics.routeDraws).toBe(0);
    expect(metrics.pointDraws).toBe(0);
    expect(metrics.labelDraws).toBe(0);
  });
});
