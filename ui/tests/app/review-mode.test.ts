import { describe, expect, it } from "vitest";
import {
  PHYSICAL_CORE_STYLE,
  PHYSICAL_CORE_VISIBILITY,
  isLockedReviewMode,
  isRenderParityReviewMode,
  readReviewMaskLayer,
  readReviewMode,
  readTerrainGeometryMode,
} from "../../app/review-mode";

describe("review mode helpers", () => {
  it("parses supported review modes", () => {
    expect(readReviewMode("?review=terrain")).toBe("terrain");
    expect(readReviewMode("?review=render-parity")).toBe("render-parity");
    expect(readReviewMode("?review=unknown")).toBeNull();
    expect(readReviewMaskLayer("?maskLayer=coastline")).toBe("coastline");
    expect(readReviewMaskLayer("?maskLayer=rivers")).toBe("rivers");
    expect(readReviewMaskLayer("?maskLayer=unknown")).toBeNull();
  });

  it("parses terrain geometry mode", () => {
    expect(readTerrainGeometryMode("?terrainGeometry=packed")).toBe("packed");
    expect(readTerrainGeometryMode("?terrainGeometry=grid")).toBe("grid");
    expect(readTerrainGeometryMode("")).toBe("grid");
  });

  it("identifies locked review modes", () => {
    expect(isLockedReviewMode(null)).toBe(false);
    expect(isLockedReviewMode("terrain")).toBe(true);
    expect(isLockedReviewMode("render-parity")).toBe(true);
    expect(isRenderParityReviewMode("terrain")).toBe(false);
    expect(isRenderParityReviewMode("render-parity")).toBe(true);
  });

  it("defines the physical-core parity stack", () => {
    expect(PHYSICAL_CORE_VISIBILITY).toEqual({
      physical: true,
      biomes: false,
      rivers: true,
      cultures: false,
      settlements: false,
      states: false,
      routes: false,
      provinces: false,
      religions: false,
      military: false,
      markers: false,
      zones: false,
      labels: false,
    });
    expect(PHYSICAL_CORE_STYLE.oceanColor).toBe("#8ea9d4");
    expect(PHYSICAL_CORE_STYLE.riverColor).toBe("#6c98d8");
  });
});
