import type { LayerVisibilityState, StylePreset } from "../adapter";
import type { TerrainGeometryMode } from "../renderer";

export type ReviewMode = null | "terrain" | "render-parity";
export type ReviewMaskLayer = null | "coastline" | "rivers";

export const PHYSICAL_CORE_VISIBILITY: LayerVisibilityState = {
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
};

export const PHYSICAL_CORE_STYLE: StylePreset = {
  oceanColor: "#8ea9d4",
  landColorLow: "#c6d6a4",
  landColorHigh: "#839d6b",
  riverColor: "#6c98d8",
  stateLineColor: "#c57b67",
  provinceLineColor: "#d8c89e",
  burgColor: "#24344f",
  militaryColor: "#8f2d56",
  markerColor: "#0f766e",
  zoneColor: "#f4a261",
};

export const readTerrainGeometryMode = (
  search: string,
): TerrainGeometryMode => {
  const params = new URLSearchParams(search);
  return params.get("terrainGeometry") === "packed" ? "packed" : "grid";
};

export const readReviewMode = (search: string): ReviewMode => {
  const params = new URLSearchParams(search);
  const value = params.get("review");
  return value === "terrain" || value === "render-parity" ? value : null;
};

export const readReviewMaskLayer = (search: string): ReviewMaskLayer => {
  const params = new URLSearchParams(search);
  const value = params.get("maskLayer");
  return value === "coastline" || value === "rivers" ? value : null;
};

export const isLockedReviewMode = (mode: ReviewMode): boolean => mode !== null;

export const isRenderParityReviewMode = (mode: ReviewMode): boolean =>
  mode === "render-parity";
