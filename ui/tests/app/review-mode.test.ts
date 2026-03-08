import { describe, expect, it } from "vitest";
import { buildRenderableWorld } from "../../adapter";
import {
  fitCameraToRenderable,
  readReviewMode,
  shouldPersistUiSession,
} from "../../app/review-mode";
import { getFixtureWorld } from "../helpers/world-fixture";

describe("review mode", () => {
  it("parses terrain review from the query string", () => {
    expect(readReviewMode("?review=terrain")).toBe("terrain");
    expect(readReviewMode("?review=terrain-review")).toBe("terrain");
    expect(readReviewMode("?review=unknown")).toBe("default");
    expect(readReviewMode("")).toBe("default");
  });

  it("disables persisted sessions in terrain review mode", () => {
    expect(shouldPersistUiSession("default")).toBe(true);
    expect(shouldPersistUiSession("terrain")).toBe(false);
  });

  it("fits terrain review to the full world instead of land-only bounds", () => {
    const renderable = buildRenderableWorld(getFixtureWorld());
    const width = 960;
    const height = 720;
    const defaultCamera = fitCameraToRenderable(
      width,
      height,
      renderable,
      "default",
    );
    const terrainCamera = fitCameraToRenderable(
      width,
      height,
      renderable,
      "terrain",
    );

    expect(terrainCamera.x).toBeCloseTo(
      (width - renderable.width * terrainCamera.zoom) / 2,
      5,
    );
    expect(terrainCamera.y).toBeCloseTo(
      (height - renderable.height * terrainCamera.zoom) / 2,
      5,
    );
    expect(
      terrainCamera.x !== defaultCamera.x ||
        terrainCamera.y !== defaultCamera.y,
    ).toBe(true);
  });
});
