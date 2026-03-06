import type { LayerVisibilityState, StylePreset } from "./types";

export const DEFAULT_VISIBILITY: LayerVisibilityState = {
  physical: true,
  biomes: true,
  rivers: true,
  cultures: false,
  settlements: true,
  states: true,
  routes: true,
  provinces: false,
  religions: false,
  military: false,
  markers: false,
  zones: false,
  labels: true,
};

export const PRESET_VISIBILITY: Readonly<Record<string, LayerVisibilityState>> = {
  physical: {
    ...DEFAULT_VISIBILITY,
    states: false,
    routes: false,
    provinces: false,
    religions: false,
    military: false,
    markers: false,
    zones: false,
  },
  political: {
    ...DEFAULT_VISIBILITY,
    biomes: false,
    cultures: false,
    settlements: true,
    states: true,
    routes: true,
    provinces: true,
    religions: true,
    military: true,
    markers: true,
    zones: true,
  },
  all: {
    physical: true,
    biomes: true,
    rivers: true,
    cultures: true,
    settlements: true,
    states: true,
    routes: true,
    provinces: true,
    religions: true,
    military: true,
    markers: true,
    zones: true,
    labels: true,
  },
};

export const DEFAULT_STYLE: StylePreset = {
  oceanColor: "#adc8ee",
  landColorLow: "#8cbf7d",
  landColorHigh: "#3e7f4f",
  riverColor: "#2e5ea8",
  stateLineColor: "#e07a5f",
  provinceLineColor: "#f2cc8f",
  burgColor: "#102a43",
  militaryColor: "#8f2d56",
  markerColor: "#0f766e",
  zoneColor: "#f4a261",
};

export const clampZoom = (zoom: number): number => {
  if (zoom < 0.25) {
    return 0.25;
  }

  if (zoom > 8) {
    return 8;
  }

  return zoom;
};
